import Database from 'better-sqlite3';

export interface StoredRoute {
  id: string;
  name: string;
  sourceType: string;
  featureCollection: string;
  distanceKm: number;
  importedAt: string;
}

const dbPath = process.env.DB_PATH ?? './data/routes.sqlite';
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS routes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sourceType TEXT NOT NULL,
    featureCollection TEXT NOT NULL,
    distanceKm REAL NOT NULL,
    importedAt TEXT NOT NULL
  );
`);

export function listRoutes(): StoredRoute[] {
  return db.prepare('SELECT * FROM routes ORDER BY importedAt DESC').all() as StoredRoute[];
}

export function insertRoute(route: StoredRoute): void {
  db.prepare(
    `INSERT OR REPLACE INTO routes (id, name, sourceType, featureCollection, distanceKm, importedAt)
     VALUES (@id, @name, @sourceType, @featureCollection, @distanceKm, @importedAt)`
  ).run(route);
}
