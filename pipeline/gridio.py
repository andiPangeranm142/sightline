"""I/O helpers for the SIGHTLINE aggregation pipeline.

Streaming-only access to GRID `.zst` files (never decompress whole files to
disk), plus small helpers for meta CSVs, map-name normalisation and
coordinate normalisation.

Data layout (outside the repo — GRID raw data is hackathon-only licensed):

    $STL_DATA_DIR/            (default: ../data/raw relative to the repo)
      val/series.csv
      val/events_<series_id>_grid.jsonl.zst
      supplement/<series_id>.jsonl.zst
      meta/*.csv
"""

from __future__ import annotations

import csv
import json
import os
from datetime import datetime, timezone
from typing import Any, Iterator

import zstandard

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------


def data_dir() -> str:
    """Raw-data root: $STL_DATA_DIR, else ../data/raw relative to the repo."""
    env = os.environ.get("STL_DATA_DIR")
    if env:
        return env
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(repo_root, "..", "data", "raw")


# ---------------------------------------------------------------------------
# Streaming .zst JSONL
# ---------------------------------------------------------------------------


def stream_jsonl_zst(path: str) -> Iterator[dict[str, Any]]:
    """Yield JSON objects from a `.jsonl.zst` file via streaming decompression.

    The file is never fully decompressed to disk or memory; records are
    parsed line-by-line from a 1 MiB read buffer.
    """
    dctx = zstandard.ZstdDecompressor()
    with open(path, "rb") as fh:
        with dctx.stream_reader(fh) as reader:
            buf = b""
            while True:
                chunk = reader.read(1 << 20)
                if not chunk:
                    break
                buf += chunk
                while b"\n" in buf:
                    line, buf = buf.split(b"\n", 1)
                    if line.strip():
                        yield json.loads(line)
            if buf.strip():
                yield json.loads(buf)


# ---------------------------------------------------------------------------
# Meta CSVs
# ---------------------------------------------------------------------------


def load_series_csv(path: str) -> list[dict[str, str]]:
    """Load val/series.csv (series_id, event, stage, teams, file paths)."""
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def load_meta_teams(path: str, title: str = "val") -> dict[str, str]:
    """team_id -> team name from meta/teams.csv (filtered by title)."""
    out: dict[str, str] = {}
    with open(path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if row.get("title") == title:
                out[row["team_id"]] = row["name"]
    return out


def load_meta_players(path: str, title: str = "val") -> dict[str, dict[str, str]]:
    """player_id -> {name, team_id} from meta/players.csv (latest team)."""
    out: dict[str, dict[str, str]] = {}
    with open(path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if row.get("title") == title:
                out[row["player_id"]] = {
                    "name": row["name"],
                    "team_id": row.get("latest_team_id", ""),
                }
    return out


# ---------------------------------------------------------------------------
# Time / names / coordinates
# ---------------------------------------------------------------------------


def parse_iso(value: str | None) -> datetime | None:
    """Parse an ISO-8601 timestamp (GRID uses trailing 'Z')."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def now_iso() -> str:
    """Current UTC time as an ISO-8601 string with 'Z' suffix."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# GRID stores map names lowercase ("corrode"); the frontend contract uses
# Title Case ("Corrode") and its schematic geometry is keyed that way.
MAP_DISPLAY_NAMES = {
    "abyss": "Abyss",
    "ascent": "Ascent",
    "bind": "Bind",
    "breeze": "Breeze",
    "corrode": "Corrode",
    "fracture": "Fracture",
    "haven": "Haven",
    "icebox": "Icebox",
    "lotus": "Lotus",
    "pearl": "Pearl",
    "split": "Split",
    "sunset": "Sunset",
}


def display_map_name(raw: str) -> str:
    """Normalise a GRID map name to the frontend's Title Case form."""
    return MAP_DISPLAY_NAMES.get(raw.lower(), raw[:1].upper() + raw[1:])


def normalise_side(raw: str | None) -> str:
    """GRID 'attacker'/'defender' -> contract 'attack'/'defense'."""
    if raw == "attacker":
        return "attack"
    if raw == "defender":
        return "defense"
    return raw or "unknown"


def normalise_xy(
    x: float, y: float, bounds: dict[str, dict[str, float]]
) -> tuple[float, float, bool]:
    """Map raw GRID coords to the 0-1000 contract grid using map bounds.

    Returns (nx, ny, in_bounds). Values are clamped to [0, 1000]; the
    caller counts ``in_bounds == False`` as a validation signal. Degenerate
    or reversed bounds are invalid even when the fallback coordinate is 500.
    """
    min_x = bounds["min"]["x"]
    max_x = bounds["max"]["x"]
    min_y = bounds["min"]["y"]
    max_y = bounds["max"]["y"]
    nx = (x - min_x) / (max_x - min_x) * 1000.0 if max_x > min_x else 500.0
    ny = (y - min_y) / (max_y - min_y) * 1000.0 if max_y > min_y else 500.0
    in_bounds = (
        max_x > min_x and max_y > min_y
        and 0.0 <= nx <= 1000.0 and 0.0 <= ny <= 1000.0
    )
    return (
        round(min(1000.0, max(0.0, nx)), 1),
        round(min(1000.0, max(0.0, ny)), 1),
        in_bounds,
    )


def round_time_bucket(elapsed_seconds: float | None) -> str:
    """Bucket seconds-since-round-start into the contract buckets.

    None (no reliable round timing) -> "unknown".
    """
    if elapsed_seconds is None:
        return "unknown"
    if elapsed_seconds < 20:
        return "0-20s"
    if elapsed_seconds < 40:
        return "20-40s"
    if elapsed_seconds < 60:
        return "40-60s"
    return "60s+"
