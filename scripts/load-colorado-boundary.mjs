#!/usr/bin/env node
import { copyFile } from 'node:fs/promises';

await copyFile('data/boundaries/colorado-boundary.geojson', 'client/public/data/colorado-boundary.geojson');
console.log('Colorado boundary copied to client/public/data');
