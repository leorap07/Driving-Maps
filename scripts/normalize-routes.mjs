#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node scripts/normalize-routes.mjs <input.geojson> <output.geojson>');
  process.exit(1);
}

const raw = JSON.parse(await readFile(input, 'utf8'));
const features = (raw.features ?? []).filter((f) =>
  ['LineString', 'MultiLineString'].includes(f?.geometry?.type)
);
const normalized = { type: 'FeatureCollection', features };
await writeFile(output, JSON.stringify(normalized, null, 2));
console.log(`Normalized routes to ${output}`);
