function monthKey(value) {
  if (!value) return null;
  return value.slice(0, 7);
}

function currentYear() {
  return new Date().getFullYear();
}

function isReportableMonth(month) {
  return month?.startsWith(`${currentYear()}-`);
}

function reportableMonths() {
  const year = currentYear();
  const previousCompleteMonth = new Date().getMonth();
  return Array.from({ length: previousCompleteMonth }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
}

function addMonth(months, value) {
  const month = monthKey(value);
  if (month && isReportableMonth(month)) months.add(month);
}

function monthsBetween(start, end) {
  if (!start || !end) return null;
  return (new Date(end).getTime() - new Date(start).getTime()) / 86400000;
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function percentage(part, total) {
  if (!total) return null;
  return (part / total) * 100;
}

function isBug(issue) {
  return /bug|defeito|erro|falha|incident|incidente/i.test(`${issue.issue_type} ${issue.summary} ${issue.labels}`);
}

function isDone(issue) {
  return Boolean(issue.resolved_at) || /done|closed|resolved|conclu|finaliz|feito|resolvido|fechado/i.test(issue.status || '');
}

function statusGroup(status) {
  const value = String(status || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  if (/done|closed|resolved|conclu|finaliz|feito|resolvido|fechado|cancel|descart|entrega|publica/.test(value)) return 'Feito';
  if (/progress|andamento|doing|development|desenvolv|execu|implement|producao|homolog|review|revis|pull request|qa|test|valid|block|bloque|analise|refin|dev|fazendo|dor/.test(value)) return 'Fazendo';
  return 'A fazer';
}

function isMainBranchPullRequest(pr) {
  return /^(main|master)$/i.test(pr.base_ref || '');
}

export function createMetricsRepository(db) {
  return {
    getPullRequests() {
      return db.prepare('select * from github_pull_requests').all();
    },
    getDeployments() {
      return db.prepare('select * from github_deployments').all();
    },
    getIssues() {
      return db.prepare('select * from jira_issues').all();
    }
  };
}

export function createMetricsService(repository) {
  return {
    getMonthlyMetrics() {
      const prs = repository.getPullRequests();
      const deployments = repository.getDeployments();
      const issues = repository.getIssues();
      if (!issues.length && !prs.length && !deployments.length) return [];

      const months = new Set();

      for (const deployment of deployments) addMonth(months, deployment.created_at);
      for (const pr of prs) addMonth(months, pr.merged_at || pr.closed_at);
      for (const issue of issues) {
        addMonth(months, issue.created_at);
        addMonth(months, issue.resolved_at);
      }
      for (const month of reportableMonths()) months.add(month);

      const reportable = new Set(reportableMonths());
      const series = [...months].filter((month) => reportable.has(month)).sort().map((month) => {
        const createdIssues = issues.filter((issue) => monthKey(issue.created_at) === month);
        const resolvedIssues = issues.filter((issue) => monthKey(issue.resolved_at) === month);
        const resolvedBugs = resolvedIssues.filter(isBug);
        const mergedPullRequests = prs.filter((pr) => monthKey(pr.merged_at) === month);
        const mainMerges = mergedPullRequests.filter(isMainBranchPullRequest);
        const openAtMonthEnd = issues.filter((issue) => {
          const createdMonth = monthKey(issue.created_at);
          const resolvedMonth = monthKey(issue.resolved_at);
          if (!createdMonth || createdMonth > month) return false;
          if (resolvedMonth) return resolvedMonth > month;
          return !isDone(issue);
        });

        return {
          month,
          leadTime: average(resolvedIssues.map((issue) => monthsBetween(issue.created_at, issue.resolved_at))),
          throughput: resolvedIssues.length,
          fixedBugs: resolvedBugs.length,
          createdCards: createdIssues.length,
          backlogBugs: openAtMonthEnd.filter(isBug).length,
          backlogCards: openAtMonthEnd.length,
          deployments: mainMerges.length,
          mergedPullRequests: mergedPullRequests.length
        };
      });

      return series;
    }
  };
}

function mockSeries() {
  const year = currentYear();
  return [
    { month: `${year}-01`, leadTime: 7.2, throughput: 48, fixedBugs: 12, createdCards: 61, backlogBugs: 28, backlogCards: 139, deployments: 7, mergedPullRequests: 34 },
    { month: `${year}-02`, leadTime: 6.7, throughput: 51, fixedBugs: 14, createdCards: 54, backlogBugs: 24, backlogCards: 132, deployments: 9, mergedPullRequests: 38 },
    { month: `${year}-03`, leadTime: 5.9, throughput: 56, fixedBugs: 18, createdCards: 59, backlogBugs: 21, backlogCards: 124, deployments: 12, mergedPullRequests: 43 },
    { month: `${year}-04`, leadTime: 5.1, throughput: 63, fixedBugs: 20, createdCards: 66, backlogBugs: 18, backlogCards: 118, deployments: 14, mergedPullRequests: 49 },
    { month: `${year}-05`, leadTime: 4.6, throughput: 68, fixedBugs: 22, createdCards: 64, backlogBugs: 16, backlogCards: 109, deployments: 16, mergedPullRequests: 52 }
  ].filter((item) => reportableMonths().includes(item.month));
}

export function presentStatusDistribution(issues = []) {
  const reportable = reportableMonths();
  const lastMonth = reportable.at(-1);
  const relevantIssues = issues.filter((issue) => {
    const createdMonth = monthKey(issue.created_at);
    if (!createdMonth || !lastMonth) return false;
    return createdMonth <= lastMonth;
  });
  const total = relevantIssues.length;
  const groups = new Map();

  for (const issue of relevantIssues) {
    const group = statusGroup(issue.status);
    groups.set(group, (groups.get(group) || 0) + 1);
  }

  const order = ['A fazer', 'Fazendo', 'Feito'];
  const rows = [...groups.entries()]
    .map(([label, count]) => ({
      label,
      count,
      percent: total ? (count / total) * 100 : 0
    }))
    .sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));

  const top = rows.slice(0, 8);
  const rest = rows.slice(8);
  const restCount = rest.reduce((sum, row) => sum + row.count, 0);
  if (restCount) {
    top.push({
      label: 'Outros',
      count: restCount,
      percent: total ? (restCount / total) * 100 : 0
    });
  }
  return top;
}

function mockStatusDistribution() {
  return [
    { label: 'A fazer', count: 42, percent: 34.1 },
    { label: 'Fazendo', count: 50, percent: 40.7 },
    { label: 'Feito', count: 31, percent: 25.2 }
  ];
}

export function presentMetrics(series, issues = []) {
  const months = new Set(reportableMonths());
  const currentYearSeries = series.filter((item) => months.has(item.month));
  const hasRealValues = currentYearSeries.some((item) =>
    ['leadTime', 'throughput', 'fixedBugs', 'createdCards', 'backlogBugs', 'backlogCards', 'deployments', 'mergedPullRequests'].some((key) => item[key] !== null)
  );
  const source = hasRealValues ? 'real' : 'mock';
  const visibleSeries = hasRealValues ? currentYearSeries : mockSeries();
  const realStatusDistribution = presentStatusDistribution(issues);
  const cards = [
    { key: 'leadTime', label: 'Lead time', suffix: 'dias' },
    { key: 'throughput', label: 'Throughput', suffix: 'cards' },
    { key: 'fixedBugs', label: 'Bugs corrigidos', suffix: 'bugs' },
    { key: 'createdCards', label: 'Cards criados', suffix: 'cards' },
    { key: 'backlogBugs', label: 'Bugs em backlog', suffix: 'bugs' },
    { key: 'backlogCards', label: 'Cards em backlog', suffix: 'cards' },
    { key: 'deployments', label: 'Deploys (merge main)', suffix: 'deploys' },
    { key: 'mergedPullRequests', label: 'PRs mergeados', suffix: 'PRs' }
  ].map((metric) => {
    const values = visibleSeries.map((item) => item[metric.key]).filter((value) => value !== null);
    const latest = [...visibleSeries].reverse().find((item) => item[metric.key] !== null);
    if (!values.length || !latest) return null;
    return {
      ...metric,
      value: latest[metric.key],
      visible: true
    };
  }).filter(Boolean);

  return {
    cards,
    series: visibleSeries,
    statusDistribution: realStatusDistribution.length ? realStatusDistribution : mockStatusDistribution(),
    source,
    isMock: source === 'mock'
  };
}

export function registerMetricsRoutes(app, db) {
  const service = createMetricsService(createMetricsRepository(db));
  const repository = createMetricsRepository(db);

  app.get('/api/metrics', (request, response) => {
    response.json(presentMetrics(service.getMonthlyMetrics(), repository.getIssues()));
  });
}
