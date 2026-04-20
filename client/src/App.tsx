import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { BasemapMode, FeatureInfo, ImportedRoute, OverlayState } from './types';
import { COLORADO_BOUNDS, COLORADO_CENTER, mapStyle } from './lib/mapConfig';
import { loadRoutes, saveRoutes } from './lib/storage';
import { parseRouteFile } from './lib/geo';

const defaultOverlays: OverlayState = {
  roads: true,
  labels: true,
  hillshade: true,
  drivenRoutes: true,
};

export default function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const [loading, setLoading] = useState('Initializing map…');
  const [info, setInfo] = useState<FeatureInfo>({
    title: 'Colorado Drive Map',
    description: 'Import GPX/GeoJSON to highlight roads you have driven.',
  });
  const [routes, setRoutes] = useState<ImportedRoute[]>(() => loadRoutes());
  const [basemapMode, setBasemapMode] = useState<BasemapMode>('topo');
  const [overlays, setOverlays] = useState<OverlayState>(defaultOverlays);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyle as maplibregl.StyleSpecification,
      center: COLORADO_CENTER,
      zoom: 6.5,
      hash: true,
      maxPitch: 70,
    });

    map.fitBounds(COLORADO_BOUNDS, { padding: 40, duration: 0 });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'imperial' }), 'bottom-right');

    map.on('load', async () => {
      setLoading('Loading Colorado boundary and sample data…');

      map.setTerrain({ source: 'terrainDem', exaggeration: 1.2 });

      const [boundary, sampleRoute, sampleOverlay] = await Promise.all([
        fetch('/data/colorado-boundary.geojson').then((r) => r.json()),
        fetch('/data/sample-route.geojson').then((r) => r.json()),
        fetch('/data/sample-overlay.geojson').then((r) => r.json()),
      ]);

      map.addSource('colorado-boundary', { type: 'geojson', data: boundary });
      map.addLayer({
        id: 'co-boundary-line',
        type: 'line',
        source: 'colorado-boundary',
        paint: { 'line-color': '#f59e0b', 'line-width': 2 },
      });

      map.addSource('sample-overlay', { type: 'geojson', data: sampleOverlay });
      map.addLayer({
        id: 'sample-overlay-fill',
        type: 'fill',
        source: 'sample-overlay',
        paint: { 'fill-color': '#22d3ee', 'fill-opacity': 0.15 },
      });

      if (routes.length === 0) {
        const seeded: ImportedRoute = {
          id: 'sample-route',
          name: 'Sample Front Range Route',
          sourceType: 'sample',
          featureCollection: sampleRoute,
          distanceKm: 113.7,
          importedAt: new Date().toISOString(),
        };
        setRoutes([seeded]);
      }

      map.on('click', (event) => {
        const elevation = map.queryTerrainElevation(event.lngLat);
        setInfo({
          title: `Point ${event.lngLat.lat.toFixed(4)}, ${event.lngLat.lng.toFixed(4)}`,
          description: elevation
            ? `Approx elevation: ${(elevation * 3.28084).toFixed(0)} ft.`
            : 'Elevation unavailable at this zoom/location.',
        });
      });

      map.on('mousemove', (event) => {
        const elevation = map.queryTerrainElevation(event.lngLat);
        if (!elevation) return;
        setInfo((previous) => ({
          ...previous,
          description: `Cursor: ${event.lngLat.lat.toFixed(3)}, ${event.lngLat.lng.toFixed(
            3
          )} • Elevation ~${(elevation * 3.28084).toFixed(0)} ft`,
        }));
      });

      setLoading('');
    });

    map.on('error', (event) => {
      setLoading('Map source error. See README for fallback guidance.');
      // eslint-disable-next-line no-console
      console.error(event.error);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [routes.length]);

  useEffect(() => {
    saveRoutes(routes);

    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const data: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: routes.flatMap((route) => route.featureCollection.features),
    };

    const existingSource = map.getSource('driven-routes') as maplibregl.GeoJSONSource | undefined;
    if (!existingSource) {
      map.addSource('driven-routes', { type: 'geojson', data });
      map.addLayer({
        id: 'driven-routes-line',
        type: 'line',
        source: 'driven-routes',
        paint: {
          'line-color': '#22c55e',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 2, 10, 4, 14, 7],
          'line-opacity': 0.9,
        },
      });

      map.on('click', 'driven-routes-line', (event) => {
        const name = (event.features?.[0]?.properties?.name as string | undefined) ?? 'Imported route';
        setInfo({
          title: name,
          description: 'Driven route feature selected. Future: map matching to road geometry.',
        });
      });

      map.on('mouseenter', 'driven-routes-line', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'driven-routes-line', () => {
        map.getCanvas().style.cursor = '';
      });
    } else {
      existingSource.setData(data);
    }

    map.setLayoutProperty(
      'driven-routes-line',
      'visibility',
      overlays.drivenRoutes ? 'visible' : 'none'
    );
  }, [routes, overlays.drivenRoutes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    map.setLayoutProperty('topo-base', 'visibility', basemapMode === 'topo' ? 'visible' : 'none');
    map.setLayoutProperty('satellite-base', 'visibility', basemapMode === 'satellite' ? 'visible' : 'none');
    map.setLayoutProperty('roads', 'visibility', overlays.roads ? 'visible' : 'none');
    map.setLayoutProperty('place-labels', 'visibility', overlays.labels ? 'visible' : 'none');
    map.setLayoutProperty('hillshade', 'visibility', overlays.hillshade ? 'visible' : 'none');
  }, [basemapMode, overlays]);

  const totalDistance = useMemo(
    () => routes.reduce((sum, route) => sum + route.distanceKm, 0).toFixed(1),
    [routes]
  );

  async function onImportChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const route = await parseRouteFile(file);
      setRoutes((previous) => [route, ...previous]);
      setInfo({
        title: route.name,
        description: `Imported ${route.sourceType.toUpperCase()} with ${route.distanceKm} km of track.`,
      });
    } catch (error) {
      setInfo({
        title: 'Import error',
        description: error instanceof Error ? error.message : 'Unknown file parse error',
      });
    } finally {
      event.target.value = '';
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>Colorado Drive Map</h1>
        <p className="muted">Local-first map focused on Colorado roads, terrain, and your driven routes.</p>

        <section className="card">
          <h2>Basemap</h2>
          <label>
            <input
              type="radio"
              name="basemap"
              checked={basemapMode === 'topo'}
              onChange={() => setBasemapMode('topo')}
            />
            Topographic
          </label>
          <label>
            <input
              type="radio"
              name="basemap"
              checked={basemapMode === 'satellite'}
              onChange={() => setBasemapMode('satellite')}
            />
            Satellite
          </label>
        </section>

        <section className="card">
          <h2>Overlays</h2>
          {(
            [
              ['roads', 'Roads'],
              ['labels', 'Labels'],
              ['hillshade', 'Hillshade / terrain'],
              ['drivenRoutes', 'Driven routes'],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={overlays[key]}
                onChange={() => setOverlays((prev) => ({ ...prev, [key]: !prev[key] }))}
              />
              {label}
            </label>
          ))}
        </section>

        <section className="card">
          <h2>Import Route</h2>
          <input type="file" accept=".gpx,.geojson,.json" onChange={onImportChange} />
          <p className="muted">GPX and GeoJSON supported. Imported routes stay in local storage.</p>
        </section>

        <section className="card">
          <h2>Route List</h2>
          <ul className="route-list">
            {routes.map((route) => (
              <li key={route.id}>
                <strong>{route.name}</strong>
                <span>
                  {route.sourceType} • {route.distanceKm} km
                </span>
              </li>
            ))}
          </ul>
          <p>Total distance: {totalDistance} km</p>
        </section>

        <section className="card">
          <h2>Legend</h2>
          <p>
            <span className="swatch driven" /> Driven routes
          </p>
          <p>
            <span className="swatch boundary" /> Colorado boundary
          </p>
          <p>
            <span className="swatch overlay" /> Sample overlay (park-like layer)
          </p>
        </section>
      </aside>

      <main className="map-column">
        <div ref={mapContainerRef} className="map-container" />
        <section className="info-panel">
          <h3>{info.title}</h3>
          <p>{info.description}</p>
          {loading && <p className="loading">{loading}</p>}
        </section>
      </main>
    </div>
  );
}
