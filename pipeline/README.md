# SIGHTLINE — aggregation pipeline

Python pipeline that turns raw GRID VALORANT data (streaming `.zst`,
never fully decompressed) into small JSON aggregates in `docs/data/`
loaded by the static frontend. Stdlib + `zstandard` only.

## Running

```bash
# From repo root. Raw data lives outside the repo (hackathon-only license).
export STL_DATA_DIR=~/workspace/cloud9/data/raw   # default: ../data/raw
python pipeline/aggregate.py [--limit N] [--heatmap-cap N] [--landing-cap N]
```

- `--limit N`: process only the first N series (for testing).
- Output: `docs/data/{meta,heatmaps,operators,anti-strat,self-scout,landing-zones}.json`
  + `pipeline/VALIDATION.md` (validation numbers from the latest run).
- Full run (337 series): ≈20 minutes on this VM.

## Getting the raw data (DO NOT git clone the starter repo)

Cloning the GRID starter repo is blocked (git hook/filter execution risk).
Download individual files over HTTPS and verify sizes against the GitHub
tree API:

```bash
BASE=https://raw.githubusercontent.com/cloud9esports/stl-hackathon-2026-grid-starter/main
curl -o $STL_DATA_DIR/val/series.csv $BASE/val/series.csv
curl -o $STL_DATA_DIR/val/events_<id>_grid.jsonl.zst $BASE/val/events_<id>_grid.jsonl.zst
curl -o $STL_DATA_DIR/supplement/<id>.jsonl.zst $BASE/val-ability-supplements/<id>.jsonl.zst
curl -o $STL_DATA_DIR/meta/teams.csv $BASE/meta/teams.csv   # + players/games/rosters
```

Selected series list: `pipeline/selected_series.csv` + rationale in
`pipeline/SELECTION.md` (337 series: VCT Americas + Game Changers NA &
Championship + Masters Toronto). **Raw data is NEVER committed**
(`.gitignore` excludes `*.zst`/`*.jsonl`); only JSON aggregates may
enter the repo.

## Output schema (contract with the frontend)

All coordinates are normalized to **0–1000** from `map.bounds` in the data
(`(x - min.x) / (max.x - min.x) * 1000`, clamped). Map names are Title Case
(`corrode` → `Corrode`). Team/player IDs are **GRID string IDs**
(e.g. Cloud9 = `"79"`, Cloud9 GC = `"3429"`). Total `docs/data/` ≤ 8 MB.

| File | Contents |
|---|---|
| `meta.json` | `{generated_at, series_count, games_count, rounds_count, events_processed, teams: [{id, name}], players: [{id, name, team_id}], maps: [{name, bounds}], series_ids, heatmap_sampling, ...}` |
| `heatmaps.json` | Array of cast points `{map, team_id, player_id, agent, ability, side, x, y, round_time_bucket}`. `side`: `attack`/`defense`. Buckets: `0-20s`/`20-40s`/`40-60s`/`60s+`/`unknown`. |
| `operators.json` | Array per player `{player_id, player_name, team_id, maps: {map: {rounds_with_operator, operator_kills, buy_rate_by_round: {round_number: rate}, setup_positions: [{x, y, side}]}}}`. |
| `anti-strat.json` | Array `{team_id, map, tendency, n, frequency, response}` — responses from rule templates, not an LLM. |
| `self-scout.json` | Same format, Cloud9 (`79`) + Cloud9 GC (`3429`) only. |
| `landing-zones.json` | Array `{map, team_id, player_id, ability, cast_x, cast_y, est_x, est_y, confidence, method}` — **ESTIMATES** (see caveats). |

## How it works

1. **Selection** — `select_series()` filters `val/series.csv` (see
   `SELECTION.md`).
2. **Events pass (per series)** — streaming `.zst`: track the active
   game/map/round, player snapshots at `game-started-round` (agent from
   `character`, Operator inventory, positions), cast points at
   `player-used-ability`, Operator kills at `player-killed-player`,
   pickups at `player-pickedUp-item`. Per-round signals (casts,
   placement cells, Operator holder) are flushed when the next round
   starts.
3. **Supplement pass (per series)** — join `grid_event_id` →
   `player-used-ability` (only records with `in_grid=true`); for
   throwable abilities, ballistic projection → `landing-zones.json`.
4. **Aggregation** — anti-strat/self-scout cards from per-round counters;
   Operator profiles from ownership evidence; heatmaps/landing zones via
   per-map reservoir sampling (cap 3000/250, seed 42) + systematic
   downsampling if the total exceeds the 8 MB budget.
5. **Validation** — numbers written to `VALIDATION.md`.

## Data caveats (honest — read before using the aggregates)

1. **Round-time buckets are estimates.** GRID provides no reliable
   per-event round time (`gameClock` jumps and is sometimes negative),
   so buckets are computed from envelope `occurredAt` relative to the
   proper round start (end of freezetime when that event looks sane —
   20–45 seconds after the round started — otherwise round start +
   30 seconds). Casts during the buy phase count as `0-20s`.
   `occurredAt` is sometimes delayed (observed: freezetime-end of round 1
   in series 2841238 delayed 131 seconds), so a small fraction of points
   may land in the wrong bucket.
2. **Landing zones are ESTIMATES.** Model: nominal projectile speed per
   ability class + player velocity + gravity 800 u/s², flat ground 150
   units below the throw point. GRID does not publish per-ability
   projectile speeds, so confidence is capped at ≤ 0.75 and every item
   carries a `method` label explaining these assumptions. Only throwable
   abilities with a ballistic arc are modelled (list in `landing.py`);
   map-based smokes, walls, drones, straight/moving projectiles, and
   teleports are NOT included. Records with `quality=gap_exceeded` and
   flights that do not reach the assumed ground within four seconds are
   omitted from new projections.
3. **Operator ownership from evidence, not assumption.** Primary sources:
   inventory snapshots at `game-started-round`/`game-ended-round` +
   `player-pickedUp-item` (id `operator`). Operator kills are used as
   fallback evidence when no snapshot exists (fallback round counts are
   recorded in `VALIDATION.md`). `buy_rate_by_round[round_number]` = share
   of games in which the player held the Operator on that round number on
   that map.
4. **Anti-strat cards: ability frequency is measured against rounds in
   which the team played that agent** (not all rounds), and must beat the
   global baseline for the (agent, ability) pair by ≥ 0.15 — so routine
   abilities (Astra placing a star every round) do not become
   "tendencies". Abilities with baseline > 0.90 are excluded. Cast
   sectors use a neutral grid reference (A1–E5), because the data carries
   no site names. Minimum n = 5 rounds; maximum 5 cards per team+map.
5. **Heatmap sampling.** All cast points are counted, but only a
   per-map reservoir sample is stored (cap 3000/map) to keep the total
   ≤ 8 MB. Total vs stored counts are recorded in
   `meta.json.heatmap_sampling`. The reservoir is uniform random (seed 42)
   — the per-team/ability distribution in the sample follows the original
   distribution.
6. **Agent `unknown`.** Agent comes from the `character` field in
   full-state snapshots; if a cast happens before the first full-state
   snapshot in a game (rare), the agent is recorded as `unknown`.
7. **Team/player names** come from events; when absent from events, they
   are filled in from `meta/*.csv`. Team names in events sometimes carry a
   `(2)` suffix (GRID's marker for the second team in a series) — names
   from the meta CSVs (without suffix) take precedence when available.
