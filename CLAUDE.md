# TornadoTracker

Displays past and recent tornado information using the NWS API.

## Tech Stack
- Vanilla JS + Vite (no framework)
- date-fns for date formatting
- Pub/sub Store pattern (adapted from Birding Weather Dashboard)

## Architecture
- `src/main.js` — orchestrator: init, polling, view routing
- `src/state/store.js` — centralized pub/sub state management
- `src/api/` — NWS API client with error handling
- `src/utils/textParser.js` — regex parser for NWS product text (PNS tornado surveys, TOR warning polygons)
- `src/ui/` — UI components that subscribe to store changes (master/detail layout: sidebar feed + detail panel)
- `src/modules/productCache.js` — in-memory cache with TTL

## NWS API
- Base URL: `https://api.weather.gov`
- No auth required, but needs User-Agent header
- Product list: `GET /products?type=PNS&limit=50`
- Product detail: `GET /products/{uuid}`
- Products are free-form text; tornado data is extracted via regex parsing

## Key Patterns
- Components subscribe to specific store keys and re-render on change
- Custom DOM events (`tt:*`) for cross-component communication
- `Promise.allSettled` for parallel multi-type fetches
- Product details cached in-memory with 30-min TTL

## Commands
- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run preview` — preview production build

## Workflow Rules
- Always commit and push once all tests come back clean
