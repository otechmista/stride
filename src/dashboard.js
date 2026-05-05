export function renderDashboard() {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Stride</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="/public/styles.css" />
  </head>
  <body class="min-h-screen bg-[#18181b] text-[#f4f4f5]">
    <main id="app"></main>
    <div id="game-overlay"></div>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script src="/vendor/lucide.js"></script>
    <script type="module" src="/public/app.js"></script>
  </body>
</html>`;
}

export function registerDashboardRoutes(app) {
  app.get('/', (request, response) => {
    response.type('html').send(renderDashboard());
  });
}
