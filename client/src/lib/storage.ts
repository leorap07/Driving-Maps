import type { ImportedRoute } from '../types';

const STORAGE_KEY = 'cdm:routes';

export function loadRoutes(): ImportedRoute[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRoutes(routes: ImportedRoute[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
}
