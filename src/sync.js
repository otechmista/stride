import { createConfigRepository, createConfigService } from './config.js';

function authBasic(email, token) {
  return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 240)}`);
  }
  return response.json();
}

async function fetchJiraIssues(config, headers, jql) {
  const allIssues = [];
  const pageSize = 100;
  const maxIssues = 20000;
  let nextPageToken = null;

  while (allIssues.length < maxIssues) {
    const url = new URL('/rest/api/3/search/jql', config.jiraBaseUrl);
    const body = {
      jql,
      maxResults: pageSize,
      fields: ['summary', 'description', 'issuetype', 'status', 'created', 'resolutiondate', 'updated', 'labels', 'assignee', 'reporter'],
      fieldsByKeys: false
    };

    if (nextPageToken) body.nextPageToken = nextPageToken;

    const data = await fetchJson(url, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const issues = data.issues || [];
    allIssues.push(...issues);

    nextPageToken = data.nextPageToken || null;
    if (data.isLast || !nextPageToken || issues.length === 0) break;
  }

  return allIssues;
}

async function fetchGithubPages(url, headers, maxPages = 5) {
  const rows = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const separator = url.includes('?') ? '&' : '?';
    const pageUrl = `${url}${separator}per_page=100&page=${page}`;
    const data = await fetchJson(pageUrl, { headers });
    rows.push(...data);
    if (data.length < 100) break;
  }
  return rows;
}

async function fetchGithubPagesOptional(url, headers, maxPages = 5) {
  try {
    return { rows: await fetchGithubPages(url, headers, maxPages), error: null };
  } catch (error) {
    return { rows: [], error };
  }
}

async function fetchGithubRepos(config, headers) {
  const orgUrl = `https://api.github.com/orgs/${config.githubOwner}/repos?type=all&sort=updated&direction=desc`;
  const userUrl = 'https://api.github.com/user/repos?affiliation=owner,collaborator,organization_member&sort=updated&direction=desc';
  const repos = await fetchGithubPages(orgUrl, headers, 10).catch(async (error) => {
    if (!/404/.test(error.message)) throw error;
    return fetchGithubPages(userUrl, headers, 10);
  });

  return repos
    .filter((repo) => repo.owner?.login?.toLowerCase() === config.githubOwner.toLowerCase())
    .map((repo) => ({ owner: repo.owner.login, repo: repo.name }));
}

export function createSyncRepository(db) {
  return {
    saveJiraIssues(issues) {
      const statement = db.prepare(`
        insert into jira_issues (id, issue_key, summary, issue_type, status, created_at, resolved_at, updated_at, labels, raw_json)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(id) do update set
          issue_key = excluded.issue_key,
          summary = excluded.summary,
          issue_type = excluded.issue_type,
          status = excluded.status,
          created_at = excluded.created_at,
          resolved_at = excluded.resolved_at,
          updated_at = excluded.updated_at,
          labels = excluded.labels,
          raw_json = excluded.raw_json
      `);
      db.transaction((items) => items.forEach((item) => statement.run(
        item.id,
        item.issue_key,
        item.summary,
        item.issue_type,
        item.status,
        item.created_at,
        item.resolved_at,
        item.updated_at,
        item.labels,
        item.raw_json
      )))(issues);
    },
    saveGithubPullRequests(pullRequests) {
      const statement = db.prepare(`
        insert into github_pull_requests (id, number, title, state, base_ref, created_at, merged_at, closed_at, html_url, raw_json)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(id) do update set
          number = excluded.number,
          title = excluded.title,
          state = excluded.state,
          base_ref = excluded.base_ref,
          created_at = excluded.created_at,
          merged_at = excluded.merged_at,
          closed_at = excluded.closed_at,
          html_url = excluded.html_url,
          raw_json = excluded.raw_json
      `);
      db.transaction((items) => items.forEach((item) => statement.run(
        item.id,
        item.number,
        item.title,
        item.state,
        item.base_ref,
        item.created_at,
        item.merged_at,
        item.closed_at,
        item.html_url,
        item.raw_json
      )))(pullRequests);
    },
    saveGithubDeployments(deployments) {
      const statement = db.prepare(`
        insert into github_deployments (id, environment, state, created_at, updated_at, raw_json)
        values (?, ?, ?, ?, ?, ?)
        on conflict(id) do update set
          environment = excluded.environment,
          state = excluded.state,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          raw_json = excluded.raw_json
      `);
      db.transaction((items) => items.forEach((item) => statement.run(
        item.id,
        item.environment,
        item.state,
        item.created_at,
        item.updated_at,
        item.raw_json
      )))(deployments);
    },
    recordRun(source, status, message) {
      db.prepare('insert into sync_runs (source, status, message) values (?, ?, ?)').run(source, status, message);
    },
    lastRuns() {
      return db.prepare(`
        select source, status, message, created_at
        from sync_runs
        order by created_at desc
        limit 10
      `).all();
    },
    clearSyncedData() {
      db.transaction(() => {
        db.prepare('delete from jira_issues').run();
        db.prepare('delete from github_pull_requests').run();
        db.prepare('delete from github_deployments').run();
        db.prepare('delete from sync_runs').run();
      })();
    }
  };
}

export function createSyncService(configService, repository) {
  async function syncJira() {
    const config = configService.getConfig();
    if (!config.jiraBaseUrl || !config.jiraEmail || !config.jiraApiToken) {
      return { source: 'jira', skipped: true, count: 0, message: 'Jira não configurado' };
    }

    const yearStart = `${new Date().getFullYear()}-01-01`;
    const projectKey = config.jiraProjectKey?.trim();

    // active project scope: specific key or only open (non-archived) projects
    const projectScope = projectKey
      ? `project = "${projectKey}"`
      : `project in openProjects()`;

    // items resolved this year (for metrics) OR still open (for backlog)
    // statusCategory not in (Done) covers open items that may lack a resolutiondate
    const itemScope = `(resolutiondate >= "${yearStart}" OR statusCategory not in (Done))`;

    const jql = `${projectScope} AND ${itemScope} ORDER BY updated DESC`;
    const headers = {
      authorization: authBasic(config.jiraEmail, config.jiraApiToken),
      accept: 'application/json'
    };
    const jiraIssues = await fetchJiraIssues(config, headers, jql);

    const issues = jiraIssues.map((issue) => ({
      id: issue.id,
      issue_key: issue.key,
      summary: issue.fields?.summary || '',
      issue_type: issue.fields?.issuetype?.name || '',
      status: issue.fields?.status?.name || '',
      created_at: issue.fields?.created || null,
      resolved_at: issue.fields?.resolutiondate || null,
      updated_at: issue.fields?.updated || null,
      labels: JSON.stringify(issue.fields?.labels || []),
      raw_json: JSON.stringify(issue)
    }));

    repository.saveJiraIssues(issues);
    return {
      source: 'jira',
      skipped: false,
      count: issues.length,
      message: projectKey ? 'Jira sincronizado' : 'Jira sincronizado em todos os projetos acessiveis'
    };
  }

  async function syncGithub() {
    const config = configService.getConfig();
    if (!config.githubToken || !config.githubOwner) {
      return { source: 'github', skipped: true, count: 0, message: 'GitHub não configurado' };
    }

    const headers = {
      authorization: `Bearer ${config.githubToken}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'stride-dora'
    };
    const repos = await fetchGithubRepos(config, headers);
    const pulls = [];
    const deployments = [];

    for (const repo of repos) {
      const base = `https://api.github.com/repos/${repo.owner}/${repo.repo}`;
      const [repoPulls, repoDeployments] = await Promise.all([
        fetchGithubPages(`${base}/pulls?state=closed&sort=updated&direction=desc`, headers),
        fetchGithubPagesOptional(`${base}/deployments`, headers)
      ]);
      pulls.push(...repoPulls);
      deployments.push(...repoDeployments.rows);
    }

    const pullRows = pulls.map((pr) => ({
      id: pr.id,
      number: pr.number,
      title: pr.title || '',
      state: pr.state || '',
      base_ref: pr.base?.ref || '',
      created_at: pr.created_at || null,
      merged_at: pr.merged_at || null,
      closed_at: pr.closed_at || null,
      html_url: pr.html_url || '',
      raw_json: JSON.stringify(pr)
    }));

    const deploymentRows = deployments.map((deployment) => ({
      id: deployment.id,
      environment: deployment.environment || '',
      state: deployment.state || '',
      created_at: deployment.created_at || null,
      updated_at: deployment.updated_at || null,
      raw_json: JSON.stringify(deployment)
    }));

    repository.saveGithubPullRequests(pullRows);
    repository.saveGithubDeployments(deploymentRows);
    return {
      source: 'github',
      skipped: false,
      count: pullRows.length + deploymentRows.length,
      message: `GitHub sincronizado (${repos.length} repo${repos.length === 1 ? '' : 's'}, ${pullRows.length} PRs, ${deploymentRows.length} deploys)`
    };
  }

  return {
    async syncAll() {
      const results = [];
      for (const sync of [syncJira, syncGithub]) {
        try {
          const result = await sync();
          repository.recordRun(result.source, result.skipped ? 'skipped' : 'success', result.message);
          results.push(result);
        } catch (error) {
          const source = sync.name.replace('sync', '').toLowerCase();
          repository.recordRun(source, 'error', error.message);
          results.push({ source, skipped: false, count: 0, message: error.message, error: true });
        }
      }
      return { results, lastRuns: repository.lastRuns() };
    },
    async resyncAll() {
      repository.clearSyncedData();
      repository.recordRun('system', 'success', 'Dados locais apagados para resync');
      return this.syncAll();
    },
    getLastRuns() {
      return repository.lastRuns();
    }
  };
}

export function registerSyncRoutes(app, db) {
  const configService = createConfigService(createConfigRepository(db));
  const service = createSyncService(configService, createSyncRepository(db));

  app.post('/api/sync', async (request, response) => {
    response.json(await service.syncAll());
  });

  app.post('/api/resync', async (request, response) => {
    response.json(await service.resyncAll());
  });

  app.get('/api/sync/runs', (request, response) => {
    response.json({ runs: service.getLastRuns() });
  });
}
