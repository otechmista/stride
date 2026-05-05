const MODELS = [
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
  { id: 'openai/gpt-4o', label: 'GPT-4o' },
  { id: 'anthropic/claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  { id: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'google/gemini-flash-1.5', label: 'Gemini Flash 1.5' },
  { id: 'meta-llama/llama-3.1-8b-instruct:free', label: 'Llama 3.1 8B (free)' }
];

function isBug(issue) {
  return /bug|defeito|erro|falha|incident|incidente/i.test(`${issue.issue_type || ''} ${issue.summary || ''} ${issue.labels || ''}`);
}

function monthKey(value) {
  return value ? String(value).slice(0, 7) : null;
}

function buildContext(db) {
  const issues = db.prepare('select issue_type, summary, status, created_at, resolved_at, labels from jira_issues').all();
  const prs = db.prepare('select state, base_ref, created_at, merged_at from github_pull_requests').all();

  const total = issues.length;
  const resolved = issues.filter((i) => i.resolved_at).length;
  const totalBugs = issues.filter(isBug).length;
  const totalPRs = prs.length;
  const merged = prs.filter((p) => p.merged_at).length;
  const mainMerges = prs.filter((p) => p.merged_at && /^(main|master)$/i.test(p.base_ref || '')).length;

  // ── Monthly breakdown ──────────────────────────────────────────────────
  const monthlyIssues = {};
  for (const issue of issues) {
    const m = monthKey(issue.created_at);
    if (!m) continue;
    if (!monthlyIssues[m]) monthlyIssues[m] = { created: 0, resolved: 0, bugsCreated: 0, bugsResolved: 0, leadTimeDays: [] };
    monthlyIssues[m].created += 1;
    if (isBug(issue)) monthlyIssues[m].bugsCreated += 1;
    const rm = monthKey(issue.resolved_at);
    if (rm) {
      if (!monthlyIssues[rm]) monthlyIssues[rm] = { created: 0, resolved: 0, bugsCreated: 0, bugsResolved: 0, leadTimeDays: [] };
      monthlyIssues[rm].resolved += 1;
      if (isBug(issue)) monthlyIssues[rm].bugsResolved += 1;
      const days = Math.round((new Date(issue.resolved_at) - new Date(issue.created_at)) / 86400000);
      if (Number.isFinite(days) && days >= 0) monthlyIssues[rm].leadTimeDays.push(days);
    }
  }

  const monthlyPRs = {};
  for (const pr of prs) {
    const m = monthKey(pr.merged_at || pr.created_at);
    if (!m) continue;
    if (!monthlyPRs[m]) monthlyPRs[m] = { merged: 0, mainMerges: 0 };
    if (pr.merged_at) {
      monthlyPRs[m].merged += 1;
      if (/^(main|master)$/i.test(pr.base_ref || '')) monthlyPRs[m].mainMerges += 1;
    }
  }

  const allMonths = [...new Set([...Object.keys(monthlyIssues), ...Object.keys(monthlyPRs)])].sort();
  const monthlyTable = allMonths.map((m) => {
    const i = monthlyIssues[m] || { created: 0, resolved: 0, bugsCreated: 0, bugsResolved: 0, leadTimeDays: [] };
    const p = monthlyPRs[m] || { merged: 0, mainMerges: 0 };
    const avgLead = i.leadTimeDays.length
      ? Math.round(i.leadTimeDays.reduce((a, b) => a + b, 0) / i.leadTimeDays.length)
      : null;
    return `  ${m}: issues criadas=${i.created} resolvidas=${i.resolved} bugs_criados=${i.bugsCreated} bugs_resolvidos=${i.bugsResolved} lead_time_medio=${avgLead !== null ? avgLead + 'd' : 'n/a'} PRs_mergeados=${p.merged} deploys_main=${p.mainMerges}`;
  }).join('\n');

  // ── Status distribution ────────────────────────────────────────────────
  const statusCounts = {};
  for (const issue of issues) {
    const s = issue.status || 'sem status';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }
  const topStatuses = Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([s, n]) => `${s}: ${n}`)
    .join(' | ');

  const resolvedPct = total ? Math.round((resolved / total) * 100) : 0;
  const bugPct = total ? Math.round((totalBugs / total) * 100) : 0;
  const failureRate = mainMerges ? Math.round((totalBugs / mainMerges) * 100) : 0;

  return `=== Dados do time extraídos do banco (${new Date().toLocaleDateString('pt-BR')}) ===

RESUMO GERAL
- Issues Jira: ${total} total | ${resolved} resolvidas (${resolvedPct}%) | ${totalBugs} bugs (${bugPct}%) | ${total - resolved} em aberto
- Pull Requests: ${totalPRs} total | ${merged} mergeados | ${mainMerges} na main/master
- Change Failure Rate estimado: ${failureRate}% (bugs / deploys na main)
- Status mais frequentes: ${topStatuses || 'nenhum dado'}

HISTÓRICO MENSAL (use esses dados para responder perguntas temporais)
${monthlyTable || '  nenhum dado mensal disponível'}

Responda sempre com base nos números acima. Se perguntado sobre um mês específico, consulte a tabela acima.`;
}

export function registerAiRoutes(app, db) {
  app.get('/api/ai/models', (_request, response) => {
    response.json({ models: MODELS });
  });

  app.post('/api/ai/chat', async (request, response) => {
    const { messages = [], model = 'openai/gpt-4o-mini', includeContext = true } = request.body;

    if (!Array.isArray(messages) || !messages.length) {
      return response.status(400).json({ error: 'Nenhuma mensagem enviada.' });
    }

    const apiKeyRow = db.prepare("select value from settings where key = 'openrouterApiKey'").get();
    const apiKey = apiKeyRow?.value?.trim();

    if (!apiKey) {
      return response.status(400).json({ error: 'Chave OpenRouter não configurada. Vá em Configurações e adicione sua chave.' });
    }

    let systemContent = 'Você é um assistente especializado em métricas DORA (Deployment Frequency, Lead Time for Changes, Change Failure Rate, Time to Restore) e engenharia de software. Analise os dados do time e forneça insights práticos e acionáveis em português brasileiro. Seja direto, use dados concretos quando disponíveis e sugira melhorias específicas.';

    if (includeContext) {
      systemContent += '\n\n' + buildContext(db);
    }

    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Stride DORA'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemContent }, ...messages]
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      return response.status(aiResponse.status).json({ error: `Erro OpenRouter (${aiResponse.status}): ${errorText}` });
    }

    const data = await aiResponse.json();
    const content = data.choices?.[0]?.message?.content || '';
    response.json({ content, model: data.model, usage: data.usage });
  });
}
