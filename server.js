import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './src/db.js';
import { registerConfigRoutes } from './src/config.js';
import { registerDashboardRoutes } from './src/dashboard.js';
import { registerMetricsRoutes } from './src/metrics.js';
import { registerSyncRoutes } from './src/sync.js';
import { registerDataRoutes } from './src/data.js';
import { registerAiRoutes } from './src/ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routes = [];
const app = {
  get(routePath, handler) {
    routes.push({ method: 'GET', path: routePath, handler });
  },
  post(routePath, handler) {
    routes.push({ method: 'POST', path: routePath, handler });
  }
};
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const db = createDatabase(path.join(dataDir, 'stride.sqlite'));
const port = Number(process.env.PORT || 3000);

registerDashboardRoutes(app);
registerConfigRoutes(app, db);
registerMetricsRoutes(app, db);
registerSyncRoutes(app, db);
registerDataRoutes(app, db);
registerAiRoutes(app, db);

function contentType(filePath) {
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  return 'application/octet-stream';
}

function createResponse() {
  let status = 200;
  let type = 'application/json; charset=utf-8';
  let output = null;

  return {
    type(value) {
      type = value === 'html' ? 'text/html; charset=utf-8' : value;
      return this;
    },
    status(value) {
      status = value;
      return this;
    },
    json(body) {
      output = new Response(JSON.stringify(body), { status, headers: { 'content-type': type } });
      return output;
    },
    send(body) {
      output = new Response(body, { status, headers: { 'content-type': type } });
      return output;
    },
    finish() {
      return output || new Response(null, { status: 204 });
    }
  };
}

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/public/')) {
      const filePath = path.join(__dirname, url.pathname);
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file, { headers: { 'content-type': contentType(filePath) } });
      }
      return new Response('Not found', { status: 404 });
    }

    if (url.pathname === '/vendor/lucide.js') {
      const filePath = path.join(__dirname, 'node_modules', 'lucide', 'dist', 'umd', 'lucide.min.js');
      return new Response(Bun.file(filePath), { headers: { 'content-type': contentType(filePath) } });
    }

    const route = routes.find((item) => item.method === request.method && item.path === url.pathname);
    if (!route) return new Response('Not found', { status: 404 });

    try {
      const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
      const response = createResponse();
      const result = await route.handler({ body, query: Object.fromEntries(url.searchParams) }, response);
      return result || response.finish();
    } catch (error) {
      return new Response(JSON.stringify({ message: error.message }), {
        status: 500,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }
  }
});

console.log(`Stride DORA dashboard running at http://localhost:${port}`);
