# SIGHTLINE — Validation Report (pipeline)

Generated: 2026-11-22T23:32:21Z — run `python pipeline/aggregate.py` to regenerate.

## Coverage

- Series processed: **337**
- Games: **848**
- Rounds: **17435**
- Events processed: **1421082**
- Ability casts seen: **580455**
- Teams: **72**, players: **374**, maps: **13**

## Supplement join (supplement <-> events)

- Supplement records: 627049 (579027 with `in_grid=true`)
- Joined on `grid_event_id`: 579027 (**100.0%** of in-grid records)
- Unmatched in-grid records: 0

## Coordinate validation

- Heatmap points outside map bounds (pre-clamp): **261** (all clamped into 0-1000; output has 0 out-of-range points by construction)
- Landing-zone points outside bounds (pre-clamp): 2490 (2472 estimated landings clamped to bounds)
- Map bounds mismatches across series: none

## Round-time buckets

- Bucket distribution: {'60s+': 147056, '0-20s': 272168, '20-40s': 81672, '40-60s': 79559}
- Casts with unknown round time: 0
- Freezetime-end events rejected (outside 20-45 s window): 3230

## Operator evidence

- Rounds with Operator evidenced by inventory snapshot: 4174
- Rounds evidenced by Operator kill only (fallback): 1881
- Total Operator kills: 3813

## Output sizes (budget 8 MB total)

- `meta.json`: 43,695 bytes
- `heatmaps.json`: 2,961,771 bytes
- `operators.json`: 1,056,505 bytes
- `anti-strat.json`: 421,351 bytes
- `self-scout.json`: 15,826 bytes
- `landing-zones.json`: 1,151,505 bytes
- **Total: 5,650,653 bytes (5.39 MB)**

## Sampling

- Heatmap points: 18,991 kept of 580,455 total (reservoir per map, cap 3000/map)
- Landing zones: 3,250 kept of 176,355 projected (reservoir per map, cap 250/map)
- Budget downsampling (halvings applied to fit 8 MB): {'heatmaps.json': 1} (heatmap reservoir of 37,982 halved once to 18,991; 1,500/map, Summit 991)

## Distribution per map (casts seen)

- Haven: 102,531 casts
- Lotus: 96,914 casts
- Ascent: 64,773 casts
- Pearl: 63,554 casts
- Split: 60,903 casts
- Sunset: 43,501 casts
- Bind: 33,411 casts
- Icebox: 32,946 casts
- Corrode: 32,439 casts
- Abyss: 22,441 casts
- Fracture: 15,255 casts
- Breeze: 9,806 casts
- Summit: 1,981 casts

## Caveats (see pipeline/README.md for detail)

- Round-time buckets use envelope `occurredAt` relative to the round-proper start (freezetime end, or round start + 30 s). GRID timestamps are occasionally delayed; buckets are approximate.
- Landing zones are ballistic ESTIMATES with nominal projectile speeds, not measured trajectories.
- Operator ownership is evidenced by inventory snapshots and pickups; kill-based rounds are a documented fallback.
