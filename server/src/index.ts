import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { insertRoute, listRoutes } from './db.js';

const app = express();
const port = Number(process.env.PORT ?? 8787);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/routes', (_req, res) => {
  res.json({ routes: listRoutes() });
});

app.post('/api/routes', (req, res) => {
  const route = req.body;
  if (!route?.id || !route?.name || !route?.featureCollection) {
    res.status(400).json({ error: 'Missing required route fields.' });
    return;
  }

  insertRoute({
    id: String(route.id),
    name: String(route.name),
    sourceType: String(route.sourceType ?? 'unknown'),
    featureCollection: JSON.stringify(route.featureCollection),
    distanceKm: Number(route.distanceKm ?? 0),
    importedAt: String(route.importedAt ?? new Date().toISOString()),
  });

  res.status(201).json({ ok: true });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Colorado Drive Map server listening on ${port}`);
});
