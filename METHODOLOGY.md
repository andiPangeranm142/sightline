# SIGHTLINE — Methodology

How SIGHTLINE turns raw GRID VALORANT data into a tactical scouting console
for coaches. Every number in this document is verified against
`pipeline/VALIDATION.md` (run 22 Nov 2026) and `docs/TESTING.md`.

> **Read the caveats first.** Section 6 lists every known limitation of the
> data and the estimates SIGHTLINE makes — including the fact that round-time
> buckets are estimated for 18.5% of rounds, 31% of Operator rounds are
> evidenced by kills alone, and landing zones are ballistic estimates, never
> measured positions. Nothing in this document hides those limits.

## 1. The problem

A VALORANT coach preparing for an opponent needs three answers fast:

1. **Where does this team put its utility?** (smokes, mollies, flashes,
   traps — by map, side, and round phase)
2. **Who snipes, and from where?** (Operator habits: buy timing, setup
   positions, who else on the team picks it up)
3. **What should we do about it?** (a concrete anti-strat plan, readable in
   one minute, printable for the team room)

SIGHTLINE answers all three from real pro match data, in a static web app
with no backend: every insight carries its sample size (`n = ...`), and
every estimate is labeled ESTIMATE.

## 2. Data — GRID starter dataset, 337 series

SIGHTLINE is built on the official Cloud9 GRID starter dataset for this
hackathon: VALORANT event data as JSON Lines files, compressed with zstd
(one `.zst` file per series), plus a per-series ability supplement
(position, aim direction, and velocity at cast time) and meta CSVs
(teams, players, games, rosters).

### Series selection

From the 857 series in `val/series.csv`, 337 were selected — every series
whose event name starts with one of four prefixes (rules in
`pipeline/aggregate.py`, full list in `pipeline/selected_series.csv`,
rationale in `pipeline/SELECTION.md`):

| Event | Series |
| --- | --- |
| VCT Americas (Kickoff + Stage 1 + Stage 2, 2025) | 106 |
| Game Changers NA (Kickoff, Split 1, Split 2 — 2025 & 2026) | 189 |
| Game Changers Championship 2025 | 18 |
| VALORANT Masters — Masters Toronto | 24 |
| **Total** | **337** |

Rationale: SIGHTLINE is a scouting console for Cloud9 VAL and Cloud9 GC
coaches, so the dataset covers every relevant opponent in their own leagues
plus the international stage. No other Game Changers regions were added —
337 series is already far above the 60-series minimum.

### Coverage (verified, `pipeline/VALIDATION.md`)

- **337** series, **848** games, **17,435** rounds
- **1,421,082** events processed, **580,455** ability casts seen
- **72** teams, **374** players, **13** maps
- Most-played maps: Haven (102,531 casts), Lotus (96,914), Ascent (64,773);
  rarest: Summit (1,981 casts — see caveat 6.4)

### Licensing and size

The raw GRID data is licensed hackathon-only and is **never committed** to
this repo (`.gitignore` excludes `*.zst` / `*.jsonl`). The VALORANT raw data
is ~160 GB uncompressed. The repo holds only the aggregates the pipeline
produces: six JSON files totalling **5,640,616 bytes (5.38 MB)** in
`docs/data/`. Raw files were downloaded individually over HTTPS from the
starter repo and verified against the GitHub tree API — the starter repo
itself was never `git clone`d (see `pipeline/README.md`).

## 3. Pipeline — streaming aggregation

`pipeline/aggregate.py` (Python 3.12, stdlib + `zstandard` only) turns the
raw `.zst` files into the six JSON aggregates. A full run over 337 series
takes ≈20 minutes. It never decompresses a whole file to disk: every series
is streamed through a zstd decoder, event by event.

### Pass 1 — events (per series)

The pipeline tracks the active game, map, and round, and records:

- player snapshots at `game-started-round` (agent from `character`,
  Operator inventory, positions),
- cast points at `player-used-ability`,
- Operator kills at `player-killed-player`,
- Operator pickups at `player-pickedUp-item` (id `operator`).

Per-round signals (casts, placement cells, Operator holder) are flushed when
the next round starts. All coordinates are normalized to **0–1000** from
`map.bounds` in the data itself (`(x - min.x) / (max.x - min.x) * 1000`,
clamped). Map names are Title Case (`corrode` → `Corrode`). Team/player IDs
are GRID string IDs (Cloud9 = `"79"`, Cloud9 GC = `"3429"`).

### Pass 2 — ability supplement (per series)

Supplement records are joined to `player-used-ability` events on
`grid_event_id` (only records with `in_grid=true`). For throwable abilities,
the supplement's position + aim + velocity feed a ballistic projection that
produces the landing-zone estimates (Section 5.5).

### Aggregation

- **Anti-strat / self-scout cards** from per-round counters (Section 5.3).
- **Operator profiles** from ownership evidence (Section 5.2).
- **Heatmaps / landing zones** via per-map reservoir sampling (cap
  3,000/map for heatmaps, 250/map for landing zones, seed 42), plus
  systematic downsampling if the total would exceed the 8 MB budget.
  The heatmap reservoir was halved once (37,982 → 18,991 points) to fit.
  Stored totals: 18,991 of 580,455 cast points; 3,250 of 152,876 projected
  landing zones. The reservoir is uniform random, so the per-team/ability
  distribution in the sample follows the original distribution; total vs.
  stored counts are recorded in `meta.json.heatmap_sampling`.

### Validation (from `pipeline/VALIDATION.md`, run 22 Nov 2026)

- Supplement join: **579,027 of 579,027 in-grid records joined (100.0%)**,
  0 unmatched.
- Coordinates: 261 heatmap points fell outside map bounds pre-clamp (all
  clamped into 0–1000; output has 0 out-of-range points by construction).
  No map-bounds mismatches across series.
- Round-time buckets: distribution `0-20s`: 272,168 · `20-40s`: 81,672 ·
  `40-60s`: 79,559 · `60s+`: 147,056 · unknown: 0.
- Operator evidence: 4,174 rounds from inventory snapshots, 1,881 rounds
  from kill fallback, 3,813 total Operator kills.
- Output budget: 5.38 MB total, under the 8 MB cap.

## 4. Frontend — static, no backend

`docs/` is a static HTML/CSS/vanilla-JS app (no build step, no framework,
no CDN dependencies), served from GitHub Pages. It loads only the six small
aggregate JSON files, with automatic per-file fallback to mock data
(`docs/data/mock/*.json`) if a real file is missing — the header badge shows
`DATA: LIVE — GRID aggregates` when real data is loaded. Maps are original
schematic SVG drawings (zone-based), not Riot assets. All user-facing text
is English.

## 5. How each feature works

### 5.1 Utility heatmaps — 20×20 client-side binning

The heatmap panel shows ability cast points for the selected team + map,
filtered by player, agent, ability, side (attack/defense), and round-time
bucket. Binning happens **in the browser**: points are grouped into a 20×20
grid over the 0–1000 coordinate space (cell size 50), and each non-empty
cell is rendered either as a radial-gradient blob whose radius and opacity
scale with the cell's count relative to the densest cell (gradient mode),
or as a shaded cell with its exact count printed inside (hard-numbers
mode). Individual cast dots are drawn on top. An evidence line under the
map states exactly how many points are shown and how many exist for the
team+map before the active filters, and a top-5 ability breakdown lists the
most-cast agent–ability pairs with `n` and share. The map behind the
heatmap is an original schematic (per-map zones; a generic 2-site fallback
for maps without a bespoke drawing).

### 5.2 Operator profiler — sniper fingerprint

For each player on the selected team, the profiler shows, per map:

- **KPIs**: rounds with Operator, Operator kills, kills per Operator round,
  unique setup positions.
- **Setup map**: every distinct position from which the player held the
  Operator, split by attack/defense side. Near-identical positions are
  spread deterministically (golden-angle spiral) so each marker stays
  visible; a dashed leader line + small dot mark the true position of any
  displaced marker.
- **Buy-rate by round number**: a bar chart (rounds 1–24) where each bar is
  the share of games in which the player held the Operator on that round
  number on that map.
- **Handoffs**: the same round/kill counts for every teammate who also held
  the Operator, so a coach sees whether the sniper role is one player's job
  or shared across the team.

Ownership evidence comes from inventory snapshots at round start/end plus
pickups; kills are a documented fallback (caveat 6.2). A player with no
Operator data on the selected map gets an explicit empty state, not a
zero-filled profile.

### 5.3 Anti-strat cards — rule-based, not LLM

Each card names one opponent tendency on one map, with its sample size
(`n` rounds), its frequency, and a concrete response. Cards are generated
from per-round counters by **rule templates, not an LLM**:

- Ability frequency is measured against rounds in which the team actually
  played that agent (not all rounds), and must beat the global baseline for
  that (agent, ability) pair by **≥ 0.15**, so routine abilities (Astra
  placing a star every round) never become "tendencies". Abilities with a
  baseline above 0.90 are excluded entirely.
- Cast sectors use a neutral grid reference (A1–E5) because the data
  carries no site names.
- Minimum sample: **n = 5 rounds**; maximum **5 cards per team+map**.
- Total: 1,639 anti-strat cards across all team+map combinations.

### 5.4 C9 self-scout mode

The same analysis, applied to Cloud9 itself. Toggling self-scout switches
the card panel to Cloud9 (`79`) + Cloud9 GC (`3429`) only, retitles it
"Self-Scout — C9's Most Readable Tendencies", and replaces each RESPONSE
with a VARIATION TIP — the patterns opponents can most easily read, and
how to vary them. 62 self-scout cards in total.

### 5.5 Landing zones — ballistic estimates

For throwable abilities with a ballistic arc, the pipeline projects an
estimated landing point from the supplement's cast position, aim direction,
and player velocity, using a nominal projectile speed per ability class,
gravity 800 u/s², and flat ground 150 units below the throw point. The
frontend draws a dashed line from cast point to estimated landing, a zone
circle, and an `ESTIMATE <confidence>` label (top 4 by confidence, with
collision avoidance so labels never stack). Every zone carries a tooltip
with the ability and its confidence, and the panel states plainly that
these are estimates, not measured positions. Map-based smokes, walls,
drones, straight/moving projectiles, and teleports are NOT modelled (full
list in `pipeline/landing.py`). See caveat 6.3.

### 5.6 Scout card — one-page export

The scout card distills the current opponent+map into the top 3 insights
(the first 3 anti-strat cards, filled from Operator profiles if fewer than
3 cards exist), each with its evidence (`n`, frequency). A Print / Save PDF
button exports it via the browser's print flow. Landing zones are
deliberately excluded from the card — estimates do not belong on a
one-page handout without their confidence context.

## 6. Honest caveats and limitations

These are not footnotes — they are part of the methodology, and the app
surfaces the same warnings in its UI.

### 6.1 Round-time buckets are estimated (18.5% of rounds)

GRID provides no reliable per-event round time (`gameClock` jumps and is
sometimes negative), so buckets (`0-20s` / `20-40s` / `40-60s` / `60s+`)
are computed from envelope `occurredAt` relative to the round-proper start
— the end of freezetime when that event looks sane (20–45 seconds after the
round started), otherwise round start + 30 seconds. **3,230 freezetime-end
events (18.5% of 17,435 rounds) were rejected as outside the 20–45 s
window and fell back to the +30 s estimate.** `occurredAt` is also sometimes
delayed (observed: a round-1 freezetime-end in series 2841238 delayed 131
seconds), so a small fraction of points may land in the wrong bucket.
Casts during the buy phase count as `0-20s`.

### 6.2 Operator ownership: 31% of rounds rest on kill evidence alone

Primary evidence is inventory snapshots at round start/end plus pickups.
When no snapshot exists, an Operator kill is used as fallback evidence
that the player held the weapon that round. **1,881 of 6,055 Operator
rounds (31.1%) are evidenced by a kill only.** Those rounds are real —
a kill with the Operator proves possession — but the fallback cannot see
rounds where a player held the Operator and got no kill, so Operator
presence is, if anything, *under*counted in the fallback cases.

### 6.3 Landing zones are ballistic ESTIMATES (confidence ≤ 0.75)

GRID does not publish per-ability projectile speeds, so the projection uses
nominal speeds per ability class plus the assumptions in Section 5.5.
Confidence is therefore **capped at 0.75** (highest confidence observed in
the data: exactly 0.75), every item carries a `method` label explaining the
assumptions, and the UI always renders the word ESTIMATE next to the
confidence. 2,300 projected points fell outside map bounds pre-clamp (2,284
estimated landings clamped). Treat landing zones as "where this throw
probably goes", never as measured positions.

### 6.4 Map "Summit" is rare — empty states are correct

Summit appears in only 1,981 casts (vs. 102,531 on Haven), and only 991
points are stored for it. Some teams have no cast points there at all —
**Sentinels, the app's default team, have 0 cast points on Summit**. The
empty state the app shows for Sentinels/Summit is correct behaviour, not a
bug: the data genuinely has nothing there.

### 6.5 Sampling and other limits

- Only a per-map reservoir sample of cast points is stored (18,991 of
  580,455) to keep the app fast and under the 8 MB budget. Counts shown in
  the UI are counts *within the stored sample*, and the evidence line says
  so.
- **Agent `unknown`**: the agent comes from the `character` field in
  full-state snapshots; if a cast happens before the first full-state
  snapshot in a game (rare), the agent is recorded as `unknown`.
- **Team/player names** come from events, filled from `meta/*.csv` when
  absent. Team names in events sometimes carry a `(2)` suffix (GRID's
  marker for the second team in a series); names from the meta CSVs
  (without suffix) take precedence when available.
- Anti-strat responses are rule templates, not a language model — they
  cover common patterns well and novel ones not at all.
- The Print / Save PDF flow is wired to `window.print()` and has not been
  exercised end-to-end in a real browser print dialog.

## 7. Testing

- **jsdom end-to-end smoke test: 30/30 assertions passed** (23 Nov 2026):
  app loads with 0 JS errors, real coverage header (337 / 848 / 17,435),
  LIVE badge, team/map filters (72 teams, 13 maps), heatmap render with
  evidence line, Operator profiler KPIs + buy-rate bars, 5 anti-strat
  cards for Sentinels/Ascent, self-scout toggle (10 cards for C9/Ascent),
  map switching incl. the Summit empty state, numbers mode, 0 JS errors
  after all interactions. Full list in `docs/TESTING.md`.
- **Playwright visual verification: 14/14 checks passed** (23 Nov 2026,
  re-verified the same day): hero wordmark + live stats, LIVE badge, zero
  horizontal overflow at desktop 1280px and mobile 390px, ESTIMATE labels
  visible, no non-English UI text, 13 maps in filter, all 13 maps render
  (label + zones), Bind teleporter link, Summit's 7 zones, mobile hero
  stats wrap, zero console errors, zero page errors.
- `node --check` on all JS files, `python3 -m json.tool` on all 12 JSON
  files (6 real + 6 mock), HTTP 200 smoke test on every asset.

## 8. Reproducing the aggregates

```bash
# Raw data lives OUTSIDE the repo (hackathon-only license).
export STL_DATA_DIR=~/workspace/cloud9/data/raw
python pipeline/aggregate.py
# Output: docs/data/{meta,heatmaps,operators,anti-strat,self-scout,landing-zones}.json
#         + pipeline/VALIDATION.md (regenerated validation numbers)
```

Download instructions for the raw files (individual HTTPS, verified
against the GitHub tree API — never `git clone`) are in
`pipeline/README.md`.
