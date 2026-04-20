export type BasemapMode = 'topo' | 'satellite';

export interface ImportedRoute {
  id: string;
  name: string;
  sourceType: 'gpx' | 'geojson' | 'sample';
  featureCollection: GeoJSON.FeatureCollection<GeoJSON.LineString | GeoJSON.MultiLineString>;
  distanceKm: number;
  importedAt: string;
}

export interface OverlayState {
  roads: boolean;
  labels: boolean;
  hillshade: boolean;
  drivenRoutes: boolean;
}

export interface FeatureInfo {
  title: string;
  description: string;
}
