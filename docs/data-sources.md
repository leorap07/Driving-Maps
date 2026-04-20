# Data Sources

## Basemaps and terrain
- OpenTopoMap raster tiles (`tile.opentopomap.org`) for the toned-down topo basemap.
- Esri World Imagery (`services.arcgisonline.com`) for satellite mode.
- Terrarium DEM tiles from `elevation-tiles-prod` for terrain and hillshade.

## Roads and labels
- Roads and labels come from OpenStreetMap vector tiles via OpenFreeMap (`tiles.openfreemap.org/planet`).
- National park outlines are styled from the OpenMapTiles/OpenFreeMap `park` layer using `class=national_park`.

## Route planning
- Interactive road-pen routing uses the public OSRM demo API (`router.project-osrm.org`) with the `nearest` and `route` services.
- The standalone viewer falls back to visible-road tracing in `app.js` if live routing is unavailable.

## Colorado-specific local data
- `data/boundaries/colorado-boundary.geojson` (seed boundary)
- `data/overlays/sample-overlay.geojson` (seed local overlay)

The standalone viewer embeds the Colorado boundary directly in `app.js` so it can run from `file://` without local fetch requests.

## Optional Colorado portals
- Colorado Parks & Wildlife GIS: https://cpw.state.co.us/maps-and-gis
- Colorado state geospatial portal datasets can be added into `data/` and wired into the standalone viewer or future app scaffolds as needed.
