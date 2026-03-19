# TornadoTracker

Displays past and recent tornado information using the NWS API.

## Tech Stack
- Vanilla JS + Vite (no framework)
- Leaflet for mapping
- date-fns for date formatting
- Pub/sub Store pattern (adapted from Birding Weather Dashboard)

## Architecture
- `src/main.js` — orchestrator: init, polling, view routing
- `src/state/store.js` — centralized pub/sub state management
- `src/api/` — NWS API client with error handling
- `src/utils/textParser.js` — regex parser for NWS product text (PNS tornado surveys, TOR warning polygons)
- `src/ui/` — UI components that subscribe to store changes
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

## Android Companion App
- Located in `android/` subdirectory
- Kotlin + Jetpack Compose + Material 3, MVVM architecture
- Hilt DI, Retrofit, Room, WorkManager, osmdroid
- `android/app/src/main/java/com/tornadotracker/domain/parser/NwsTextParser.kt` — Kotlin port of `src/utils/textParser.js`

## Commands
- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run preview` — preview production build
- `cd android && ./gradlew assembleDebug` — build Android app

## Workflow Rules
- When any change is made to the web app, the corresponding change must also be made to the Android app (e.g., parser logic, API changes, constants, UI behavior)
- Always commit and push once all tests come back clean
