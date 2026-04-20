#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node scripts/import-gpx.mjs <input.gpx> <output.geojson>');
  process.exit(1);
}

const xml = await readFile(input, 'utf8');
const trackPoints = [...xml.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)"/g)].map((m) => [
  Number(m[2]),
  Number(m[1]),
]);

if (trackPoints.length < 2) {
  throw new Error('No track points found in GPX file');
}

const geojson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: input },
      geometry: { type: 'LineString', coordinates: trackPoints },
    },
  ],
};

await writeFile(output, JSON.stringify(geojson, null, 2));
console.log(`Converted ${input} to ${output}`);
