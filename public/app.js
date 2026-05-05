const app = document.querySelector('#app');
const savedTheme = localStorage.getItem('kairo-theme');

const metricMeta = {
  leadTime: { label: 'Lead time', suffix: 'dias', icon: 'timer', color: '#ff6b6b', tint: 'from-[#ff6b6b]/20' },
  throughput: { label: 'Throughput', suffix: 'cards', icon: 'activity', color: '#22c55e', tint: 'from-[#22c55e]/20' },
  fixedBugs: { label: 'Bugs corrigidos', suffix: 'bugs', icon: 'bug-off', color: '#f97316', tint: 'from-[#f97316]/20' },
  createdCards: { label: 'Cards criados', suffix: 'cards', icon: 'copy-plus', color: '#eab308', tint: 'from-[#eab308]/20' },
  backlogBugs: { label: 'Bugs em backlog', suffix: 'bugs', icon: 'bug', color: '#d946ef', tint: 'from-[#d946ef]/20' },
  backlogCards: { label: 'Cards em backlog', suffix: 'cards', icon: 'layers', color: '#38bdf8', tint: 'from-[#38bdf8]/20' },
  deployments: { label: 'Deploys (merge main)', suffix: 'deploys', icon: 'rocket', color: '#a3e635', tint: 'from-[#a3e635]/20' },
  mergedPullRequests: { label: 'PRs mergeados', suffix: 'PRs', icon: 'git-pull-request-arrow', color: '#60a5fa', tint: 'from-[#60a5fa]/20' }
};

const tabs = {
  dashboard: { label: 'Dashboard', icon: 'layout-dashboard' },
  insights: { label: 'Insights', icon: 'sparkles' },
  dados: { label: 'Atividades', icon: 'layout-list' },
  ia: { label: 'IA', icon: 'bot' },
  config: { label: 'Configurações', icon: 'settings' },
  runs: { label: 'Sincronizar', icon: 'refresh-cw' }
};

const statusColors = ['#df5d5d', '#38bdf8', '#eab308', '#22c55e', '#d946ef', '#f97316', '#94a3b8'];

let state = {
  config: null,
  metrics: { cards: [], series: [] },
  runs: [],
  activeTab: 'dashboard',
  loading: false,
  loadingAction: '',
  notice: '',
  booting: true,
  partyMode: false,
  easterClicks: 0,
  menuCollapsed: true,
  showGame: false,
  stars: [],
  // Dados tab
  datasSubTab: 'issues',
  issuesData: null,
  prsData: null,
  deploymentsData: null,
  issuesPage: 1,
  issuesSearch: '',
  issuesType: '',
  prsPage: 1,
  prsSearch: '',
  prsState: '',
  deploymentsPage: 1,
  deploymentsSearch: '',
  // IA tab
  aiMessages: [],
  aiModel: 'openai/gpt-4o-mini',
  aiModels: [],
  aiLoading: false,
  aiIncludeContext: true,
  insightLoading: false,
  insightAi: '',
  // Detail modal
  selectedIssue: null,
  theme: ['dark', 'light', 'eclipse'].includes(savedTheme) ? savedTheme : 'eclipse'
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function icon(name, classes = 'h-4 w-4', style = '') {
  return `<i data-lucide="${name}" class="${classes}" style="${style}" aria-hidden="true"></i>`;
}

function paintIcons() {
  if (window.lucide) {
    window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } });
  }
}

const MONTH_ABBR = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function fmtMonth(yyyyMM) {
  const m = parseInt(yyyyMM.slice(5), 10);
  return `${MONTH_ABBR[m - 1] || yyyyMM.slice(5)}/${yyyyMM.slice(2, 4)}`;
}

function formatValue(value, suffix) {
  const formatted = suffix === '%' ? value.toFixed(1) : value.toFixed(value % 1 ? 1 : 0);
  return `${formatted} ${suffix}`;
}

function compactValue(value) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return Number(value).toFixed(value % 1 ? 1 : 0);
}

function field(name, label, value = '', placeholder = '', iconName = 'circle') {
  return `
    <label class="space-y-2">
      <span class="flex items-center gap-2 text-sm font-medium text-zinc-200">${icon(iconName, 'h-4 w-4 text-zinc-500')}${label}</span>
      <input
        name="${name}"
        value="${value || ''}"
        placeholder="${placeholder}"
        class="h-10 w-full rounded-md border border-[#303036] bg-[#151519] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#df5d5d] focus:ring-1 focus:ring-[#df5d5d]"
      />
    </label>`;
}

function sidebarItem(key) {
  const item = tabs[key];
  const active = state.activeTab === key;
  return `
    <button
      data-tab="${key}"
      title="${item.label}"
      class="flex w-full items-center ${state.menuCollapsed ? 'justify-center px-2' : 'gap-3 px-3'} rounded-md py-2 text-sm font-medium ${active ? 'bg-[#27272d] text-white shadow-sm' : 'text-zinc-400 hover:bg-[#222227] hover:text-zinc-100'}"
    >
      ${icon(item.icon)}
      ${state.menuCollapsed ? '' : `<span>${item.label}</span>`}
    </button>`;
}

function chart(metricKey) {
  const meta = metricMeta[metricKey];
  const points = state.metrics.series
    .map((item) => ({ month: item.month, value: item[metricKey] }))
    .filter((item) => item.value !== null);

  if (!points.length) return '';

  const width = 520;
  const height = 240;
  const padding = { top: 38, right: 28, bottom: 34, left: 32 };
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const rawMax = Math.max(...values);
  const max = rawMax === min ? rawMax + 1 : rawMax;
  const spread = max - min || 1;
  const xStep = points.length > 1 ? (width - padding.left - padding.right) / (points.length - 1) : 0;
  const yFor = (value) => padding.top + ((max - value) / spread) * (height - padding.top - padding.bottom);
  const chartPoints = points.map((point, index) => ({
    ...point,
    x: padding.left + index * xStep,
    y: yFor(point.value)
  }));
  const latest = points.at(-1);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const avgY = yFor(avg);
  const avgLabel = Number(avg).toFixed(avg % 1 ? 1 : 0);
  const path = chartPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const pointNodes = chartPoints.map((point) => `
    <g>
      <circle cx="${point.x}" cy="${point.y}" r="4.5" fill="#18181b" stroke="${meta.color}" stroke-width="2.5" />
      <text x="${point.x}" y="${Math.max(14, point.y - 10)}" text-anchor="middle" class="fill-zinc-100 text-[11px] font-semibold">${Number(point.value).toFixed(point.value % 1 ? 1 : 0)}</text>
      <text x="${point.x}" y="${height - 10}" text-anchor="middle" class="fill-zinc-500 text-[11px]">${fmtMonth(point.month)}</text>
    </g>
  `).join('');
  const avgLineX1 = padding.left;
  const avgLineX2 = width - padding.right;

  return `
    <section class="rounded-lg border border-[#303036] bg-[#1f1f24]">
      <div class="flex items-center justify-between border-b border-[#303036] px-4 py-3">
        <h2 class="flex items-center gap-2 text-sm font-semibold text-zinc-100">${icon(meta.icon, 'h-4 w-4', `color:${meta.color}`)}${meta.label}</h2>
        <div class="flex items-center gap-3">
          <span class="flex items-center gap-1.5 text-xs text-zinc-500">
            <svg width="16" height="2" viewBox="0 0 16 2"><line x1="0" y1="1" x2="16" y2="1" stroke="#71717a" stroke-width="1.5" stroke-dasharray="3 2"/></svg>
            média ${avgLabel}
          </span>
          <span class="rounded-full border border-[#303036] bg-[#151519] px-2 py-0.5 text-xs font-semibold text-zinc-100">${formatValue(latest.value, meta.suffix)}</span>
        </div>
      </div>
      <div class="p-4">
        <svg viewBox="0 0 ${width} ${height}" class="h-60 w-full overflow-visible">
          <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#303036" />
          <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="#303036" />
          <line x1="${avgLineX1}" y1="${avgY}" x2="${avgLineX2}" y2="${avgY}" stroke="#71717a" stroke-width="1.5" stroke-dasharray="5 3" />
          <text x="${avgLineX2 - 2}" y="${avgY - 5}" text-anchor="end" class="fill-zinc-500 text-[10px]">${avgLabel}</text>
          <path class="line-path" d="${path}" fill="none" stroke="${meta.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          ${pointNodes}
        </svg>
      </div>
    </section>`;
}

function calcTeamEvolution() {
  const series = state.metrics.series || [];
  if (series.length < 2) return { score: 0, level: 1, levelName: 'Iniciando', mission: 'Sincronize dados para medir a evolução do time.', weakest: null };

  const last = series[series.length - 1];
  const prev = series[series.length - 2];

  function trend(key, lowerIsBetter = false) {
    const a = prev[key], b = last[key];
    if (a == null || b == null || a === 0) return 0;
    const pct = ((b - a) / Math.abs(a)) * 100;
    return lowerIsBetter ? -pct : pct;
  }

  const dimensions = [
    { key: 'leadTime',           label: 'Lead time',       t: trend('leadTime', true),      weight: 25 },
    { key: 'throughput',         label: 'Throughput',      t: trend('throughput'),           weight: 20 },
    { key: 'fixedBugs',          label: 'Bugs corrigidos', t: trend('fixedBugs'),            weight: 20 },
    { key: 'deployments',        label: 'Deploys',         t: trend('deployments'),          weight: 20 },
    { key: 'backlogBugs',        label: 'Bugs em backlog', t: trend('backlogBugs', true),    weight: 15 },
  ];

  const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0);
  const rawScore = dimensions.reduce((s, d) => s + Math.max(-100, Math.min(100, d.t)) * d.weight, 0) / totalWeight;
  const score = Math.round(Math.min(100, Math.max(0, 50 + rawScore * 0.5)));

  const levels = [
    { min: 0,  name: 'Iniciando',   label: 'Lv 1' },
    { min: 21, name: 'Progredindo', label: 'Lv 2' },
    { min: 41, name: 'Consistente', label: 'Lv 3' },
    { min: 61, name: 'Acelerado',   label: 'Lv 4' },
    { min: 81, name: 'Elite',       label: 'Lv 5' },
  ];
  const lv = [...levels].reverse().find((l) => score >= l.min) || levels[0];

  const weakest = [...dimensions].sort((a, b) => a.t - b.t)[0];
  const missions = {
    leadTime:    'Reduza o tempo entre abertura e entrega dos cards.',
    throughput:  'Aumente a cadência de cards entregues por mês.',
    fixedBugs:   'Priorize a resolução de bugs no próximo ciclo.',
    deployments: 'Aumente a frequência de deploys na main.',
    backlogBugs: 'Reduza o acúmulo de bugs em aberto no backlog.',
  };

  return { score, level: lv, mission: missions[weakest?.key] || 'Mantenha o ritmo!', weakest: weakest?.label };
}

function dashboardTemplate() {
  const evo = calcTeamEvolution();
  const missionLabel = state.metrics.isMock ? 'Treino operacional' : 'Evolução do time';
  const statusChart = statusDistributionTemplate();

  const empty = !state.metrics.cards.length
    ? `<div class="rounded-lg border border-dashed border-[#303036] bg-[#1f1f24] p-8 text-center text-sm text-zinc-400">Configure as integrações para começar a acompanhar as métricas de entrega do time.</div>`
    : '';
  const mockNotice = state.metrics.isMock
    ? `<div class="flex items-center gap-2 rounded-lg border border-[#df5d5d]/40 bg-[#df5d5d]/10 px-4 py-3 text-sm text-[#f6b2a8]">
        ${icon('flask-conical', 'h-4 w-4')}Visualizando dados demonstrativos. Conecte Jira e GitHub para ver os dados reais do time.
      </div>`
    : '';

  return `
    <section class="space-y-5">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="flex items-center gap-2 text-xl font-semibold text-zinc-50">${icon('activity', 'h-5 w-5 text-[#df5d5d]')}DORA overview</h1>
            ${state.metrics.isMock ? '<span class="rounded-full border border-[#df5d5d]/50 bg-[#df5d5d]/10 px-2 py-0.5 text-xs font-medium text-[#f6b2a8]">mock</span>' : '<span class="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">real</span>'}
          </div>
          <p class="mt-1 text-sm text-zinc-400">Acompanhe as métricas de entrega do time agrupadas por mês.</p>
        </div>
      </div>
      ${mockNotice}
      <div class="enter-up grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div class="rounded-lg border border-[#303036] bg-[#1f1f24] p-4">
          <div class="mb-3 flex items-center justify-between">
            <div>
              <div class="flex items-center gap-2 text-sm font-semibold text-zinc-100">${icon('target', 'h-4 w-4 text-[#df5d5d]')}${missionLabel}</div>
              <p class="mt-1 text-xs text-zinc-500">${evo.mission}</p>
              ${evo.weakest ? `<p class="mt-0.5 text-[11px] text-zinc-600">Ponto fraco do ciclo: <span class="text-zinc-400">${evo.weakest}</span></p>` : ''}
            </div>
            <span class="rounded-full border border-[#df5d5d]/40 bg-[#df5d5d]/10 px-3 py-1 text-xs font-semibold text-[#f6b2a8]">${evo.level.name}</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-[#151519]">
            <div class="h-full rounded-full bg-gradient-to-r from-[#df5d5d] via-[#f2b56b] to-[#38bdf8]" style="width:${evo.score}%"></div>
          </div>
        </div>
        <div class="rounded-lg border border-[#303036] bg-[#1f1f24] p-4">
          <div class="flex items-center justify-between text-sm">
            <span class="flex items-center gap-2 font-semibold text-zinc-100">${icon('trending-up', 'h-4 w-4 text-[#4ade80]')}Score de evolução</span>
            <strong class="text-2xl text-zinc-50">${evo.score}<span class="text-sm font-normal text-zinc-500">/100</span></strong>
          </div>
          <p class="mt-2 text-xs text-zinc-500">Calculado comparando último mês vs mês anterior: lead time, throughput, bugs corrigidos, deploys e backlog.</p>
        </div>
      </div>
      ${empty}
      ${statusChart}
      <div class="grid gap-4 xl:grid-cols-2">${Object.keys(metricMeta).map(chart).join('')}</div>
    </section>`;
}

function statusDistributionTemplate() {
  const rows = (state.metrics.statusDistribution || []).map((item, index) => {
    const color = statusColors[index % statusColors.length];
    return `
      <div class="space-y-2">
        <div class="flex items-center justify-between gap-3 text-sm">
          <span class="flex min-w-0 items-center gap-2 text-zinc-200">
            <span class="h-2.5 w-2.5 rounded-full" style="background:${color}"></span>
            <span class="truncate">${item.label}</span>
          </span>
          <span class="shrink-0 font-semibold text-zinc-100">${item.percent.toFixed(1)}%</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-[#151519]">
          <div class="h-full rounded-full" style="width:${Math.max(2, item.percent)}%; background:${color}"></div>
        </div>
        <div class="text-xs text-zinc-500">${item.count} cards</div>
      </div>`;
  }).join('');

  return `
    <section class="enter-up rounded-lg border border-[#303036] bg-[#1f1f24]">
      <div class="flex items-center justify-between border-b border-[#303036] px-4 py-3">
        <h2 class="flex items-center gap-2 text-sm font-semibold text-zinc-100">${icon('chart-pie', 'h-4 w-4 text-[#df5d5d]')}Distribuicao por status</h2>
        <span class="rounded-full border border-[#303036] bg-[#151519] px-2 py-0.5 text-xs text-zinc-400">agrupado</span>
      </div>
      <div class="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
        ${rows || '<div class="text-sm text-zinc-500">Sem status para exibir.</div>'}
      </div>
    </section>`;
}

function trendDelta(metricKey) {
  const points = (state.metrics.series || [])
    .map((item) => ({ month: item.month, value: item[metricKey] }))
    .filter((item) => item.value !== null && item.value !== undefined);
  if (points.length < 2) return null;
  const previous = points[points.length - 2];
  const latest = points[points.length - 1];
  return {
    previous,
    latest,
    delta: Number((latest.value - previous.value).toFixed(1)),
    percent: previous.value ? Math.round(((latest.value - previous.value) / previous.value) * 100) : null
  };
}

function fixedInsights() {
  const insights = [];
  const lead = trendDelta('leadTime');
  const throughput = trendDelta('throughput');
  const fixedBugs = trendDelta('fixedBugs');
  const backlogCards = trendDelta('backlogCards');
  const backlogBugs = trendDelta('backlogBugs');
  const deployments = trendDelta('deployments');
  const latest = (state.metrics.series || []).at(-1);
  const status = state.metrics.statusDistribution || [];
  const doing = status.find((item) => /fazendo/i.test(item.group || ''));
  const todo = status.find((item) => /a fazer/i.test(item.group || ''));

  if (lead) {
    const good = lead.delta <= 0;
    insights.push({
      icon: good ? 'timer-reset' : 'timer-off',
      title: good ? 'Lead time sob controle' : 'Lead time precisa de atenção',
      tone: good ? '#22c55e' : '#df5d5d',
      text: `${fmtMonth(lead.latest.month)} fechou em ${formatValue(lead.latest.value, 'dias')}, ${good ? 'melhorando' : 'piorando'} ${Math.abs(lead.delta)} dias vs ${fmtMonth(lead.previous.month)}.`
    });
  }

  if (throughput) {
    const good = throughput.delta >= 0;
    insights.push({
      icon: good ? 'activity' : 'trending-down',
      title: good ? 'Entrega ganhou tração' : 'Entrega perdeu cadência',
      tone: good ? '#22c55e' : '#f2b56b',
      text: `${fmtMonth(throughput.latest.month)} teve ${formatValue(throughput.latest.value, 'cards')}; variação de ${throughput.delta > 0 ? '+' : ''}${throughput.delta} cards no mês.`
    });
  }

  if (deployments) {
    const hasDeploys = deployments.latest.value > 0;
    insights.push({
      icon: hasDeploys ? 'rocket' : 'git-merge',
      title: hasDeploys ? 'Deploys detectados na main' : 'Sem deploys pela main',
      tone: hasDeploys ? '#a3e635' : '#df5d5d',
      text: `Deploy é merge em main/master: ${formatValue(deployments.latest.value, 'deploys')} em ${fmtMonth(deployments.latest.month)}.`
    });
  }

  if (backlogCards) {
    const growing = backlogCards.delta > 0;
    insights.push({
      icon: 'layers',
      title: growing ? 'Backlog está acumulando' : 'Backlog estabilizou',
      tone: growing ? '#f97316' : '#38bdf8',
      text: `${formatValue(backlogCards.latest.value, 'cards')} em backlog no último mês completo; ${growing ? '+' : ''}${backlogCards.delta} vs mês anterior.`
    });
  }

  if (backlogBugs && backlogBugs.latest.value > 0) {
    insights.push({
      icon: 'bug',
      title: 'Bugs ainda pressionam o fluxo',
      tone: '#d946ef',
      text: `${formatValue(backlogBugs.latest.value, 'bugs')} em backlog. Combine triagem semanal com limite de WIP para bugs antigos.`
    });
  }

  if (fixedBugs && fixedBugs.latest.value > 0) {
    insights.push({
      icon: 'bug-off',
      title: 'Correção de bugs ativa',
      tone: '#f97316',
      text: `${formatValue(fixedBugs.latest.value, 'bugs')} corrigidos em ${fmtMonth(fixedBugs.latest.month)}. Compare com bugs novos para evitar estoque invisível.`
    });
  }

  if (doing && doing.percent > 35) {
    insights.push({
      icon: 'traffic-cone',
      title: 'Muito trabalho em andamento',
      tone: '#38bdf8',
      text: `${doing.percent.toFixed(1)}% dos cards estão em "Fazendo". Revise gargalos de review, QA e bloqueios.`
    });
  } else if (todo && todo.percent > 45) {
    insights.push({
      icon: 'list-checks',
      title: 'Fila de entrada alta',
      tone: '#eab308',
      text: `${todo.percent.toFixed(1)}% dos cards estão em "A fazer". Pode haver excesso de demanda antes do refinamento.`
    });
  }

  if (!insights.length && latest) {
    insights.push({
      icon: 'sparkles',
      title: 'Dados prontos para leitura',
      tone: '#df5d5d',
      text: `Último mês completo: ${fmtMonth(latest.month)}. Use a IA para transformar os gráficos em plano de ação.`
    });
  }

  return insights.slice(0, 7);
}

function insightPrompt() {
  const series = (state.metrics.series || []).map((item) => {
    return `${fmtMonth(item.month)}: lead=${item.leadTime ?? 'n/a'}d, throughput=${item.throughput ?? 'n/a'}, bugs_corrigidos=${item.fixedBugs ?? 'n/a'}, cards_criados=${item.createdCards ?? 'n/a'}, bugs_backlog=${item.backlogBugs ?? 'n/a'}, cards_backlog=${item.backlogCards ?? 'n/a'}, deploys_main=${item.deployments ?? 'n/a'}, prs=${item.mergedPullRequests ?? 'n/a'}`;
  }).join('\n');
  const status = (state.metrics.statusDistribution || [])
    .map((item) => `${item.group}: ${item.percent.toFixed(1)}% (${item.count})`)
    .join(' | ');

  return `Avalie os gráficos atuais do dashboard DORA e gere insights executivos.

Use exclusivamente os dados abaixo. Considere que as métricas são somente do ano atual e até o mês anterior.

Séries mensais:
${series || 'sem dados'}

Distribuição por status:
${status || 'sem dados'}

Responda em pt-BR com:
1. Diagnóstico em 3 bullets curtos.
2. Principal risco.
3. 3 ações práticas para o próximo mês.
4. Uma leitura final de prioridade.`;
}

function insightsTemplate() {
  const hasKey = state.config?.openrouterConfigured;
  const insights = fixedInsights();
  const cards = insights.map((item) => `
    <article class="rounded-lg border border-[#303036] bg-[#1f1f24] p-4">
      <div class="mb-3 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <span class="rounded-md bg-[#151519] p-1.5">${icon(item.icon, 'h-4 w-4', `color:${item.tone}`)}</span>
          ${escapeHtml(item.title)}
        </div>
      </div>
      <p class="text-sm leading-relaxed text-zinc-400">${escapeHtml(item.text)}</p>
    </article>`).join('');

  const aiBlock = state.insightAi
    ? `<div class="ai-prose rounded-lg border border-[#303036] bg-[#1f1f24] p-4 text-sm">${window.marked ? window.marked.parse(state.insightAi) : escapeHtml(state.insightAi)}</div>`
    : `<div class="rounded-lg border border-dashed border-[#303036] bg-[#1f1f24] p-6 text-sm text-zinc-500">
        ${icon('wand-sparkles', 'mb-3 h-6 w-6 text-[#df5d5d]')}
        Clique em gerar análise para a IA avaliar os gráficos atuais e transformar os números em prioridades.
      </div>`;

  return `
    <section class="space-y-5">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="flex items-center gap-2 text-xl font-semibold text-zinc-50">${icon('sparkles', 'h-5 w-5 text-[#df5d5d]')}Insights</h1>
          <p class="mt-1 text-sm text-zinc-400">Leitura automática dos gráficos com recomendações fixas e avaliação por IA.</p>
        </div>
        <button data-action="insight-ai" ${state.insightLoading || !hasKey ? 'disabled' : ''} class="flex items-center gap-2 rounded-md border border-[#303036] bg-[#222227] px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-[#2b2b31] disabled:cursor-not-allowed disabled:opacity-50">
          ${icon(state.insightLoading ? 'loader-circle' : 'wand-sparkles', `h-4 w-4 ${state.insightLoading ? 'animate-spin' : ''}`)}
          ${state.insightLoading ? 'Analisando...' : 'Gerar análise IA'}
        </button>
      </div>

      ${!hasKey ? `
        <div class="flex items-center gap-2 rounded-lg border border-[#f2b56b]/40 bg-[#f2b56b]/10 px-4 py-3 text-sm text-[#f2b56b]">
          ${icon('key-round', 'h-4 w-4 shrink-0')}
          <span>Insights fixos estão ativos. Para análise por IA, configure a chave OpenRouter em Configurações.</span>
        </div>` : ''}

      <div class="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">${cards}</div>

      <div class="space-y-3">
        <div class="flex items-center gap-2 text-sm font-semibold text-zinc-100">${icon('bot', 'h-4 w-4 text-[#38bdf8]')}Avaliação da IA</div>
        ${aiBlock}
      </div>
    </section>`;
}

function configTemplate() {
  const config = state.config || {};
  return `
    <section class="space-y-5">
      <div>
        <h1 class="flex items-center gap-2 text-xl font-semibold text-zinc-50">${icon('plug-zap', 'h-5 w-5 text-[#df5d5d]')}Conexoes</h1>
        <p class="mt-1 text-sm text-zinc-400">Configure as integrações para importar dados do Jira e do GitHub. Deixe o projeto Jira em branco para buscar todos os projetos acessíveis.</p>
      </div>
      <form data-form="config" class="overflow-hidden rounded-lg border border-[#303036] bg-[#1f1f24]">
        <div class="flex items-center gap-2 border-b border-[#303036] bg-[#151519] px-5 py-3 text-sm font-semibold text-zinc-200">
          ${icon('key-round', 'h-4 w-4 text-[#df5d5d]')}Credenciais
        </div>
        <div class="grid gap-4 p-5 md:grid-cols-2">
          ${field('jiraBaseUrl', 'Jira URL', config.jiraBaseUrl, 'https://empresa.atlassian.net', 'badge')}
          ${field('jiraEmail', 'Jira e-mail', config.jiraEmail, 'voce@empresa.com', 'mail')}
          ${field('jiraApiToken', 'Jira API token', config.jiraApiToken, 'token', 'key-round')}
          ${field('jiraProjectKey', 'Jira projeto opcional', config.jiraProjectKey, 'vazio = todos os projetos ativos', 'folder-kanban')}
          ${field('githubToken', 'GitHub token', config.githubToken, 'ghp_...', 'github')}
          ${field('githubOwner', 'GitHub owner', config.githubOwner, 'otechmista', 'user')}
          ${field('openrouterApiKey', 'OpenRouter API key', config.openrouterApiKey, 'sk-or-...', 'bot')}
          <label class="space-y-2">
            <span class="flex items-center gap-2 text-sm font-medium text-zinc-200">${icon('cpu', 'h-4 w-4 text-zinc-500')}Modelo OpenRouter</span>
            <select name="openrouterModel" class="h-10 w-full rounded-md border border-[#303036] bg-[#151519] px-3 text-sm text-zinc-100 outline-none focus:border-[#df5d5d] focus:ring-1 focus:ring-[#df5d5d]">
              ${(state.aiModels || []).map((m) => `<option value="${escapeAttr(m.id)}" ${(config.openrouterModel || 'openai/gpt-4o-mini') === m.id ? 'selected' : ''}>${escapeHtml(m.label)}</option>`).join('') || '<option value="openai/gpt-4o-mini">GPT-4o Mini</option>'}
            </select>
          </label>
        </div>
        <div class="flex justify-end border-t border-[#303036] bg-[#151519] px-5 py-4">
          <button class="flex items-center gap-2 rounded-md border border-[#df5d5d] bg-[#df5d5d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#ef6f6f]">
            ${icon('save')}Salvar configuracao
          </button>
        </div>
      </form>
    </section>`;
}

function runsTemplate() {
  const rows = state.runs.map((run) => `
    <tr class="border-t border-[#303036]">
      <td class="px-4 py-3 text-zinc-200">${run.source}</td>
      <td class="px-4 py-3"><span class="rounded-full border border-[#3a3a42] px-2 py-0.5 text-xs text-zinc-300">${run.status}</span></td>
      <td class="px-4 py-3 text-zinc-400">${run.message || ''}</td>
      <td class="px-4 py-3 text-zinc-500">${run.created_at}</td>
    </tr>
  `).join('');

  return `
    <section class="space-y-5">
      <h1 class="flex items-center gap-2 text-xl font-semibold text-zinc-50">${icon('history', 'h-5 w-5 text-[#df5d5d]')}Historico de sync</h1>
      <div class="overflow-hidden rounded-lg border border-[#303036] bg-[#1f1f24]">
        <table class="w-full text-left text-sm">
          <thead class="bg-[#151519] text-zinc-400">
            <tr><th class="px-4 py-3">Fonte</th><th class="px-4 py-3">Status</th><th class="px-4 py-3">Mensagem</th><th class="px-4 py-3">Data</th></tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="4" class="px-4 py-6 text-center text-zinc-500">Nenhuma sincronizacao registrada.</td></tr>'}</tbody>
        </table>
      </div>
    </section>`;
}

// ─── helpers ───────────────────────────────────────────────────────────────

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(text) {
  return String(text || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── Dados tab ─────────────────────────────────────────────────────────────

function paginationTemplate(page, pages, type) {
  if (!pages || pages <= 1) return '';
  return `
    <div class="flex items-center gap-2">
      <span class="text-xs text-zinc-500">Página ${page} de ${pages}</span>
      <button data-action="page-prev-${type}" ${page <= 1 ? 'disabled' : ''} class="rounded border border-[#303036] bg-[#222227] p-1 text-zinc-400 hover:bg-[#2b2b31] disabled:opacity-40 disabled:cursor-not-allowed">
        ${icon('chevron-left', 'h-3.5 w-3.5')}
      </button>
      <button data-action="page-next-${type}" ${page >= pages ? 'disabled' : ''} class="rounded border border-[#303036] bg-[#222227] p-1 text-zinc-400 hover:bg-[#2b2b31] disabled:opacity-40 disabled:cursor-not-allowed">
        ${icon('chevron-right', 'h-3.5 w-3.5')}
      </button>
    </div>`;
}

function statusBadge(status) {
  const s = (status || '').toLowerCase();
  if (/done|closed|resolved|conclu|feito|finaliz/.test(s))
    return `<span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400">${escapeHtml(status)}</span>`;
  if (/progress|andamento|doing|fazendo|desenvolvimento|dev/.test(s))
    return `<span class="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-400">${escapeHtml(status)}</span>`;
  if (/review|revisão|revisao|aprovação|aprovacao|homolog/.test(s))
    return `<span class="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-400">${escapeHtml(status)}</span>`;
  if (/block|bloqueado|impedido|aguard/.test(s))
    return `<span class="rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] font-medium text-orange-400">${escapeHtml(status)}</span>`;
  if (/bug|incident|erro|falha/.test(s))
    return `<span class="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-400">${escapeHtml(status)}</span>`;
  return `<span class="rounded-full bg-zinc-700/60 px-2 py-0.5 text-[11px] font-medium text-zinc-400">${escapeHtml(status)}</span>`;
}

function typeBadge(type) {
  const t = (type || '').toLowerCase();
  if (/bug/.test(t)) return `<span class="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-400">${escapeHtml(type)}</span>`;
  if (/story|história|historia/.test(t)) return `<span class="rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-400">${escapeHtml(type)}</span>`;
  if (/task|tarefa/.test(t)) return `<span class="rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-medium text-blue-400">${escapeHtml(type)}</span>`;
  if (/epic|épico/.test(t)) return `<span class="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[11px] font-medium text-fuchsia-400">${escapeHtml(type)}</span>`;
  return `<span class="rounded-full bg-zinc-700/60 px-2 py-0.5 text-[11px] font-medium text-zinc-400">${escapeHtml(type)}</span>`;
}

function issuesTableTemplate() {
  const data = state.issuesData;

  const searchForm = `
    <form data-form="issues-search" class="flex flex-wrap gap-2">
      <input name="search" value="${escapeAttr(state.issuesSearch)}" placeholder="Buscar por título ou chave..." class="h-9 min-w-0 flex-1 rounded-md border border-[#303036] bg-[#151519] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#df5d5d] focus:ring-1 focus:ring-[#df5d5d]" />
      <select name="type" class="h-9 rounded-md border border-[#303036] bg-[#151519] px-2 text-sm text-zinc-100 outline-none focus:border-[#df5d5d]">
        <option value="">Todos os tipos</option>
        <option value="bug" ${state.issuesType === 'bug' ? 'selected' : ''}>Bug</option>
        <option value="story" ${state.issuesType === 'story' ? 'selected' : ''}>Story</option>
        <option value="task" ${state.issuesType === 'task' ? 'selected' : ''}>Task</option>
      </select>
      <button class="flex items-center gap-1.5 rounded-md border border-[#303036] bg-[#222227] px-3 py-1.5 text-sm text-zinc-200 hover:bg-[#2b2b31]">
        ${icon('search', 'h-4 w-4')}Buscar
      </button>
    </form>`;

  if (!data) return `${searchForm}
    <div class="rounded-xl border border-[#303036] bg-[#1f1f24] p-10 text-center text-sm text-zinc-500">
      ${icon('loader-circle', 'h-6 w-6 animate-spin mx-auto mb-3 text-zinc-600')}Carregando cards...
    </div>`;

  if (!data.issues.length) return `${searchForm}
    <div class="rounded-xl border border-[#303036] bg-[#1f1f24] p-10 text-center text-sm text-zinc-500">
      ${icon('inbox', 'h-8 w-8 mx-auto mb-3 text-zinc-600')}Nenhum card encontrado.
    </div>`;

  const rows = data.issues.map((issue) => {
    const labels = (issue.labels || '').split(',').map((l) => l.trim()).filter(Boolean);
    const labelsHtml = labels.map((l) => `<span class="rounded bg-[#252528] px-1.5 py-0.5 text-[10px] text-zinc-500">${escapeHtml(l)}</span>`).join('');
    const date = issue.created_at ? issue.created_at.slice(0, 10) : '';
    return `
      <div data-action="open-issue" data-issue-id="${escapeAttr(issue.id)}"
           class="group cursor-pointer border-b border-[#222226] px-4 py-3 transition-colors last:border-0 hover:bg-[#1f1f23]">
        <div class="flex items-start gap-3">
          <span class="mt-0.5 shrink-0 font-mono text-[11px] text-[#38bdf8] w-20 truncate">${escapeHtml(issue.issue_key) || '—'}</span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5 mb-1">
              ${typeBadge(issue.issue_type)}
              ${statusBadge(issue.status)}
              ${labelsHtml}
            </div>
            <p class="text-sm text-zinc-200 leading-snug">${escapeHtml(issue.summary) || '—'}</p>
            ${issue.description ? `<p class="mt-1 text-xs leading-relaxed text-zinc-500 whitespace-pre-wrap">${escapeHtml(issue.description)}</p>` : ''}
            ${(issue.assignee || issue.reporter) ? `
            <div class="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-zinc-600">
              ${issue.assignee ? `<span class="flex items-center gap-1">${icon('user', 'h-3 w-3')}<span class="text-zinc-400">${escapeHtml(issue.assignee)}</span></span>` : ''}
              ${issue.reporter ? `<span class="flex items-center gap-1">${icon('user-pen', 'h-3 w-3')}${escapeHtml(issue.reporter)}</span>` : ''}
            </div>` : ''}
          </div>
          <span class="shrink-0 text-[11px] text-zinc-600">${date}</span>
        </div>
      </div>`;
  }).join('');

  return `
    ${searchForm}
    <div class="rounded-xl border border-[#303036] bg-[#18181b]">
      <div class="flex items-center justify-between border-b border-[#303036] px-4 py-2.5">
        <span class="text-xs text-zinc-500">${data.total} cards</span>
        ${paginationTemplate(data.page, data.pages, 'issues')}
      </div>
      ${rows}
      ${data.pages > 1 ? `<div class="flex justify-end border-t border-[#303036] px-4 py-2.5">${paginationTemplate(data.page, data.pages, 'issues')}</div>` : ''}
    </div>`;
}

function prsTableTemplate() {
  const data = state.prsData;

  const searchForm = `
    <form data-form="prs-search" class="flex flex-wrap gap-2">
      <input name="search" value="${escapeAttr(state.prsSearch)}" placeholder="Buscar por título..." class="h-9 min-w-0 flex-1 rounded-md border border-[#303036] bg-[#151519] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#df5d5d] focus:ring-1 focus:ring-[#df5d5d]" />
      <select name="state" class="h-9 rounded-md border border-[#303036] bg-[#151519] px-2 text-sm text-zinc-100 outline-none focus:border-[#df5d5d]">
        <option value="">Todos os estados</option>
        <option value="open" ${state.prsState === 'open' ? 'selected' : ''}>Aberto</option>
        <option value="closed" ${state.prsState === 'closed' ? 'selected' : ''}>Fechado</option>
      </select>
      <button class="flex items-center gap-1.5 rounded-md border border-[#303036] bg-[#222227] px-3 py-1.5 text-sm text-zinc-200 hover:bg-[#2b2b31]">
        ${icon('search', 'h-4 w-4')}Buscar
      </button>
    </form>`;

  if (!data) return `${searchForm}
    <div class="rounded-xl border border-[#303036] bg-[#1f1f24] p-10 text-center text-sm text-zinc-500">
      ${icon('loader-circle', 'h-6 w-6 animate-spin mx-auto mb-3 text-zinc-600')}Carregando pull requests...
    </div>`;

  if (!data.prs.length) return `${searchForm}
    <div class="rounded-xl border border-[#303036] bg-[#1f1f24] p-10 text-center text-sm text-zinc-500">
      ${icon('git-pull-request', 'h-8 w-8 mx-auto mb-3 text-zinc-600')}Nenhum PR encontrado.
    </div>`;

  const rows = data.prs.map((pr) => {
    const isMerged = Boolean(pr.merged_at);
    const isMain = /^(main|master)$/i.test(pr.base_ref || '');
    const stateBadge = isMerged
      ? `<span class="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">Mergeado</span>`
      : pr.state === 'open'
        ? `<span class="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">Aberto</span>`
        : `<span class="rounded bg-zinc-700/40 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">Fechado</span>`;
    const branchBadge = `<span class="rounded px-1.5 py-0.5 text-[10px] font-medium ${isMain ? 'bg-lime-500/15 text-lime-400' : 'bg-[#252528] text-zinc-500'}">${escapeHtml(pr.base_ref) || '—'}</span>`;
    const date = (pr.merged_at || pr.created_at || '').slice(0, 10);
    const titleEl = pr.html_url
      ? `<a href="${escapeAttr(pr.html_url)}" target="_blank" rel="noopener" class="text-sm text-zinc-200 leading-snug hover:text-[#38bdf8] hover:underline">${escapeHtml(pr.title) || '—'}</a>`
      : `<span class="text-sm text-zinc-200 leading-snug">${escapeHtml(pr.title) || '—'}</span>`;
    return `
      <div class="group border-b border-[#222226] px-4 py-3 transition-colors last:border-0 hover:bg-[#1f1f23]">
        <div class="flex items-start gap-3">
          <span class="mt-0.5 shrink-0 font-mono text-[11px] text-zinc-600 w-12">#${pr.number}</span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5 mb-1">
              ${stateBadge}
              ${branchBadge}
            </div>
            ${titleEl}
          </div>
          <span class="shrink-0 text-[11px] text-zinc-600">${date}</span>
        </div>
      </div>`;
  }).join('');

  return `
    ${searchForm}
    <div class="rounded-xl border border-[#303036] bg-[#18181b]">
      <div class="flex items-center justify-between border-b border-[#303036] px-4 py-2.5">
        <span class="text-xs text-zinc-500">${data.total} pull requests</span>
        ${paginationTemplate(data.page, data.pages, 'prs')}
      </div>
      ${rows}
      ${data.pages > 1 ? `<div class="flex justify-end border-t border-[#303036] px-4 py-2.5">${paginationTemplate(data.page, data.pages, 'prs')}</div>` : ''}
    </div>`;
}

function deploymentsTableTemplate() {
  const data = state.deploymentsData;

  const searchForm = `
    <form data-form="deployments-search" class="flex flex-wrap gap-2">
      <input name="search" value="${escapeAttr(state.deploymentsSearch)}" placeholder="Buscar ambiente ou estado..." class="h-9 min-w-0 flex-1 rounded-md border border-[#303036] bg-[#151519] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#df5d5d] focus:ring-1 focus:ring-[#df5d5d]" />
      <button class="flex items-center gap-1.5 rounded-md border border-[#303036] bg-[#222227] px-3 py-1.5 text-sm text-zinc-200 hover:bg-[#2b2b31]">
        ${icon('search', 'h-4 w-4')}Buscar
      </button>
    </form>`;

  if (!data) return `${searchForm}
    <div class="rounded-xl border border-[#303036] bg-[#1f1f24] p-10 text-center text-sm text-zinc-500">
      ${icon('loader-circle', 'h-6 w-6 animate-spin mx-auto mb-3 text-zinc-600')}Carregando deploys...
    </div>`;

  if (!data.deployments.length) return `${searchForm}
    <div class="rounded-xl border border-[#303036] bg-[#1f1f24] p-10 text-center text-sm text-zinc-500">
      ${icon('rocket', 'h-8 w-8 mx-auto mb-3 text-zinc-600')}Nenhum deploy encontrado.
    </div>`;

  const rows = data.deployments.map((deployment) => {
    const date = (deployment.created_at || deployment.updated_at || '').slice(0, 10);
    return `
      <div class="group border-b border-[#222226] px-4 py-3 transition-colors last:border-0 hover:bg-[#1f1f23]">
        <div class="flex items-start gap-3">
          <span class="mt-0.5 shrink-0 text-[#a3e635]">${icon('rocket', 'h-4 w-4', 'color:#a3e635')}</span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5 mb-1">
              <span class="rounded bg-lime-500/15 px-1.5 py-0.5 text-[10px] font-medium text-lime-400">${escapeHtml(deployment.environment) || 'ambiente'}</span>
              <span class="rounded bg-[#252528] px-1.5 py-0.5 text-[10px] text-zinc-500">${escapeHtml(deployment.state) || 'state'}</span>
            </div>
            ${deployment.html_url
              ? `<a href="${escapeAttr(deployment.html_url)}" target="_blank" rel="noopener" class="text-sm text-zinc-200 leading-snug hover:text-[#38bdf8] hover:underline">#${deployment.number || deployment.id} ${escapeHtml(deployment.title) || 'Merge na main'}</a>`
              : `<p class="text-sm text-zinc-200 leading-snug">#${deployment.number || deployment.id} ${escapeHtml(deployment.title) || 'Merge na main'}</p>`}
          </div>
          <span class="shrink-0 text-[11px] text-zinc-600">${date}</span>
        </div>
      </div>`;
  }).join('');

  return `
    ${searchForm}
    <div class="rounded-xl border border-[#303036] bg-[#18181b]">
      <div class="flex items-center justify-between border-b border-[#303036] px-4 py-2.5">
        <span class="text-xs text-zinc-500">${data.total} deploys</span>
        ${paginationTemplate(data.page, data.pages, 'deployments')}
      </div>
      ${rows}
      ${data.pages > 1 ? `<div class="flex justify-end border-t border-[#303036] px-4 py-2.5">${paginationTemplate(data.page, data.pages, 'deployments')}</div>` : ''}
    </div>`;
}

function dadosTemplate() {
  const isIssues = state.datasSubTab === 'issues';
  const isPrs = state.datasSubTab === 'prs';
  return `
    <section class="space-y-5">
      <div>
        <h1 class="flex items-center gap-2 text-xl font-semibold text-zinc-50">${icon('layout-list', 'h-5 w-5 text-[#df5d5d]')}Atividades</h1>
        <p class="mt-1 text-sm text-zinc-400">Histórico de cards e pull requests da equipe.</p>
      </div>
      <div class="flex gap-2">
        <button data-action="dados-sub-issues" class="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${isIssues ? 'bg-[#df5d5d] text-white' : 'border border-[#303036] bg-[#222227] text-zinc-300 hover:bg-[#2b2b31]'}">
          ${icon('layout-list', 'h-4 w-4')}Cards Jira
        </button>
        <button data-action="dados-sub-prs" class="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${isPrs ? 'bg-[#df5d5d] text-white' : 'border border-[#303036] bg-[#222227] text-zinc-300 hover:bg-[#2b2b31]'}">
          ${icon('git-pull-request', 'h-4 w-4')}GitHub PRs
        </button>
        <button data-action="dados-sub-deployments" class="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${state.datasSubTab === 'deployments' ? 'bg-[#df5d5d] text-white' : 'border border-[#303036] bg-[#222227] text-zinc-300 hover:bg-[#2b2b31]'}">
          ${icon('rocket', 'h-4 w-4')}Deploys GitHub
        </button>
      </div>
      ${isIssues ? issuesTableTemplate() : isPrs ? prsTableTemplate() : deploymentsTableTemplate()}
    </section>`;
}

// ─── IA tab ────────────────────────────────────────────────────────────────

const AI_QUICK = [
  'Analise o lead time do time e sugira melhorias concretas',
  'Como está a frequência de deploy? É elite, high, medium ou low performer segundo DORA?',
  'Qual é a taxa de falha nas mudanças e como reduzir bugs em produção?',
  'Quais insights você tira do throughput e backlog atual?',
  'Dê um resumo executivo das métricas DORA para apresentar ao time',
  'Quais são os principais riscos identificados nos dados?'
];

function iaTemplate() {
  const hasKey = state.config?.openrouterConfigured;
  const messages = state.aiMessages || [];

  const messagesHtml = messages.map((msg) => {
    const isUser = msg.role === 'user';
    const body = isUser
      ? `<span style="white-space:pre-wrap">${escapeHtml(msg.content)}</span>`
      : `<div class="ai-prose">${window.marked ? window.marked.parse(msg.content) : escapeHtml(msg.content)}</div>`;
    return `
      <div class="flex gap-3 ${isUser ? 'flex-row-reverse' : ''}">
        <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isUser ? 'bg-[#df5d5d]/20' : 'bg-[#38bdf8]/20'}">
          ${icon(isUser ? 'user' : 'bot', 'h-3.5 w-3.5', `color:${isUser ? '#df5d5d' : '#38bdf8'}`)}
        </div>
        <div class="max-w-[82%] rounded-xl border px-4 py-3 text-sm ${isUser ? 'border-[#df5d5d]/20 bg-[#df5d5d]/10 text-zinc-100' : 'border-[#303036] bg-[#222227]'}">${body}</div>
      </div>`;
  }).join('');

  const loadingHtml = state.aiLoading ? `
    <div class="flex gap-3">
      <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#38bdf8]/20">
        ${icon('bot', 'h-3.5 w-3.5', 'color:#38bdf8')}
      </div>
      <div class="rounded-xl border border-[#303036] bg-[#222227] px-4 py-3 text-sm text-zinc-400">
        ${icon('loader-circle', 'h-4 w-4 animate-spin inline mr-2')}Gerando resposta...
      </div>
    </div>` : '';

  const quickButtons = AI_QUICK.map((q) => `
    <button data-action="ai-quick" data-prompt="${escapeAttr(q)}" class="w-full rounded-lg border border-[#303036] bg-[#1f1f24] px-3 py-2 text-left text-xs text-zinc-400 transition-colors hover:border-[#df5d5d]/40 hover:bg-[#222227] hover:text-zinc-100">
      ${escapeHtml(q)}
    </button>`).join('');

  const emptyState = `
    <div class="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-zinc-500">
      ${icon('message-square', 'h-10 w-10 mb-2 text-zinc-700')}
      <span>Faça uma pergunta ou escolha um insight rápido.</span>
      ${!hasKey ? '<span class="text-[#f2b56b] text-xs mt-1">Configure a chave OpenRouter primeiro.</span>' : ''}
    </div>`;

  return `
    <section class="space-y-5">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="flex items-center gap-2 text-xl font-semibold text-zinc-50">${icon('bot', 'h-5 w-5 text-[#df5d5d]')}IA Insights</h1>
          <p class="mt-1 text-sm text-zinc-400">Faça perguntas sobre o desempenho do time e obtenha insights com IA.</p>
        </div>
        ${messages.length ? `<button data-action="ai-clear" class="flex items-center gap-2 rounded-md border border-[#303036] bg-[#222227] px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100">${icon('trash-2', 'h-4 w-4')}Limpar conversa</button>` : ''}
      </div>
      ${!hasKey ? `
        <div class="flex items-center gap-2 rounded-lg border border-[#f2b56b]/40 bg-[#f2b56b]/10 px-4 py-3 text-sm text-[#f2b56b]">
          ${icon('key-round', 'h-4 w-4 shrink-0')}
          <span>Configure sua chave OpenRouter na aba <strong>Configurações</strong> para ativar a IA.</span>
        </div>` : ''}
      <div class="grid gap-4 xl:grid-cols-[1fr_260px]">
        <div class="flex flex-col gap-3">
          <div id="ia-messages" class="min-h-72 space-y-4 overflow-y-auto rounded-lg border border-[#303036] bg-[#1f1f24] p-4">
            ${messages.length || state.aiLoading ? (messagesHtml + loadingHtml) : emptyState}
          </div>
          <form data-form="ai-chat" class="flex gap-2">
            <input
              name="message"
              placeholder="Pergunte sobre os dados do time..."
              autocomplete="off"
              ${state.aiLoading ? 'disabled' : ''}
              class="h-10 flex-1 rounded-md border border-[#303036] bg-[#151519] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#df5d5d] focus:ring-1 focus:ring-[#df5d5d] disabled:opacity-50"
            />
            <button ${state.aiLoading ? 'disabled' : ''} class="flex items-center gap-2 rounded-md bg-[#df5d5d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#ef6f6f] disabled:opacity-50 disabled:cursor-not-allowed">
              ${icon(state.aiLoading ? 'loader-circle' : 'send', `h-4 w-4 ${state.aiLoading ? 'animate-spin' : ''}`)}
              ${state.aiLoading ? '' : 'Enviar'}
            </button>
          </form>
        </div>
        <aside class="space-y-4">
          <div class="rounded-lg border border-[#303036] bg-[#1f1f24] p-4">
            <div class="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-200">${icon('settings-2', 'h-4 w-4 text-[#df5d5d]')}Configurações</div>
            <div class="flex items-center justify-between text-xs text-zinc-400">
              <span>Modelo ativo</span>
              <span class="font-mono text-zinc-300">${escapeHtml(state.config?.openrouterModel || 'gpt-4o-mini')}</span>
            </div>
            <p class="mt-1 text-[11px] text-zinc-600">Altere em Configurações.</p>
            <label class="mt-3 flex cursor-pointer items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200">
              <input type="checkbox" data-action="ai-context" ${state.aiIncludeContext ? 'checked' : ''} class="h-3.5 w-3.5 accent-[#df5d5d]" />
              Incluir contexto dos dados
            </label>
          </div>
          <div class="rounded-lg border border-[#303036] bg-[#1f1f24] p-4">
            <div class="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-200">${icon('zap', 'h-4 w-4 text-[#f2b56b]')}Insights rápidos</div>
            <div class="space-y-2">${quickButtons}</div>
          </div>
        </aside>
      </div>
    </section>`;
}

function issueModalTemplate(issue) {
  if (!issue) return '';
  const isBug = /bug|defeito|erro|falha|incident/i.test(`${issue.issue_type || ''} ${issue.labels || ''}`);
  let statusCls = 'text-zinc-300';
  if (/done|closed|resolved|conclu|feito/i.test(issue.status || '')) statusCls = 'text-emerald-400';
  else if (/progress|andamento|fazendo|doing/i.test(issue.status || '')) statusCls = 'text-[#38bdf8]';

  const leadDays = issue.created_at && issue.resolved_at
    ? Math.round((new Date(issue.resolved_at) - new Date(issue.created_at)) / 86400000)
    : null;

  let parsedLabels = [];
  try { parsedLabels = JSON.parse(issue.labels || '[]'); } catch { parsedLabels = (issue.labels || '').split(',').map(l => l.trim()); }
  parsedLabels = parsedLabels.filter(Boolean);
  const labelsHtml = parsedLabels.length
    ? parsedLabels.map((l) => `<span class="rounded bg-[#252528] px-2 py-0.5 text-xs text-zinc-400">${escapeHtml(l)}</span>`).join('')
    : '';

  function row(label, value) {
    return `
      <div class="flex items-center justify-between gap-4 border-b border-[#222226] py-2.5 text-sm">
        <span class="shrink-0 text-zinc-500">${label}</span>
        <span class="text-right text-zinc-200">${value}</span>
      </div>`;
  }

  return `
    <div data-action="close-issue-modal" class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 pt-16">
      <section class="w-full max-w-2xl rounded-2xl border border-[#303036] bg-[#1b1b1f] shadow-2xl shadow-black/50 mb-16">
        <div class="flex items-start justify-between gap-4 border-b border-[#303036] px-6 py-4">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <span class="font-mono text-sm font-semibold text-[#38bdf8]">${escapeHtml(issue.issue_key) || '—'}</span>
              ${typeBadge(issue.issue_type)}
              ${statusBadge(issue.status)}
              ${isBug ? '<span class="rounded bg-[#df5d5d]/20 px-1.5 py-0.5 text-[11px] text-[#f6b2a8]">bug</span>' : ''}
            </div>
            <h2 class="text-base font-semibold leading-snug text-zinc-100">${escapeHtml(issue.summary) || '—'}</h2>
          </div>
          <button data-action="close-issue-modal" class="shrink-0 rounded-md border border-[#303036] bg-[#222227] p-1.5 text-zinc-400 hover:text-zinc-100">
            ${icon('x', 'h-4 w-4')}
          </button>
        </div>

        <div class="px-6 py-2">
          ${row('Criado em', issue.created_at ? issue.created_at.slice(0, 16).replace('T', ' ') : '—')}
          ${issue.resolved_at ? row('Resolvido em', issue.resolved_at.slice(0, 16).replace('T', ' ')) : ''}
          ${leadDays !== null ? row('Lead time', `<span class="font-semibold text-[#f2b56b]">${leadDays} dias</span>`) : ''}
          ${issue.assignee ? row('Responsável', `<span class="flex items-center gap-1.5">${icon('user','h-3.5 w-3.5 text-zinc-500')}${escapeHtml(issue.assignee)}</span>`) : ''}
          ${issue.reporter ? row('Relator', `<span class="flex items-center gap-1.5">${icon('user-pen','h-3.5 w-3.5 text-zinc-500')}${escapeHtml(issue.reporter)}</span>`) : ''}
          ${labelsHtml ? `<div class="flex flex-wrap items-center justify-between gap-2 border-b border-[#222226] py-2.5 text-sm"><span class="shrink-0 text-zinc-500">Labels</span><div class="flex flex-wrap justify-end gap-1">${labelsHtml}</div></div>` : ''}
        </div>

        ${issue.description ? `
        <div class="border-t border-[#303036] px-6 py-4">
          <p class="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-600">Descrição</p>
          <div class="ai-prose text-sm leading-relaxed">${window.marked ? window.marked.parse(issue.description) : `<p class="whitespace-pre-wrap text-zinc-300">${escapeHtml(issue.description)}</p>`}</div>
        </div>` : ''}

        <div class="flex justify-end border-t border-[#303036] px-6 py-3">
          <button data-action="close-issue-modal" class="rounded-md border border-[#303036] bg-[#222227] px-4 py-1.5 text-sm text-zinc-300 hover:text-zinc-100">Fechar</button>
        </div>
      </section>
    </div>`;
}

function shell(content) {
  if (state.booting) return bootTemplate();

  return `
    <div class="flex min-h-screen ${state.partyMode ? 'spark-field' : ''} bg-[#18181b] text-zinc-100">
      ${starLayer()}
      ${issueModalTemplate(state.selectedIssue)}
      <aside class="hidden ${state.menuCollapsed ? 'w-20' : 'w-64'} shrink-0 border-r border-[#303036] bg-[#1b1b1f] p-4 transition-all duration-300 md:block">
        <div class="-mx-4 -mt-4 mb-5 h-2 bg-[#df5d5d]"></div>
        <div class="mb-6 flex items-center ${state.menuCollapsed ? 'justify-center' : 'justify-between'} gap-3">
        <button data-action="secret" class="flex min-w-0 items-center ${state.menuCollapsed ? 'justify-center' : 'gap-3'} rounded-lg text-left">
          <div data-secret-logo class="floaty rounded-xl bg-[#df5d5d] p-2 text-white shadow-lg shadow-[#df5d5d]/25">${icon('trending-up', 'h-5 w-5', 'color:white')}</div>
          ${state.menuCollapsed ? '' : `<div>
            <div class="font-semibold leading-tight tracking-wide">Stride</div>
            <div class="text-xs text-zinc-500">DORA dashboard</div>
          </div>`}
        </button>
        ${state.menuCollapsed ? '' : `<button data-action="toggle-menu" title="Recolher menu" class="rounded-md border border-[#303036] bg-[#222227] p-2 text-zinc-400 hover:text-zinc-100">${icon('panel-left-close')}</button>`}
        </div>
        ${state.menuCollapsed ? `<button data-action="toggle-menu" title="Expandir menu" class="mb-5 w-full rounded-md border border-[#303036] bg-[#222227] p-2 text-zinc-400 hover:text-zinc-100">${icon('panel-left-open')}</button>` : ''}
        <nav class="space-y-1">${Object.keys(tabs).map(sidebarItem).join('')}</nav>
        ${state.menuCollapsed ? '' : `<div class="mt-6 rounded-lg border border-[#303036] bg-[#222227] p-3 text-xs text-zinc-400">
          <div class="mb-2 flex items-center gap-2 font-medium text-zinc-200">${icon('database', 'h-4 w-4 text-[#df5d5d]')}Dados disponíveis</div>
          Jira, GitHub, PRs e deploys importados e disponíveis para análise offline.
        </div>`}
      </aside>
      <main class="min-w-0 flex-1">
        <header class="flex items-center justify-between border-b border-[#303036] bg-[#1b1b1f] px-5 py-4">
          <div class="flex items-center gap-2 text-sm text-zinc-400">
            ${icon(tabs[state.activeTab].icon, 'h-4 w-4 text-[#df5d5d]')}
            <span>${tabs[state.activeTab].label}</span>
          </div>
          <div class="hidden items-center gap-2 md:flex">
          <div class="flex rounded-md border border-[#303036] bg-[#222227] p-0.5">
            ${[
              { key: 'dark', label: 'Dark', icon: 'moon' },
              { key: 'light', label: 'Light', icon: 'sun' },
              { key: 'eclipse', label: 'Eclipse', icon: 'eclipse' }
            ].map((theme) => `
              <button data-action="theme" data-theme="${theme.key}" title="Tema ${theme.label}" class="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium ${state.theme === theme.key ? 'bg-[#df5d5d] text-white' : 'text-zinc-400 hover:text-zinc-100'}">
                ${icon(theme.icon, 'h-3.5 w-3.5')}
                <span>${theme.label}</span>
              </button>
            `).join('')}
          </div>
          <button data-action="sync" class="flex items-center gap-2 rounded-md border border-[#303036] bg-[#222227] px-3 py-1.5 text-sm text-zinc-200 hover:bg-[#2b2b31]">
            ${icon(state.loadingAction === 'sync' ? 'loader-circle' : 'refresh-cw', `h-4 w-4 ${state.loadingAction === 'sync' ? 'animate-spin' : ''}`)}
            ${state.loadingAction === 'sync' ? 'Atualizando...' : 'Atualizar'}
          </button>
          <button data-action="resync" class="flex items-center gap-2 rounded-md bg-[#df5d5d] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#ef6f6f]">
            ${icon(state.loadingAction === 'resync' ? 'loader-circle' : 'rotate-ccw', `h-4 w-4 ${state.loadingAction === 'resync' ? 'animate-spin' : ''}`)}
            ${state.loadingAction === 'resync' ? 'Resync...' : 'Resync'}
          </button>
          </div>
        </header>
        <div class="p-5">
          ${state.notice ? `<div class="mb-5 rounded-lg border border-[#df5d5d]/40 bg-[#df5d5d]/10 px-4 py-3 text-sm text-[#f6b2a8]">${state.notice}</div>` : ''}
          ${content}
        </div>
      </main>
    </div>`;
}

function starLayer() {
  return `
    <div class="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      ${state.stars.map((star) => `<span class="star-pop absolute text-sm" style="left:${star.x}px; top:${star.y}px; color:${star.color}; animation-delay:${star.delay}ms">✦</span>`).join('')}
    </div>`;
}

function gameModalTemplate() {
  return `
    <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/85 p-4">
      <section class="w-full max-w-4xl rounded-2xl border border-[#df5d5d]/50 bg-[#0a0a0d] shadow-2xl shadow-[#df5d5d]/20">
        <div class="flex items-center justify-between border-b border-[#1a1a20] px-5 py-3">
          <div class="flex items-center gap-3">
            <span class="text-xl">🐛</span>
            <div>
              <h2 class="font-mono text-base font-bold tracking-widest text-[#f6b2a8]">BUG INVADER</h2>
              <p class="font-mono text-[10px] text-zinc-600">destrua os bugs antes que invadam o sistema</p>
            </div>
          </div>
          <button data-action="close-game" class="rounded-md border border-[#303036] bg-[#1f1f24] px-3 py-1.5 text-sm text-zinc-300 hover:bg-[#2b2b31]">Fechar</button>
        </div>
        <canvas id="invaders-canvas" width="760" height="480" class="block w-full rounded-b-2xl"></canvas>
      </section>
    </div>`;
}

function bootTemplate() {
  return `
    <div class="flex min-h-screen items-center justify-center bg-[#18181b] p-6 text-zinc-100">
      <section class="spark-field w-full max-w-md rounded-2xl border border-[#303036] bg-[#1b1b1f] p-8 text-center shadow-2xl shadow-black/30">
        <div class="relative mx-auto mb-7 flex h-28 w-28 items-center justify-center">
          <div class="boot-ring absolute h-24 w-24 rounded-full border border-[#df5d5d]"></div>
          <div class="absolute h-20 w-20 rounded-full border border-[#303036]"></div>
          <div class="boot-orbit absolute h-3 w-3 rounded-full bg-[#f2b56b]"></div>
          <div class="relative rounded-2xl bg-[#df5d5d] p-4 text-white shadow-xl shadow-[#df5d5d]/25">${icon('trending-up', 'h-9 w-9')}</div>
        </div>
        <h1 class="text-xl font-semibold">Carregando Stride</h1>
        <p class="mt-2 text-sm text-zinc-400">Preparando métricas e indicadores do time.</p>
        <div class="mt-7 space-y-3 text-left">
          ${bootStep('database', 'Carregando dados do time')}
          ${bootStep('chart-no-axes-combined', 'Montando linhas mensais')}
          ${bootStep('sparkles', 'Ativando modo dashboard')}
        </div>
        <div class="mt-7 h-2 overflow-hidden rounded-full bg-[#151519]">
          <div class="h-full w-3/4 rounded-full bg-[#df5d5d]"></div>
        </div>
      </section>
    </div>`;
}

function bootStep(iconName, label) {
  return `
    <div class="flex items-center gap-3 rounded-lg border border-[#303036] bg-[#151519] px-3 py-2 text-sm text-zinc-300">
      <span class="text-[#df5d5d]">${icon(iconName)}</span>
      <span>${label}</span>
      <span class="ml-auto text-xs text-[#f6b2a8]">ok</span>
    </div>`;
}

// ─── Space Invaders engine ─────────────────────────────────────────────────

let cleanupGame = null;

function initGame() {
  const canvas = document.getElementById('invaders-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const COLS = 10, ROWS = 4;
  const PAD_X = 60, PAD_Y = 72;
  const EX = (W - PAD_X * 2) / (COLS - 1);
  const EY = 52;
  const ROW_THEME = [
    { color: '#df5d5d', pts: 30 },
    { color: '#f97316', pts: 20 },
    { color: '#f2b56b', pts: 15 },
    { color: '#38bdf8', pts: 10 },
  ];

  function makeGame() {
    const enemies = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        enemies.push({ x: PAD_X + c * EX, y: PAD_Y + r * EY, alive: true, row: r, frame: 0, exploding: 0 });
      }
    }
    return {
      score: 0, lives: 3, over: false, won: false,
      player: { x: W / 2, y: H - 32, w: 32, h: 18, speed: 240 },
      bullets: [], eBullets: [],
      enemies,
      dir: 1, eSpeed: 26,
      shootCd: 0, eShootTimer: 1.2,
      lastTime: null, frameTimer: 0,
      shields: [W * 0.16, W * 0.37, W * 0.63, W * 0.84].map((sx) => ({
        x: sx, y: H - 80,
        blocks: Array.from({ length: 16 }, (_, i) => ({
          dx: (i % 4) * 10 - 15, dy: Math.floor(i / 4) * 8, hp: 3
        }))
      }))
    };
  }

  let g = makeGame();
  const keys = {};
  let rafId = null;

  function aliveOnly() { return g.enemies.filter((e) => e.alive); }

  function drawShip(x, y, w, h) {
    ctx.fillStyle = '#a3e635';
    ctx.beginPath();
    ctx.moveTo(x, y - h - 2);
    ctx.lineTo(x + w / 2 + 3, y + 2);
    ctx.lineTo(x - w / 2 - 3, y + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#86efac';
    ctx.beginPath(); ctx.moveTo(x - w/2, y - 4); ctx.lineTo(x - w/2 - 12, y + 2); ctx.lineTo(x - 6, y + 2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + w/2, y - 4); ctx.lineTo(x + w/2 + 12, y + 2); ctx.lineTo(x + 6, y + 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0ea5e9';
    ctx.beginPath(); ctx.ellipse(x, y - h / 2 - 2, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.ellipse(x, y + 4, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
  }

  function drawBug(e) {
    const { color } = ROW_THEME[e.row] || ROW_THEME[3];
    const la = (e.frame % 2 === 0) ? 2 : -2;
    // Scale from 24-unit SVG to ~28px; center at e.x, e.y
    const s = 1.18;
    const ox = e.x - 12 * s;
    const oy = e.y - 13 * s;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 5;

    // Head: circle at (12,6) r=3
    ctx.beginPath();
    ctx.arc(ox + 12*s, oy + 6*s, 3*s, 0, Math.PI * 2);
    ctx.stroke();

    // Body: ellipse centred at (12,13.5) rx=6 ry=6.5
    ctx.beginPath();
    ctx.ellipse(ox + 12*s, oy + 13.5*s, 6*s, 6.5*s, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Centre line: M12 20v-9
    ctx.beginPath();
    ctx.moveTo(ox + 12*s, oy + 11*s);
    ctx.lineTo(ox + 12*s, oy + 20*s);
    ctx.stroke();

    // Middle arms (animated): M6 13H2 / M22 13h-4
    ctx.beginPath();
    ctx.moveTo(ox + 6*s, oy + 13*s);
    ctx.lineTo(ox + 2*s, oy + 13*s + la);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ox + 18*s, oy + 13*s);
    ctx.lineTo(ox + 22*s, oy + 13*s + la);
    ctx.stroke();

    // Top arms (animated): M3 5… / M21 5…
    ctx.beginPath();
    ctx.moveTo(ox + 3*s, oy + 5*s);
    ctx.quadraticCurveTo(ox + 4*s, oy + 7*s, ox + 6.55*s, oy + (8.97 + la)*s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ox + 21*s, oy + 5*s);
    ctx.quadraticCurveTo(ox + 20*s, oy + 7*s, ox + 17.45*s, oy + (8.97 + la)*s);
    ctx.stroke();

    // Bottom legs (animated): M3 21… / M21 21…
    ctx.beginPath();
    ctx.moveTo(ox + 3*s, oy + 21*s);
    ctx.quadraticCurveTo(ox + 4*s, oy + 19*s, ox + 6.81*s, oy + (17 - la)*s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ox + 21*s, oy + 21*s);
    ctx.quadraticCurveTo(ox + 20*s, oy + 19*s, ox + 17.19*s, oy + (17 - la)*s);
    ctx.stroke();

    // Antennae: (8,2)→(9.88,3.88) and (14.12,3.88)→(16,2)
    ctx.beginPath();
    ctx.moveTo(ox + 8*s, oy + 2*s);
    ctx.lineTo(ox + 9.88*s, oy + 3.88*s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ox + 14.12*s, oy + 3.88*s);
    ctx.lineTo(ox + 16*s, oy + 2*s);
    ctx.stroke();

    ctx.shadowBlur = 0;
  }

  function drawExplosion(e) {
    const { color } = ROW_THEME[e.row] || ROW_THEME[3];
    ctx.globalAlpha = e.exploding;
    ctx.fillStyle = color;
    const dist = (1 - e.exploding) * 22;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * dist, e.y + Math.sin(a) * dist, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawShield(shield) {
    for (const b of shield.blocks) {
      if (b.hp <= 0) continue;
      ctx.globalAlpha = b.hp / 3;
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(shield.x + b.dx, shield.y + b.dy, 9, 7);
    }
    ctx.globalAlpha = 1;
  }

  function update(dt) {
    if (g.over || g.won) return;
    const p = g.player;

    const moveLeft  = keys['ArrowLeft']  || keys['a'] || keys['A'];
    const moveRight = keys['ArrowRight'] || keys['d'] || keys['D'];
    const fire      = keys[' '] || keys['ArrowUp'] || keys['w'] || keys['W'];

    if (moveLeft)  p.x = Math.max(p.w / 2 + 6, p.x - p.speed * dt);
    if (moveRight) p.x = Math.min(W - p.w / 2 - 6, p.x + p.speed * dt);

    g.shootCd -= dt;
    if (fire && g.shootCd <= 0 && g.bullets.length < 3) {
      g.bullets.push({ x: p.x, y: p.y - p.h - 4, vy: -500 });
      g.shootCd = 0.25;
    }

    g.bullets  = g.bullets.filter((b) => b.y > -10);
    g.eBullets = g.eBullets.filter((b) => b.y < H + 10);
    for (const b of g.bullets)  b.y += b.vy * dt;
    for (const b of g.eBullets) b.y += b.vy * dt;

    // Explosions fade
    for (const e of g.enemies) {
      if (e.exploding > 0) e.exploding = Math.max(0, e.exploding - dt * 2.5);
    }

    const livings = aliveOnly();
    if (!livings.length) { g.won = true; return; }

    g.frameTimer += dt;
    const stepInterval = Math.max(0.04, 0.22 - livings.length * 0.004);
    if (g.frameTimer >= stepInterval) {
      g.frameTimer = 0;
      let hitWall = false;
      const speed = g.eSpeed + (COLS * ROWS - livings.length) * 0.5;
      for (const e of livings) {
        e.x += g.dir * speed * stepInterval;
        e.frame++;
        if (e.x + 18 >= W - 8 || e.x - 18 <= 8) hitWall = true;
      }
      if (hitWall) {
        g.dir *= -1;
        for (const e of livings) e.y += 12;
        g.eSpeed = Math.min(g.eSpeed + 1.5, 90);
      }
    }

    g.eShootTimer -= dt;
    if (g.eShootTimer <= 0 && livings.length) {
      const shooter = livings[Math.floor(Math.random() * livings.length)];
      g.eBullets.push({ x: shooter.x, y: shooter.y + 14, vy: 210 + Math.random() * 90 });
      g.eShootTimer = 0.45 + Math.random() * (0.5 + livings.length * 0.018);
    }

    // Player bullet ↔ bug
    for (const b of g.bullets) {
      for (const e of g.enemies) {
        if (!e.alive) continue;
        if (Math.abs(b.x - e.x) < 16 && Math.abs(b.y - e.y) < 18) {
          e.alive = false; e.exploding = 1; b.y = -999;
          g.score += ROW_THEME[e.row]?.pts || 10;
        }
      }
    }

    // Bullets ↔ shields
    for (const sh of g.shields) {
      for (const bl of [...g.bullets, ...g.eBullets]) {
        for (const blk of sh.blocks) {
          if (blk.hp <= 0) continue;
          const bx = sh.x + blk.dx, by = sh.y + blk.dy;
          if (bl.x >= bx && bl.x <= bx + 9 && bl.y >= by && bl.y <= by + 7) {
            blk.hp -= 1;
            bl.y = bl.vy < 0 ? -999 : H + 999;
          }
        }
      }
    }

    // Enemy bullet ↔ player
    for (const b of g.eBullets) {
      if (Math.abs(b.x - p.x) < p.w / 2 + 2 && b.y >= p.y - p.h && b.y <= p.y + 6) {
        b.y = H + 999; g.lives -= 1;
        if (g.lives <= 0) g.over = true;
      }
    }

    for (const e of livings) {
      if (e.y + 18 >= H - 50) { g.over = true; break; }
    }
  }

  function draw() {
    ctx.fillStyle = '#06060a';
    ctx.fillRect(0, 0, W, H);

    // Stars
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    for (let i = 0; i < 55; i++) {
      const sz = i % 3 === 0 ? 2 : 1;
      ctx.fillRect((i * 139 + 11) % W, (i * 197 + 43) % (H - 28), sz, sz);
    }

    // Ground
    ctx.strokeStyle = '#166534'; ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(0, H - 18); ctx.lineTo(W, H - 18); ctx.stroke();
    ctx.setLineDash([]);

    for (const sh of g.shields) drawShield(sh);

    // Bugs
    for (const e of g.enemies) {
      if (e.exploding > 0) drawExplosion(e);
      else if (e.alive) drawBug(e);
    }

    if (!g.over) drawShip(g.player.x, g.player.y, g.player.w, g.player.h);

    // Player bullets
    ctx.shadowColor = '#a3e635'; ctx.shadowBlur = 6;
    ctx.fillStyle = '#a3e635';
    for (const b of g.bullets) { ctx.fillRect(b.x - 2, b.y, 4, 14); }

    // Enemy bullets (acid drool)
    ctx.shadowColor = '#f97316'; ctx.shadowBlur = 5;
    ctx.fillStyle = '#f97316';
    for (const b of g.eBullets) {
      ctx.beginPath(); ctx.ellipse(b.x, b.y, 3, 6, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;

    // HUD
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#a3e635'; ctx.textAlign = 'left';
    ctx.fillText(`SCORE  ${String(g.score).padStart(6, '0')}`, 14, 20);
    // Lives as small bug icons
    for (let i = 0; i < g.lives; i++) {
      const lx = W - 16 - i * 22; const ly = 11;
      ctx.strokeStyle = '#df5d5d'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      ctx.shadowColor = '#df5d5d'; ctx.shadowBlur = 3;
      const ss = 0.45; const lox = lx - 12*ss; const loy = ly - 13*ss;
      ctx.beginPath(); ctx.arc(lox+12*ss, loy+6*ss, 3*ss, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(lox+12*ss, loy+13.5*ss, 6*ss, 6.5*ss, 0, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(lox+6*ss, loy+13*ss); ctx.lineTo(lox+2*ss, loy+13*ss); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(lox+18*ss, loy+13*ss); ctx.lineTo(lox+22*ss, loy+13*ss); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(lox+8*ss, loy+2*ss); ctx.lineTo(lox+9.88*ss, loy+3.88*ss); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(lox+14.12*ss, loy+3.88*ss); ctx.lineTo(lox+16*ss, loy+2*ss); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    // Points legend
    ctx.font = '10px monospace'; ctx.textAlign = 'right';
    ROW_THEME.forEach(({ color, pts }, i) => {
      ctx.fillStyle = color;
      ctx.fillText(`▸ ${pts} pts`, W - 14, H - 50 + i * 13);
    });
    // Controls
    ctx.fillStyle = '#3f3f46'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
    ctx.fillText('← →  mover    ESPAÇO  atirar    R  reiniciar', W / 2, H - 5);

    if (g.over || g.won) {
      ctx.fillStyle = 'rgba(6,6,10,0.78)';
      ctx.fillRect(0, H / 2 - 52, W, 90);
      ctx.shadowColor = g.over ? '#df5d5d' : '#a3e635'; ctx.shadowBlur = 18;
      ctx.fillStyle = g.over ? '#df5d5d' : '#a3e635';
      ctx.font = 'bold 30px monospace'; ctx.textAlign = 'center';
      ctx.fillText(g.over ? 'GAME OVER' : 'SISTEMA LIMPO!', W / 2, H / 2 - 10);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#71717a'; ctx.font = '13px monospace';
      ctx.fillText(`SCORE  ${g.score}   —   pressione R para reiniciar`, W / 2, H / 2 + 22);
    }
    ctx.textAlign = 'left';
  }

  function loop(ts) {
    if (!document.getElementById('invaders-canvas')) return;
    if (g.lastTime === null) g.lastTime = ts;
    const dt = Math.min((ts - g.lastTime) / 1000, 0.05);
    g.lastTime = ts;
    update(dt);
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function onKeyDown(e) {
    keys[e.key] = true;
    if ((e.key === 'r' || e.key === 'R') && (g.over || g.won)) g = makeGame();
    if ([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault();
  }
  function onKeyUp(e) { keys[e.key] = false; }

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  rafId = requestAnimationFrame(loop);

  cleanupGame = () => {
    if (rafId) cancelAnimationFrame(rafId);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    rafId = null;
  };
}

function render() {
  document.body.dataset.theme = state.theme;
  const content = {
    dashboard: dashboardTemplate,
    insights: insightsTemplate,
    dados: dadosTemplate,
    ia: iaTemplate,
    config: configTemplate,
    runs: runsTemplate
  }[state.activeTab]();
  app.innerHTML = shell(content);
  paintIcons();

  // Game overlay lives outside #app so renders don't kill the canvas
  const overlay = document.getElementById('game-overlay');
  if (overlay) {
    if (state.showGame && !overlay.hasChildNodes()) {
      overlay.innerHTML = gameModalTemplate();
      paintIcons();
      const overlayHandler = (ev) => {
        if (ev.target.closest('[data-action="close-game"]')) {
          overlay.removeEventListener('click', overlayHandler);
          state.showGame = false;
          if (cleanupGame) { cleanupGame(); cleanupGame = null; }
          overlay.innerHTML = '';
          render();
        }
      };
      overlay.addEventListener('click', overlayHandler);
      initGame();
    } else if (!state.showGame && overlay.hasChildNodes()) {
      if (cleanupGame) { cleanupGame(); cleanupGame = null; }
      overlay.innerHTML = '';
    }
  }

  if (state.activeTab === 'ia') {
    const msgs = document.getElementById('ia-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }
}

async function loadIssuesData() {
  state.issuesData = null;
  render();
  const params = new URLSearchParams({ page: state.issuesPage, limit: 20, search: state.issuesSearch });
  if (state.issuesType) params.set('type', state.issuesType);
  state.issuesData = await api(`/api/data/issues?${params}`);
  render();
}

async function loadPrsData() {
  state.prsData = null;
  render();
  const params = new URLSearchParams({ page: state.prsPage, limit: 20, search: state.prsSearch });
  if (state.prsState) params.set('state', state.prsState);
  state.prsData = await api(`/api/data/prs?${params}`);
  render();
}

async function loadDeploymentsData() {
  state.deploymentsData = null;
  render();
  const params = new URLSearchParams({ page: state.deploymentsPage, limit: 20, search: state.deploymentsSearch });
  state.deploymentsData = await api(`/api/data/deployments?${params}`);
  render();
}


async function load() {
  render();
  const minimumBoot = new Promise((resolve) => setTimeout(resolve, 900));
  const [config, metrics, syncRuns, aiModels] = await Promise.all([
    api('/api/config'),
    api('/api/metrics'),
    api('/api/sync/runs'),
    api('/api/ai/models'),
    minimumBoot
  ]);
  state.config = config;
  state.metrics = metrics;
  state.runs = syncRuns.runs;
  state.aiModels = aiModels.models || [];
  state.booting = false;
  render();
}

app.addEventListener('click', async (event) => {
  const openIssueRow = event.target.closest('[data-action="open-issue"]');
  if (openIssueRow) {
    const id = openIssueRow.dataset.issueId;
    state.selectedIssue = (state.issuesData?.issues || []).find((i) => String(i.id) === id) || null;
    render();
    return;
  }

  const closeIssueBtn = event.target.closest('button[data-action="close-issue-modal"]');
  const closeIssueBackdrop = event.target.matches && event.target.matches('[data-action="close-issue-modal"]');
  if (closeIssueBtn || closeIssueBackdrop) {
    state.selectedIssue = null;
    render();
    return;
  }

  const toggleMenuButton = event.target.closest('[data-action="toggle-menu"]');
  if (toggleMenuButton) {
    state.menuCollapsed = !state.menuCollapsed;
    render();
  }

  const themeButton = event.target.closest('[data-action="theme"]');
  if (themeButton) {
    state.theme = themeButton.dataset.theme || 'dark';
    localStorage.setItem('kairo-theme', state.theme);
    render();
    return;
  }

  const secretButton = event.target.closest('[data-action="secret"]');
  if (secretButton) {
    state.easterClicks += 1;
    const logo = secretButton.querySelector('[data-secret-logo]');
    const rect = (logo || secretButton).getBoundingClientRect();
    const colors = ['#df5d5d', '#f2b56b', '#38bdf8', '#d946ef', '#22c55e'];
    state.stars = Array.from({ length: 14 }, (_, index) => ({
      x: rect.left + rect.width / 2 + (Math.random() * 34 - 17),
      y: rect.top + rect.height / 2 + (Math.random() * 34 - 17),
      color: colors[index % colors.length],
      delay: index * 24
    }));
    if (state.easterClicks >= 5) {
      state.showGame = true;
      state.easterClicks = 0;
    }
    render();
    setTimeout(() => {
      state.stars = [];
      render();
    }, 900);
  }

  const tabButton = event.target.closest('[data-tab]');
  if (tabButton) {
    const nextTab = tabButton.dataset.tab;
    state.activeTab = nextTab;
    state.notice = '';
    render();
    if (nextTab === 'dados') {
      if (state.datasSubTab === 'issues') loadIssuesData();
      else if (state.datasSubTab === 'prs') loadPrsData();
      else loadDeploymentsData();
    }
    return;
  }

  const dadosSubIssues = event.target.closest('[data-action="dados-sub-issues"]');
  if (dadosSubIssues) {
    state.datasSubTab = 'issues';
    state.issuesPage = 1;
    loadIssuesData();
    return;
  }

  const dadosSubPrs = event.target.closest('[data-action="dados-sub-prs"]');
  if (dadosSubPrs) {
    state.datasSubTab = 'prs';
    state.prsPage = 1;
    loadPrsData();
    return;
  }

  const dadosSubDeployments = event.target.closest('[data-action="dados-sub-deployments"]');
  if (dadosSubDeployments) {
    state.datasSubTab = 'deployments';
    state.deploymentsPage = 1;
    loadDeploymentsData();
    return;
  }

  const issuePrev = event.target.closest('[data-action="page-prev-issues"]');
  if (issuePrev && !issuePrev.disabled) {
    state.issuesPage = Math.max(1, state.issuesPage - 1);
    loadIssuesData();
    return;
  }

  const issueNext = event.target.closest('[data-action="page-next-issues"]');
  if (issueNext && !issueNext.disabled) {
    state.issuesPage = Math.min(state.issuesData?.pages || 1, state.issuesPage + 1);
    loadIssuesData();
    return;
  }

  const prPrev = event.target.closest('[data-action="page-prev-prs"]');
  if (prPrev && !prPrev.disabled) {
    state.prsPage = Math.max(1, state.prsPage - 1);
    loadPrsData();
    return;
  }

  const prNext = event.target.closest('[data-action="page-next-prs"]');
  if (prNext && !prNext.disabled) {
    state.prsPage = Math.min(state.prsData?.pages || 1, state.prsPage + 1);
    loadPrsData();
    return;
  }

  const deploymentPrev = event.target.closest('[data-action="page-prev-deployments"]');
  if (deploymentPrev && !deploymentPrev.disabled) {
    state.deploymentsPage = Math.max(1, state.deploymentsPage - 1);
    loadDeploymentsData();
    return;
  }

  const deploymentNext = event.target.closest('[data-action="page-next-deployments"]');
  if (deploymentNext && !deploymentNext.disabled) {
    state.deploymentsPage = Math.min(state.deploymentsData?.pages || 1, state.deploymentsPage + 1);
    loadDeploymentsData();
    return;
  }

  const aiQuick = event.target.closest('[data-action="ai-quick"]');
  if (aiQuick) {
    sendAiMessage(aiQuick.dataset.prompt);
    return;
  }

  const aiClear = event.target.closest('[data-action="ai-clear"]');
  if (aiClear) {
    state.aiMessages = [];
    render();
    return;
  }

  const insightAi = event.target.closest('[data-action="insight-ai"]');
  if (insightAi) {
    generateInsightAi();
    return;
  }

  const syncButton = event.target.closest('[data-action="sync"]');
  if (syncButton) {
    state.loading = true;
    state.loadingAction = 'sync';
    state.notice = '';
    render();
    const result = await api('/api/sync', { method: 'POST', body: '{}' });
    state.notice = result.results.map((item) => `${item.source}: ${item.message}`).join(' | ');
    state.loading = false;
    state.loadingAction = '';
    await load();
  }

  const resyncButton = event.target.closest('[data-action="resync"]');
  if (resyncButton) {
    state.loading = true;
    state.loadingAction = 'resync';
    state.notice = '';
    render();
    const result = await api('/api/resync', { method: 'POST', body: '{}' });
    state.notice = `Resync do zero concluido | ${result.results.map((item) => `${item.source}: ${item.message}`).join(' | ')}`;
    state.loading = false;
    state.loadingAction = '';
    await load();
  }
});

app.addEventListener('submit', async (event) => {
  const configForm = event.target.closest('[data-form="config"]');
  if (configForm) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(configForm));
    state.config = await api('/api/config', { method: 'POST', body: JSON.stringify(body) });
    state.notice = 'Configuracao salva.';
    state.activeTab = 'config';
    render();
    return;
  }

  const issuesForm = event.target.closest('[data-form="issues-search"]');
  if (issuesForm) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(issuesForm));
    state.issuesSearch = data.search || '';
    state.issuesType = data.type || '';
    state.issuesPage = 1;
    loadIssuesData();
    return;
  }

  const prsForm = event.target.closest('[data-form="prs-search"]');
  if (prsForm) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(prsForm));
    state.prsSearch = data.search || '';
    state.prsState = data.state || '';
    state.prsPage = 1;
    loadPrsData();
    return;
  }

  const deploymentsForm = event.target.closest('[data-form="deployments-search"]');
  if (deploymentsForm) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(deploymentsForm));
    state.deploymentsSearch = data.search || '';
    state.deploymentsPage = 1;
    loadDeploymentsData();
    return;
  }

  const aiForm = event.target.closest('[data-form="ai-chat"]');
  if (aiForm) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(aiForm));
    const msg = String(data.message || '').trim();
    if (!msg) return;
    aiForm.reset();
    sendAiMessage(msg);
    return;
  }
});

app.addEventListener('change', (event) => {
  const contextCheckbox = event.target.closest('[data-action="ai-context"]');
  if (contextCheckbox) {
    state.aiIncludeContext = contextCheckbox.checked;
  }
});

async function sendAiMessage(text) {
  if (state.aiLoading) return;
  state.aiMessages = [...state.aiMessages, { role: 'user', content: text }];
  state.aiLoading = true;
  render();
  try {
    const model = state.config?.openrouterModel || 'openai/gpt-4o-mini';
    const result = await api('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: state.aiMessages, model, includeContext: state.aiIncludeContext })
    });
    state.aiMessages = [...state.aiMessages, { role: 'assistant', content: result.content }];
  } catch (error) {
    state.aiMessages = [...state.aiMessages, { role: 'assistant', content: `Erro: ${error.message}` }];
  } finally {
    state.aiLoading = false;
    render();
  }
}

async function generateInsightAi() {
  if (state.insightLoading) return;
  state.insightLoading = true;
  state.insightAi = '';
  render();
  try {
    const model = state.config?.openrouterModel || 'openai/gpt-4o-mini';
    const result = await api('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ role: 'user', content: insightPrompt() }],
        model,
        includeContext: true
      })
    });
    state.insightAi = result.content;
  } catch (error) {
    state.insightAi = `Erro: ${error.message}`;
  } finally {
    state.insightLoading = false;
    render();
  }
}

load().catch((error) => {
  app.innerHTML = `<div class="p-6 text-red-300">Erro ao carregar app: ${error.message}</div>`;
});
