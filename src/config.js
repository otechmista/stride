const CONFIG_KEYS = [
  'jiraBaseUrl',
  'jiraEmail',
  'jiraApiToken',
  'jiraProjectKey',
  'githubToken',
  'githubOwner',
  'openrouterApiKey',
  'openrouterModel'
];

function mask(value) {
  if (!value) return '';
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export function createConfigRepository(db) {
  return {
    getAll() {
      const rows = db.prepare('select key, value from settings').all();
      return Object.fromEntries(rows.map((row) => [row.key, row.value]));
    },
    save(input) {
      const statement = db.prepare(`
        insert into settings (key, value, updated_at)
        values (?, ?, current_timestamp)
        on conflict(key) do update set value = excluded.value, updated_at = current_timestamp
      `);

      const transaction = db.transaction((entries) => {
        for (const [key, value] of entries) {
          if (CONFIG_KEYS.includes(key)) statement.run(key, String(value || '').trim());
        }
      });

      transaction(Object.entries(input));
    }
  };
}

export function createConfigService(repository) {
  return {
    getConfig({ masked = false } = {}) {
      const config = repository.getAll();
      return {
        jiraBaseUrl: config.jiraBaseUrl || '',
        jiraEmail: config.jiraEmail || '',
        jiraApiToken: masked ? mask(config.jiraApiToken) : config.jiraApiToken || '',
        jiraProjectKey: config.jiraProjectKey || '',
        githubToken: masked ? mask(config.githubToken) : config.githubToken || '',
        githubOwner: config.githubOwner || '',
        openrouterApiKey: masked ? mask(config.openrouterApiKey) : config.openrouterApiKey || '',
        openrouterModel: config.openrouterModel || 'openai/gpt-4o-mini'
      };
    },
    saveConfig(input) {
      repository.save(input);
      return this.getConfig({ masked: true });
    }
  };
}

export function presentConfig(config) {
  return {
    ...config,
    jiraConfigured: Boolean(config.jiraBaseUrl && config.jiraEmail && config.jiraApiToken),
    githubConfigured: Boolean(config.githubToken && config.githubOwner),
    openrouterConfigured: Boolean(config.openrouterApiKey)
  };
}

export function registerConfigRoutes(app, db) {
  const service = createConfigService(createConfigRepository(db));

  app.get('/api/config', (request, response) => {
    response.json(presentConfig(service.getConfig({ masked: true })));
  });

  app.post('/api/config', (request, response) => {
    const current = service.getConfig();
    const next = { ...current, ...request.body };

    if (request.body.jiraApiToken?.includes('••••')) next.jiraApiToken = current.jiraApiToken;
    if (request.body.githubToken?.includes('••••')) next.githubToken = current.githubToken;
    if (request.body.openrouterApiKey?.includes('••••')) next.openrouterApiKey = current.openrouterApiKey;

    response.json(presentConfig(service.saveConfig(next)));
  });
}
