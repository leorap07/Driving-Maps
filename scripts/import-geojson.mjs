#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node scripts/import-geojson.mjs <input.geojson> <output.geojson>');
  process.exit(1);
}

const raw = await readFile(input, 'utf8');
const json = JSON.parse(raw);
if (json.type !== 'FeatureCollection') {
  throw new Error('GeoJSON must be a FeatureCollection');
}
await writeFile(output, JSON.stringify(json, null, 2));
console.log(`Wrote normalized GeoJSON to ${output}`);
