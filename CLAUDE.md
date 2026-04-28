# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Two processes must run simultaneously:

```bash
npm run dev      # Vite frontend — http://127.0.0.1:5173
npm run api      # Node proxy backend — http://127.0.0.1:3001
```

```bash
npm run build    # Production build to dist/
npm run preview  # Serve dist/ locally
```

## Environment

Copy `.env.example` to `.env` and fill in:

```
PORT=3001
CORS_ORIGIN=http://127.0.0.1:5173
EVOLUTION_URL=https://evolution.botcruzeiro.space
EVOLUTION_API_KEY=<chave>
```

## Architecture

### Two-process split

- **Frontend** (`main.js` + `views/` + `style.css`) — Vite-bundled vanilla JS, no framework
- **Backend** (`server.js`) — zero-dependency Node HTTP server that proxies all calls to Evolution API, hiding the API key from the browser

Frontend calls `/api/*` on port 3001; `server.js` translates those to Evolution API endpoints and forwards them.

### View pattern

Every file in `views/` exports two functions:

```js
export function render() { return `<html string>` }   // synchronous
export async function setup(root) { /* bind events, load data */ }
```

`main.js` lazy-imports the active view, writes `render()` into `.content-view`, then calls `setup()`. Never manipulate the DOM inside `render()` — always in `setup()`.

Load order: show skeleton (`skeletonCards`, `skeletonTable` from `components.js`) → fetch data in `setup()` → replace skeleton with real HTML.

### Service layer (`services.js`)

Two types of exports:

1. **Mock services** (`CampaignService`, `LeadService`, `ConversationService`, `TemplateService`, `SettingsService`) — in-memory data with simulated delays. Replace with real API calls when ready; the UI already handles async correctly.

2. **`WhatsAppInstanceService`** — real HTTP calls to the Node proxy at `VITE_API_BASE` (defaults to `http://127.0.0.1:3001`).

### Shared UI utilities

| File | Purpose |
|------|---------|
| `components.js` | `metric`, `badge`, `progress`, `skeletonCards`, `skeletonTable`, `emptyState`, `animateMetrics` |
| `modal.js` | `openModal({ title, body, submitLabel, onSubmit, onCancel })` — returns `{ close }` |
| `toast.js` | `toast(message, type)` — types: `success`, `error`, `warning`, `info` |
| `icons.js` | SVG icon map keyed by name |

### Template variables

Message templates use `{nome_empresa}`, `{cidade}`, `{nicho}` as interpolation tokens. These are currently rendered as-is in the UI; substitution happens at send time.

### WhatsApp / Evolution API notes

- Auth: `apikey` header (never expose in frontend)
- QR codes expire after ~45 seconds; `instances.js` polls every 5s and shows countdown
- Instance names are slugified (lowercase, underscores, no accents) before sending to Evolution
- Connection states from Evolution: `open`, `connecting`, `close`, `reiniciando`
- `server.js` normalizes QR response shapes across Evolution API versions via `normalizeQrCode()`
