/**
 * SIGHTLINE — data loader.
 *
 * Contract (foundation.md §4): the pipeline worker writes real aggregates
 * to docs/data/*.json. This loader reads the REAL files first and falls
 * back to docs/data/mock/*.json when a real file is missing (404).
 *
 * USE_MOCK — single configuration flag:
 *   false (default): try real data first, fall back to mock per file.
 *   true:            always load mock data (demo / development).
 *
 * Never write to docs/data/*.json from the frontend — that path belongs
 * to the pipeline worker.
 */
"use strict";

const USE_MOCK = false;

const DATA_FILES = ["meta", "heatmaps", "operators", "anti-strat", "self-scout", "landing-zones"];

/**
 * Fetch one dataset. Returns { data, source } where source is "real" | "mock".
 * Throws when neither the real nor the mock file loads.
 */
async function loadDataset(name) {
  const realUrl = `data/${name}.json`;
  const mockUrl = `data/mock/${name}.json`;
  if (!USE_MOCK) {
    try {
      const res = await fetch(realUrl);
      if (res.ok) return { data: await res.json(), source: "real" };
    } catch (e) {
      // network error on real file — fall through to mock
    }
  }
  const res = await fetch(mockUrl);
  if (!res.ok) throw new Error(`Failed to load ${name}.json (real + mock)`);
  return { data: await res.json(), source: "mock" };
}

/**
 * Load all datasets in parallel.
 * Returns { datasets: {name: data}, sources: {name: "real"|"mock"} }.
 * A single failed file does not kill the app: it is reported in `errors`.
 */
async function loadAllData() {
  const datasets = {};
  const sources = {};
  const errors = [];
  await Promise.all(DATA_FILES.map(async (name) => {
    try {
      const { data, source } = await loadDataset(name);
      datasets[name] = data;
      sources[name] = source;
    } catch (e) {
      errors.push({ file: name, error: e.message });
    }
  }));
  return { datasets, sources, errors };
}
