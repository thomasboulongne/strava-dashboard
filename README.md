# Strava Dashboard

A React dashboard for viewing your Strava activities and stats.

## Setup

### Prerequisites

- Node.js 18+
- A Strava API application (create one at https://www.strava.com/settings/api)
- Netlify CLI (`npm install -g netlify-cli` or use the local dev dependency)

### Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# Required: Strava API credentials
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret

# Required: Site URL for OAuth callback
SITE_URL=http://localhost:8888

# Optional: Override the API base URL (defaults to /api)
# Useful for pointing to a different backend or testing
# VITE_API_URL=/api
```

### Development

```bash
# Install dependencies
npm install

# Start the Netlify dev server (includes both frontend and API functions)
npm run dev:netlify
```

**Important:** Access the app at `http://localhost:8888` (Netlify dev server), not `http://localhost:5173` (Vite only).

### Production Build

```bash
npm run build
```

## MCP server for ChatGPT

A read-only [Model Context Protocol](https://modelcontextprotocol.io) server is
exposed at `/mcp` so a ChatGPT agent can fetch your stored Strava data and build
training plans from it. It reuses the same Neon database as the dashboard and
never exposes OAuth tokens.

### Multi-user access (per-user keys)

Each logged-in user generates a personal key on the dashboard **Settings** page.
The key maps to that user's athlete and is carried in the connector URL
(`https://<your-site>/mcp?key=<secret>`), so multiple users can each connect
ChatGPT to their own data. Keys can be revoked anytime from the same page.

- `GET/POST/DELETE /api/mcp-key` — list / create / revoke keys (authenticated).
- The `/mcp` endpoint resolves the key (from `?key=`, `Authorization: Bearer`,
  or `x-mcp-secret`) to an athlete and returns 401 if it's missing/invalid.

### Environment variables

```bash
# LOCAL DEV ONLY: serve this athlete when /mcp is called without a key.
# Leave empty in production (real users authenticate via their key).
MCP_ATHLETE_ID=
```

### Read tools

- `list_activities` — recent activities as compact summaries (date/sport filters)
- `get_activity` — full activity detail + lap splits + HR/power stream summary (time-in-zone)
- `get_activity_summary` — cycling-aware training load by ISO week and sport: volume, relative effort, TSS/IF, kilojoules, weighted-average watts, HR, ride/power/indoor counts, plus overall acute-vs-chronic load (ramp ratio) and which weeks have a saved report. FTP is read from the cached value in the `users` table (refreshed whenever the dashboard loads `/api/athlete`); fallback is estimated from power zones.
- `export_activities` — bulk per-activity rows (up to 1000) over a date range with cycling/power fields, day-of-week / local start time, and `private_note`, for habit and long-range analysis
- `get_weekly_reports` — saved weekly markdown reports (qualitative context) over a date range
- `get_training_plan` — planned workouts for a week (with ids needed for edits)
- `get_athlete_zones` — heart-rate and power zone ranges
- `get_athlete_profile` — name and Strava ID (no credentials)
- `search` / `fetch` — keyword search + document fetch (broad ChatGPT/deep-research compatibility)

### Write tools

The connector key is read-write: these tools modify your data. They carry MCP
annotations (`readOnlyHint: false`, `destructiveHint` where relevant), so ChatGPT
asks for confirmation before calling them. Every write is scoped to the key's athlete.

- `upsert_training_plan` — create/replace a week's plan from structured workouts (`mode: replace | merge`)
- `update_workout` — edit a single workout's fields by id
- `delete_training_plan` — clear a week's plan (destructive)
- `link_activity_to_workout` / `unlink_activity_from_workout` — manage activity links
- `upsert_weekly_report` — save/replace the weekly report (title + markdown)

### Connect it in ChatGPT

1. Deploy the site (or expose `http://localhost:8888/mcp` via a tunnel such as ngrok).
2. On the dashboard **Settings** page, generate a key and copy your connector URL.
3. In ChatGPT: **Settings → Apps & Connectors → Advanced settings → Developer mode**.
4. Click **Create**, paste your connector URL (`.../mcp?key=...`), and choose
   **No Authentication**.
5. Enable the connector in a chat (Developer mode menu) and ask it to fetch your
   recent activities and draft a plan.

### Test locally

```bash
npm run dev:netlify
npx @modelcontextprotocol/inspector
# Point the inspector at http://localhost:8888/mcp (Streamable HTTP)
```

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite
- **State Management:** Zustand, TanStack Query
- **UI:** Radix UI Themes
- **Backend:** Netlify Functions
- **MCP:** `@modelcontextprotocol/sdk` (Streamable HTTP) at `/mcp`
- **Routing:** React Router v7
