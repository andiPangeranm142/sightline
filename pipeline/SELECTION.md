# Series selection — SIGHTLINE pipeline

Selected from `val/series.csv` (857 series) using the rules in
`aggregate.py` (`EVENT_PREFIXES`): every series whose event name starts
with one of:

- `VCT Americas` — Cloud9's own league (the main scouting focus).
- `Game Changers NA` — Cloud9 GC's league.
- `Game Changers Championship` — the GC world championship (top GC opponents).
- `VALORANT Masters` — international tournaments (Masters Toronto).

Rationale: SIGHTLINE is a scouting console for C9 VAL + C9 GC coaches, so
the dataset covers every relevant opponent in their leagues plus the
international stage. No other Game Changers regions were added: the total
is already far above the 60-series minimum.

Total selected: **337 series**.

## Per event

- Game Changers Championship - 2025: 18
- Game Changers NA - Kickoff 2026: 14
- Game Changers NA - Split 1 2025: 48
- Game Changers NA - Split 1 2026: 59
- Game Changers NA - Split 2 2025: 59
- Game Changers NA - Split 2 2026: 9
- VALORANT Masters - Masters Toronto: 24
- VCT Americas - Kickoff 2025: 22
- VCT Americas - Stage 1 2025: 42
- VCT Americas - Stage 2 2025: 42

## Full list

See `selected_series.csv` (series_id, event, stage, schedule, teams).
Events + ability supplement files for these series were downloaded via
individual HTTPS from the starter repo (NOT git clone — see README.md)
and stored outside the repo (`$STL_DATA_DIR`), NEVER committed.
