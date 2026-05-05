# Stride DORA Dashboard

Stride DORA is an open source desktop dashboard for understanding software delivery health across Jira and GitHub.

It helps teams track monthly delivery flow, backlog pressure, bug handling, pull requests, deploys, and actionable insights in one local app.

## Website

The project website is available as a static page at:

```text
docs/index.html
```

You can open it directly in a browser or publish the `docs` folder with GitHub Pages.

## Repository

GitHub: https://github.com/otechmista/stride

Issues: https://github.com/otechmista/stride/issues

## What Stride Does

- Shows monthly DORA-style delivery metrics.
- Tracks lead time, throughput, fixed bugs, created cards, backlog bugs, and backlog cards.
- Reads GitHub pull requests and treats merges into `main` or `master` as deploys.
- Groups Jira statuses into `To do`, `Doing`, and `Done`.
- Lists Jira cards, GitHub PRs, and deploy events in a minimal activity view.
- Provides fixed insights based on the charts.
- Can use OpenRouter to generate an AI review of the current metrics.
- Stores synchronized data locally in SQLite.

## Install

Install [Bun](https://bun.sh) first.

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

Linux/macOS:

```bash
chmod +x ./scripts/install.sh ./scripts/start-stride.sh
./scripts/install.sh
```

The installers run `bun install`, prepare Electron, and create a desktop launcher when the operating system allows it.

## Run Manually

Desktop app:

```bash
bun run dev:desktop
```

Web server:

```bash
bun run dev
```

Then open:

```text
http://localhost:3000
```

## Configuration

Configure integrations inside the app:

- Jira URL, email, API token, and optional project key.
- GitHub token and owner.
- OpenRouter key and model, optional, for AI insights.

When the Jira project key is empty, Stride fetches all accessible active projects. During development, local data is stored in `data/stride.sqlite`.
