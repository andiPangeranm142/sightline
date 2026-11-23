# SIGHTLINE — Testing Notes

## Running locally

```bash
cd docs/
python3 -m http.server 8000
# open http://127.0.0.1:8000/
```

No build step, no CDN dependencies — all files self-contained.
Data is read from `data/*.json` (pipeline aggregates) with automatic
per-file fallback to `data/mock/*.json`. Flag `USE_MOCK` in `js/data.js`
(`false` = try real data first; `true` = always mock).

## Test results — 23 Nov 2026 (~06:00 WIB, frontend worker)

### 1. JavaScript syntax — `node --check` ✅
- `js/maps.js` — OK
- `js/data.js` — OK
- `js/app.js` — OK

### 2. Mock JSON validation — `python3 -m json.tool` ✅
- `data/mock/meta.json` — OK (3 teams, 15 players, 2 maps)
- `data/mock/heatmaps.json` — OK (304 cast points)
- `data/mock/operators.json` — OK (2 player profiles)
- `data/mock/anti-strat.json` — OK (4 cards)
- `data/mock/self-scout.json` — OK (2 cards)
- `data/mock/landing-zones.json` — OK (3 estimated zones)

### 3. HTTP smoke test — `python3 -m http.server` + curl ✅
All assets returned HTTP 200:
- `/`, `/index.html`, `/css/style.css`
- `/js/maps.js`, `/js/data.js`, `/js/app.js`
- `/data/mock/meta.json`, `/data/mock/heatmaps.json`,
  `/data/mock/operators.json`, `/data/mock/anti-strat.json`,
  `/data/mock/self-scout.json`, `/data/mock/landing-zones.json`
- `/data/meta.json` returned 404 as expected (pipeline aggregates did
  not exist yet) — the loader's mock fallback handled the case.

## Test results — 23 Nov 2026 (~06:50 WIB, integration)

### 4. Syntax + JSON re-check after integration ✅
- `node --check` on all 3 JS files — OK
- All 12 JSON files under `docs/data/` (6 real + 6 mock) — valid
- Repo-wide Indonesian-language scan — clean (all user-facing text is
  English; 1,707 cards translated, 0 markers left)

### 5. jsdom end-to-end smoke test — 30/30 assertions ✅
Script: `docs/tests/smoke.js` (committed 24 Nov 2026; previously only at
`/tmp/jsdom-test/smoke.js`). Run `npm install` once in `docs/tests/`,
then `node smoke.js` (jsdom 31, page served over HTTP, real aggregates
loaded). Covered:
- App loads with 0 JS errors; error state hidden; main visible
- Coverage header from real meta: 337 series / 848 games / 17,435 rounds
- Badge: `DATA: LIVE — GRID aggregates`
- Team filter: 72 teams, default Sentinels (id `1079`); map filter:
  13 maps, default Ascent
- Heatmap renders (33 blobs/cells for Sentinels/Ascent); evidence line
  shows `n = 44 cast points`; top abilities listed; map name label `ASCENT`
- Operator profiler: body visible, 4 KPIs, buy-rate bars
- Anti-strat: 5 cards for Sentinels/Ascent; scout card insights rendered
- Self-scout toggle: title switches, 10 cards for C9/Ascent
- Map switch to Haven: label + heatmap re-render
- Map switch to Summit: generic 2-site fallback (label `SUMMIT`, 7 zones)
- Numbers mode renders cells; team switch to Cloud9 updates the context chip
- 0 JS errors after all interactions

Known data quirk (not a bug): Sentinels have **0 cast points on Summit**
(991 total points on that map) — the empty state is correct behaviour
there. The numbers-mode assertion runs on Ascent for this reason.

### 5b. Re-run after 24 Nov 2026 aggregate regeneration — 30/30 ✅
After the Junie-review fixes (cast-sector card labels, heatmap binning
cap, non-ballistic landing zones removed) and a full pipeline
regeneration (152,876 projections, 3,250 stored zones, 0 non-ballistic),
the committed smoke test re-ran **30/30** with no assertion changes:
Sentinels/Ascent has no boundary points, so its 33 blobs are unchanged;
card counts (5/10) and coverage (337/848/17,435/1,421,082) are unchanged.
The binning fix itself was verified separately on C9 GC/Summit (the
team/map with the most boundary points, 54): 153 → 146 blobs, all
centres/cells/labels inside 0–1000, 0 JS errors
(one-off script, not committed: `/tmp/jsdom-test/check-binning.js`).

## Verified in a real browser (23 Nov 2026)
- **Visual appearance** (SVG heatmap rendering, responsive layout,
  design quality): Playwright suite `~/workspace/cloud9/visual-qa/verify-upgrade.js`
  — **14/14 checks passed** (hero + stats from data, ESTIMATE labels,
  all 13 maps render, zero horizontal overflow at 1280px and 390px,
  zero console/page errors). Re-run 24 Nov 2026 after the aggregate
  regeneration + binning fix: **14/14 again**.
- **GitHub Pages live**: Pages build `built`; the live URL serves the app
  with real data (DATA: LIVE badge, hero stats 337/848/17,435/1,421,082).

## Not yet verified in this VM
- **Print / Save PDF flow**: button wired to `window.print()`; not
  exercised end-to-end.
