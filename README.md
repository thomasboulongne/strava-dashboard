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

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite
- **State Management:** Zustand, TanStack Query
- **UI:** Radix UI Themes
- **Backend:** Netlify Functions
- **Routing:** React Router v7
