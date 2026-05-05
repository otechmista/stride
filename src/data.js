function extractDescription(rawJson) {
  try {
    const doc = JSON.parse(rawJson)?.fields?.description;
    if (!doc) return null;
    if (typeof doc === 'string') {
      const t = doc.trim();
      return t && t !== '[]' && t !== '{}' ? t.slice(0, 800) : null;
    }
    const texts = [];
    function walk(node) {
      if (!node) return;
      if (node.type === 'text' && node.text) texts.push(node.text);
      if (node.type === 'hardBreak') texts.push('\n');
      if (Array.isArray(node.content)) node.content.forEach(walk);
    }
    walk(doc);
    const result = texts.join('').replace(/\n{3,}/g, '\n\n').trim();
    return result.length > 0 ? result.slice(0, 800) : null;
  } catch { return null; }
}

export function registerDataRoutes(app, db) {
  app.get('/api/data/issues', (request, response) => {
    const page = Math.max(1, Number(request.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(request.query.limit || 20)));
    const search = String(request.query.search || '').trim();
    const type = String(request.query.type || '').trim();
    const status = String(request.query.status || '').trim();
    const offset = (page - 1) * limit;

    const conditions = ['1=1'];
    const params = [];

    if (search) {
      conditions.push('(summary like ? or issue_key like ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (type) {
      conditions.push('lower(issue_type) = lower(?)');
      params.push(type);
    }
    if (status) {
      conditions.push('lower(status) like lower(?)');
      params.push(`%${status}%`);
    }

    const where = `where ${conditions.join(' and ')}`;
    const total = db.prepare(`select count(*) as count from jira_issues ${where}`).get(...params).count;
    const rows = db.prepare(
      `select id, issue_key, summary, issue_type, status, created_at, resolved_at, labels, raw_json
       from jira_issues ${where} order by created_at desc limit ? offset ?`
    ).all(...params, limit, offset);

    const issues = rows.map(({ raw_json, ...i }) => {
      let assignee = null, reporter = null;
      try {
        const f = JSON.parse(raw_json)?.fields || {};
        assignee = f.assignee?.displayName || null;
        reporter = f.reporter?.displayName || null;
      } catch {}
      return { ...i, description: extractDescription(raw_json), assignee, reporter };
    });
    response.json({ issues, total, page, limit, pages: Math.ceil(total / limit) });
  });

  app.get('/api/data/prs', (request, response) => {
    const page = Math.max(1, Number(request.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(request.query.limit || 20)));
    const search = String(request.query.search || '').trim();
    const prState = String(request.query.state || '').trim();
    const offset = (page - 1) * limit;

    const conditions = ['1=1'];
    const params = [];

    if (search) {
      conditions.push('title like ?');
      params.push(`%${search}%`);
    }
    if (prState) {
      conditions.push('state = ?');
      params.push(prState);
    }

    const where = `where ${conditions.join(' and ')}`;
    const total = db.prepare(`select count(*) as count from github_pull_requests ${where}`).get(...params).count;
    const prs = db.prepare(
      `select id, number, title, state, base_ref, created_at, merged_at, closed_at, html_url
       from github_pull_requests ${where} order by created_at desc limit ? offset ?`
    ).all(...params, limit, offset);

    response.json({ prs, total, page, limit, pages: Math.ceil(total / limit) });
  });

  app.get('/api/data/deployments', (request, response) => {
    const page = Math.max(1, Number(request.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(request.query.limit || 20)));
    const search = String(request.query.search || '').trim();
    const offset = (page - 1) * limit;

    const conditions = ['1=1'];
    const params = [];

    conditions.push("merged_at is not null");
    conditions.push("lower(coalesce(base_ref, '')) in ('main', 'master')");

    if (search) {
      conditions.push('(title like ? or base_ref like ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const where = `where ${conditions.join(' and ')}`;
    const total = db.prepare(`select count(*) as count from github_pull_requests ${where}`).get(...params).count;
    const rows = db.prepare(
      `select id, number, title, base_ref, state, merged_at, html_url
       from github_pull_requests ${where} order by merged_at desc limit ? offset ?`
    ).all(...params, limit, offset);
    const deployments = rows.map((row) => ({
      id: row.id,
      number: row.number,
      title: row.title,
      environment: row.base_ref,
      state: 'merge main',
      created_at: row.merged_at,
      updated_at: row.merged_at,
      html_url: row.html_url
    }));

    response.json({ deployments, total, page, limit, pages: Math.ceil(total / limit) });
  });
}
