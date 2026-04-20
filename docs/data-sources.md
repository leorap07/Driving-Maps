# Data Sources

## Basemaps and terrain
- OpenTopoMap raster tiles (`tile.opentopomap.org`) for topo mode.
- Esri World Imagery (`services.arcgisonline.com`) for satellite mode.
- Terrarium DEM tiles from `elevation-tiles-prod` for terrain and hillshade.

## Roads and labels
- OpenStreetMap vector tiles via OpenFreeMap endpoint (`tiles.openfreemap.org/planet`).

## Colorado-specific local data
- `data/boundaries/colorado-boundary.geojson` (seed boundary)
- `data/routes/sample-route.geojson` (seed driven route)
- `data/overlays/sample-overlay.geojson` (seed local overlay)

The standalone viewer embeds matching seed data directly in `app.js` so it can run from `file://` without local fetch requests.

## Optional Colorado portals
- Colorado Parks & Wildlife GIS: https://cpw.state.co.us/maps-and-gis
- Colorado state geospatial portal datasets can be added into `data/` and wired into the standalone viewer or future app scaffolds as needed.
