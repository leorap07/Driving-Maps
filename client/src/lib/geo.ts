import { gpx as parseGpx } from '@tmcw/togeojson';
import type { ImportedRoute } from '../types';

function toId() {
  return `route-${crypto.randomUUID()}`;
}

export function flattenToLineFeatures(
  collection: GeoJSON.FeatureCollection
): GeoJSON.FeatureCollection<GeoJSON.LineString | GeoJSON.MultiLineString> {
  const features = collection.features.filter(
    (f): f is GeoJSON.Feature<GeoJSON.LineString | GeoJSON.MultiLineString> =>
      !!f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString')
  );
  return { type: 'FeatureCollection', features };
}

export async function parseRouteFile(file: File): Promise<ImportedRoute> {
  const lowerName = file.name.toLowerCase();

  let featureCollection: GeoJSON.FeatureCollection;
  let sourceType: ImportedRoute['sourceType'];

  if (lowerName.endsWith('.gpx')) {
    const text = await file.text();
    const xml = new DOMParser().parseFromString(text, 'text/xml');
    featureCollection = parseGpx(xml) as GeoJSON.FeatureCollection;
    sourceType = 'gpx';
  } else if (lowerName.endsWith('.geojson') || lowerName.endsWith('.json')) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (parsed.type !== 'FeatureCollection') {
      throw new Error('GeoJSON must be a FeatureCollection.');
    }
    featureCollection = parsed;
    sourceType = 'geojson';
  } else {
    throw new Error('Unsupported file type. Use GPX or GeoJSON.');
  }

  const normalized = flattenToLineFeatures(featureCollection);
  if (normalized.features.length === 0) {
    throw new Error('No line features found in file.');
  }

  return {
    id: toId(),
    name: file.name,
    sourceType,
    featureCollection: normalized,
    importedAt: new Date().toISOString(),
    distanceKm: estimateDistanceKm(normalized),
  };
}

export function estimateDistanceKm(
  fc: GeoJSON.FeatureCollection<GeoJSON.LineString | GeoJSON.MultiLineString>
): number {
  let total = 0;
  for (const f of fc.features) {
    if (f.geometry.type === 'LineString') {
      total += lineDistance(f.geometry.coordinates);
    } else {
      for (const line of f.geometry.coordinates) {
        total += lineDistance(line);
      }
    }
  }
  return Number(total.toFixed(2));
}

function lineDistance(line: number[][]): number {
  let km = 0;
  for (let i = 1; i < line.length; i += 1) {
    km += haversine(line[i - 1], line[i]);
  }
  return km;
}

function haversine(a: number[], b: number[]): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const A =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(A), Math.sqrt(1 - A));
}
