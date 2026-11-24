# SIGHTLINE — Junie guidelines

Project: SIGHTLINE, a VALORANT tactical scouting console for the Cloud9 x
JetBrains "Sky's The Limit" Hackathon 2026 (Category 1). Public repo,
MIT license. Static web app (GitHub Pages) + Python aggregation pipeline.

## Hard rules

- NEVER commit raw GRID data (`.zst`, `.jsonl`, extracted event files) to this
  repo. GRID data is licensed hackathon-only. Only aggregates and charts
  derived from it may be committed, under `data/aggregates/`.
- NEVER download the GRID starter repo with `git clone` / `git checkout` in
  this environment. Fetch individual data files over HTTPS instead
  (`raw.githubusercontent.com`), into `../data/raw/` (outside this repo).
- Every insight shown in the app must carry its sample size (`n = ...`).
  Never present an estimate without marking it as an estimate.
- Landing-zone inference from the ability supplement is an ESTIMATE: label it
  as such and show a confidence score. Never claim exact landing positions.
- No fabricated claims. If a number cannot be verified from the data, do not
  show it.
- Keep the demo fast: the web app loads only small aggregate JSON files.

## Stack

- Pipeline: Python 3.12, `zstandard` (streaming decompression — never
  decompress whole files to disk; full VALORANT starter dataset is ~160 GB,
  the 337 selected series ~65 GB).
- Frontend: static HTML/CSS/JS, no build step, no framework. Served from
  `docs/` via GitHub Pages.
- Maps are original schematic SVG drawings (zone-based), NOT Riot assets.
  Heatmap coordinates are normalized per map from the `map.bounds` in the
  GRID data itself.

## Style

- Python: stdlib + `zstandard` only. Type hints, docstrings, `if __name__ ==
  "__main__":` entry points. Small focused modules.
- JS: vanilla, readable, commented where the logic is non-obvious.
- Commit messages: short, imperative, in English.
