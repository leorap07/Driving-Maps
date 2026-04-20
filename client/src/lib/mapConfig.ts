export const COLORADO_CENTER: [number, number] = [-105.55, 39.0];

export const COLORADO_BOUNDS: [[number, number], [number, number]] = [
  [-109.1, 36.9],
  [-102.0, 41.1],
];

export const mapStyle = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    topoRaster: {
      type: 'raster',
      tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenTopoMap © OpenStreetMap Contributors',
    },
    satelliteRaster: {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: 'Esri, Maxar, Earthstar Geographics',
    },
    osmVector: {
      type: 'vector',
      tiles: ['https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf'],
      minzoom: 0,
      maxzoom: 14,
      attribution: '© OpenStreetMap contributors',
    },
    terrainDem: {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 14,
      encoding: 'terrarium',
      attribution: 'Mapzen Terrarium / AWS public dataset',
    },
  },
  layers: [
    {
      id: 'satellite-base',
      type: 'raster',
      source: 'satelliteRaster',
      layout: { visibility: 'none' },
    },
    {
      id: 'topo-base',
      type: 'raster',
      source: 'topoRaster',
      layout: { visibility: 'visible' },
    },
    {
      id: 'hillshade',
      type: 'hillshade',
      source: 'terrainDem',
      layout: { visibility: 'visible' },
      paint: {
        'hillshade-exaggeration': 0.4,
      },
    },
    {
      id: 'roads',
      type: 'line',
      source: 'osmVector',
      'source-layer': 'transportation',
      layout: { visibility: 'visible' },
      paint: {
        'line-color': '#f8fafc',
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          5,
          0.5,
          10,
          1,
          14,
          2.5,
        ],
      },
    },
    {
      id: 'place-labels',
      type: 'symbol',
      source: 'osmVector',
      'source-layer': 'place',
      layout: {
        visibility: 'visible',
        'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          6,
          11,
          10,
          13,
          13,
          16,
        ],
      },
      paint: {
        'text-color': '#f8fafc',
        'text-halo-color': '#0f172a',
        'text-halo-width': 1,
      },
    },
  ],
} as const;
