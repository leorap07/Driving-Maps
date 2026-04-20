# Colorado Drive Map

Standalone Colorado mapping app with topo/satellite views, terrain-aware rendering, road and label overlays, and importable driven routes.

## Open it

No installation is required to view the app.

1. Open [index.html](./index.html) in your browser.
2. Keep an internet connection on so the free map tiles, labels, terrain, and satellite imagery can load.

If your browser is strict about opening local files, a lightweight fallback is:

```bash
python3 -m http.server
```

Then visit `http://localhost:8000`.

## Primary stack

- **Viewer:** plain HTML, CSS, and JavaScript at the repo root
- **Map engine:** MapLibre GL JS loaded from CDN
- **Storage:** browser localStorage for imported routes
- **Data tooling:** optional Node scripts in `scripts/`

## Project structure

- `index.html` standalone app entrypoint
- `app.js` map logic, GPX/GeoJSON import, and local persistence
- `styles.css` standalone UI styling
- `data/` canonical sample GeoJSON data
- `docs/` data source notes
- `client/` and `server/` legacy scaffold kept for future expansion, not required to view the app

## Features

- Colorado-focused camera and bounds
- Basemap selector:
  - Topographic mode via OpenTopoMap
  - Satellite mode via Esri World Imagery
- Terrain rendering:
  - Terrarium raster DEM for terrain
  - Hillshade toggle
  - Approximate elevation on click and cursor move
- Roads and labels overlays from OpenStreetMap vector tiles
- Colorado boundary overlay
- Sample scenic overlay polygon
- Driven routes:
  - Import `.gpx` and `.geojson`
  - Local persistence in browser storage
  - Route list with distance
  - Click a route in the sidebar or on the map to focus it

## Route import

Use the left sidebar file picker.

Supported inputs:
- `.gpx`
- `.geojson`
- `.json` containing GeoJSON line data

Imported routes are saved in browser local storage under the standalone app key.

## Sample data

Canonical sample files live here:
- `data/boundaries/colorado-boundary.geojson`
- `data/routes/sample-route.geojson`
- `data/overlays/sample-overlay.geojson`

The standalone app embeds equivalent seed data directly in `app.js` so it works over `file://` without fetch requests.

## Data source notes and replacement

See `docs/data-sources.md`.

To swap map sources in the standalone viewer, edit the `buildMapStyle()` function in [app.js](./app.js).

## Optional tooling

The optional utility scripts remain available if you later set up Node:

```bash
node scripts/import-gpx.mjs input.gpx output.geojson
node scripts/import-geojson.mjs input.geojson output.geojson
node scripts/normalize-routes.mjs input.geojson output.geojson
node scripts/load-colorado-boundary.mjs
```

## Satellite fallback

Satellite imagery uses Esri public World Imagery. If it is unavailable in your environment, switch back to topographic mode.

## TODO

- Road matching or map matching imported tracks to known road geometry
- Full 3D terrain mesh and more advanced DEM processing
- Offline tile caching
- Per-road completion tracking for driven metrics
- Highway-only driven filter
- County crossing stats for imported routes
