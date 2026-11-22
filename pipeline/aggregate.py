"""SIGHTLINE aggregation pipeline: GRID VALORANT events -> docs/data/*.json.

Reads selected series from the GRID starter dataset (streaming `.zst`,
never decompressed to disk) and writes the small aggregate JSON files the
static frontend loads from ``docs/data/``:

* ``meta.json`` — coverage, teams, players, maps (+bounds).
* ``heatmaps.json`` — ability-cast points, normalised 0-1000.
* ``operators.json`` — per-player Operator profiles.
* ``anti-strat.json`` — rule-template anti-strat cards per team+map.
* ``self-scout.json`` — same analysis for Cloud9 / Cloud9 GC only.
* ``landing-zones.json`` — ESTIMATED landing zones for thrown abilities.

Usage (from the repo root)::

    STL_DATA_DIR=~/workspace/cloud9/data/raw \\
        python pipeline/aggregate.py [--limit N] [--heatmap-cap N]

Only stdlib + ``zstandard`` are used. See ``pipeline/README.md`` for the
schema contract and the data caveats.
"""

from __future__ import annotations

import argparse
import json
import os
import pickle
import random
import re
import sys
from collections import Counter, defaultdict
from datetime import timedelta
from typing import Any

try:  # `python -m pipeline.aggregate` from the repo root
    from pipeline.gridio import (
        data_dir,
        display_map_name,
        load_meta_players,
        load_meta_teams,
        load_series_csv,
        normalise_side,
        normalise_xy,
        now_iso,
        parse_iso,
        round_time_bucket,
        stream_jsonl_zst,
    )
    from pipeline.landing import (
        METHOD as LANDING_METHOD,
        confidence_for,
        is_throwable,
        project_landing,
    )
except ImportError:  # `python pipeline/aggregate.py` from the repo root
    from gridio import (  # type: ignore[no-redef]
        data_dir,
        display_map_name,
        load_meta_players,
        load_meta_teams,
        load_series_csv,
        normalise_side,
        normalise_xy,
        now_iso,
        parse_iso,
        round_time_bucket,
        stream_jsonl_zst,
    )
    from landing import (  # type: ignore[no-redef]
        METHOD as LANDING_METHOD,
        confidence_for,
        is_throwable,
        project_landing,
    )

# ---------------------------------------------------------------------------
# Selection & constants
# ---------------------------------------------------------------------------

# Event-name prefixes selected from val/series.csv (see SELECTION.md).
EVENT_PREFIXES = (
    "VCT Americas",
    "Game Changers NA",
    "Game Changers Championship",
    "VALORANT Masters",
)

# GRID team ids (meta/teams.csv, title=val).
CLOUD9_TEAM_ID = "79"
CLOUD9_GC_TEAM_ID = "3429"
SELF_SCOUT_TEAMS = {CLOUD9_TEAM_ID, CLOUD9_GC_TEAM_ID}

# Output budget: total size of docs/data/*.json (frontend contract).
TOTAL_BUDGET_BYTES = 8 * 1024 * 1024

# Reservoir caps (per map) before budget-driven downsampling.
HEATMAP_PER_MAP_CAP = 3000
LANDING_PER_MAP_CAP = 250
SETUP_POSITIONS_CAP = 40

# Anti-strat thresholds.
MIN_ROUNDS_TENDENCY = 5
MIN_FREQ_ABILITY = 0.40
MIN_FREQ_OPERATOR = 0.30
MIN_FREQ_CELL = 0.15
MIN_CELL_SHARE = 0.40
MAX_CARDS_PER_TEAM_MAP = 5

# Buy phase is 30 s; a freezetime-end event is only trusted when it lands
# 20-45 s after the round start (GRID `occurredAt` is occasionally delayed
# by minutes — observed in the spike series, round 1).
FREEZETIME_MIN_S = 20.0
FREEZETIME_MAX_S = 45.0
BUY_PHASE_S = 30.0

# Abilities whose placement is scoutable (traps / deployables).
PLACEABLE_KEYWORDS = (
    "trip", "turret", "alarmbot", "alarm-bot", "trap", "sensor",
    "barrier-mesh", "razorvine", "trademark", "cyber-cage", "spycam",
)


def is_placeable(ability_id: str) -> bool:
    """True for deployable/trap abilities whose cast spot is scoutable."""
    return any(k in ability_id for k in PLACEABLE_KEYWORDS)


# --- Rule-template responses for anti-strat cards (no LLM) ---------------

RESPONSE_TEMPLATES = {
    "placeable": (
        "Clear dengan util/drone sebelum execute; jangan walk-up tanpa info "
        "ke zona trap ini."
    ),
    "recon": (
        "Hancurkan atau bait recon sebelum execute; variasikan timing "
        "execute agar info lawan basi."
    ),
    "smoke": (
        "Siapkan counter-smoke/flash untuk execute; jangan commit buta ke "
        "dalam smoke."
    ),
    "molly": (
        "Hindari post-plant dan sudut default di zona molly; clear dengan "
        "util dari jarak aman."
    ),
    "flash": (
        "Hindari peek berulang dari angle yang sama; siapkan turn-away dan "
        "trade siap."
    ),
    "operator": (
        "Smoke angle Operator + peek berpasangan; simpan flash untuk "
        "re-peek kedua."
    ),
    "default": (
        "Variasikan tempo dan rute; jangan ulangi pola yang sama dua round "
        "berturut-turut."
    ),
}


def ability_category(ability_id: str) -> str:
    """Coarse category of an ability id, for response templates."""
    a = ability_id.lower()
    if is_placeable(a):
        return "placeable"
    if any(k in a for k in ("dart", "bolt", "prowler", "haunt", "drone",
                            "zero-point", "trailblazer", "seekers",
                            "guiding-light", "spycam")):
        return "recon"
    if any(k in a for k in ("smoke", "cover", "cloud", "screen", "nebula",
                            "cascade", "cove", "fast-lane", "high-tide", "wall")):
        return "smoke"
    if any(k in a for k in ("bite", "shell", "frag", "molly", "incendiary",
                            "paint", "nanoswarm", "mosh", "aftershock")):
        return "molly"
    if any(k in a for k in ("flash", "paranoia", "blindside", "curveball",
                            "dizzy", "guidelight", "arc-rose")):
        return "flash"
    return "default"


def pretty_ability(ability_id: str) -> str:
    """'toxic-screen' -> 'Toxic Screen' (display only)."""
    return ability_id.replace("-", " ").replace("_", " ").title()


def pretty_agent(agent: str) -> str:
    """'kay/o' -> 'KAY/O', 'cypher' -> 'Cypher' (display only)."""
    if agent.lower() == "kay/o":
        return "KAY/O"
    return agent[:1].upper() + agent[1:]


def sector_label(nx: float, ny: float) -> str:
    """5x5 grid reference (A1-E5) for a normalised point.

    Columns A-E run west->east, rows 1-5 run north->south in bounds space.
    A neutral grid reference is used because the data carries no site names.
    """
    col = min(4, max(0, int(nx // 200)))
    row = min(4, max(0, int(ny // 200)))
    return f"{'ABCDE'[col]}{row + 1}"


# ---------------------------------------------------------------------------
# Reservoir sampling (single-pass, unbiased, deterministic seed)
# ---------------------------------------------------------------------------


class Reservoir:
    """Fixed-capacity uniform reservoir (Algorithm R)."""

    def __init__(self, cap: int, seed: int = 42) -> None:
        self.cap = cap
        self.items: list[Any] = []
        self.seen = 0
        self.rng = random.Random(seed)

    def add(self, item: Any) -> None:
        """Offer one item to the reservoir."""
        self.seen += 1
        if len(self.items) < self.cap:
            self.items.append(item)
        else:
            j = self.rng.randrange(self.seen)
            if j < self.cap:
                self.items[j] = item


class ReservoirMap(dict):
    """dict that auto-creates a Reservoir(cap) for missing keys.

    A named class (not ``defaultdict(lambda: ...)``) so the Aggregator
    stays picklable for --checkpoint/--resume.
    """

    def __init__(self, cap: int, seed: int = 42) -> None:
        super().__init__()
        self.cap = cap
        self.seed = seed

    def __missing__(self, key: Any) -> Reservoir:
        res = Reservoir(self.cap, self.seed)
        self[key] = res
        return res


# ---------------------------------------------------------------------------
# Series selection
# ---------------------------------------------------------------------------


def select_series(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    """All series whose event matches one of EVENT_PREFIXES."""
    return [r for r in rows if r["event"].startswith(EVENT_PREFIXES)]


# ---------------------------------------------------------------------------
# Aggregator
# ---------------------------------------------------------------------------


class Aggregator:
    """Holds every aggregate across all processed series."""

    def __init__(self, heatmap_cap: int, landing_cap: int) -> None:
        self.heatmap_cap = heatmap_cap
        self.landing_cap = landing_cap

        # Coverage counters.
        self.series_processed = 0
        self.series_failed: list[str] = []
        self.games_seen: set[str] = set()
        self.rounds_count = 0
        self.events_processed = 0
        self.casts_total = 0

        # Meta registries.
        self.teams: dict[str, str] = {}          # team_id -> name
        self.players: dict[str, dict[str, str]] = {}  # player_id -> {name, team_id}
        self.maps: dict[str, dict[str, Any]] = {}     # display name -> bounds
        self.map_bounds_mismatch = Counter()

        # Heatmaps: reservoir per map + totals for the sampling note.
        self.heatmap_points: ReservoirMap = ReservoirMap(self.heatmap_cap)
        self.heatmap_total = 0
        self.heatmap_by_map_total: Counter = Counter()
        self.oob_points = 0  # cast points outside map bounds (pre-clamp)

        # Landing zones: reservoir per map.
        self.landing_zones: ReservoirMap = ReservoirMap(self.landing_cap)
        self.landing_total = 0
        self.landing_oob = 0
        self.landing_clamped = 0

        # Supplement join stats.
        self.suppl_total = 0
        self.suppl_in_grid = 0
        self.suppl_joined = 0
        self.suppl_missed = 0

        # Round denominators.
        self.rounds_team_map: Counter = Counter()       # (team, map) -> rounds
        self.rounds_team_map_side: Counter = Counter()  # (team, map, side) -> rounds
        self.rounds_player: Counter = Counter()         # (player, map, round_no)

        # Ability tendencies: rounds with >=1 cast.
        self.cast_rounds: Counter = Counter()      # (team, map, agent, ability, side)
        self.cell_rounds: Counter = Counter()      # (team, map, ability, cell)
        self.ability_rounds: Counter = Counter()  # (team, map, ability) overall
        # Agent-usage denominators for the global baseline (see
        # generate_cards): rounds a team played an agent on a map+side.
        self.agent_rounds: Counter = Counter()  # (team, map, agent, side)

        # Operator evidence.
        self.op_rounds: Counter = Counter()        # (player, map) -> rounds w/ Op
        self.op_rounds_by_no: Counter = Counter()  # (player, map, round_no)
        self.op_kills: Counter = Counter()         # (player, map) -> kills
        self.op_team_rounds: Counter = Counter()   # (team, map, side) -> rounds
        self.op_setup: ReservoirMap = ReservoirMap(SETUP_POSITIONS_CAP)
        self.op_rounds_from_kill_only = 0  # rounds evidenced by kills alone
        self.op_rounds_from_inventory = 0

        # Round-time bucket stats (for validation).
        self.bucket_counts: Counter = Counter()
        self.bucket_unknown = 0
        self.ft_end_rejected = 0  # freezetime-end events outside the sane window

    # -- meta ------------------------------------------------------------

    def register_team(self, team_id: str, name: str) -> None:
        """Record a team name (first non-empty name wins)."""
        if team_id and name and team_id not in self.teams:
            self.teams[team_id] = name

    def register_player(self, player_id: str, name: str, team_id: str) -> None:
        """Record a player (name + latest team)."""
        if not player_id:
            return
        cur = self.players.get(player_id)
        if cur is None:
            self.players[player_id] = {"name": name or player_id,
                                       "team_id": team_id or ""}
        else:
            if name:
                cur["name"] = name
            if team_id:
                cur["team_id"] = team_id

    def register_map(self, raw_name: str, bounds: dict[str, Any] | None) -> str:
        """Record a map + its bounds; returns the display name."""
        name = display_map_name(raw_name)
        if bounds and name not in self.maps:
            self.maps[name] = {
                "name": name,
                "bounds": {
                    "min": {"x": bounds["min"]["x"], "y": bounds["min"]["y"]},
                    "max": {"x": bounds["max"]["x"], "y": bounds["max"]["y"]},
                },
            }
        elif bounds and name in self.maps:
            if self.maps[name]["bounds"] != {
                "min": {"x": bounds["min"]["x"], "y": bounds["min"]["y"]},
                "max": {"x": bounds["max"]["x"], "y": bounds["max"]["y"]},
            }:
                self.map_bounds_mismatch[name] += 1
        return name


# ---------------------------------------------------------------------------
# Per-series processing
# ---------------------------------------------------------------------------


class SeriesProcessor:
    """Processes one series: events file first, then its supplement file."""

    def __init__(self, agg: Aggregator, raw_dir: str) -> None:
        self.agg = agg
        self.raw_dir = raw_dir
        # Per-series context for the supplement join:
        # event_id -> {map, bounds, team_id, player_id, side, agent, ability}
        self.ability_events: dict[str, dict[str, Any]] = {}
        # game_id -> {player_id -> agent} (agents change between maps).
        self.game_agents: dict[str, dict[str, str]] = defaultdict(dict)
        # game_id -> map display name.
        self.game_maps: dict[str, str] = {}

        # Current-round state (reset on game-started-round).
        self.game_id: str | None = None
        self.map_name: str | None = None
        self.bounds: dict[str, Any] | None = None
        self.round_no: int | None = None
        self.round_start: Any = None  # datetime
        self.round_proper_start: Any = None  # datetime (after buy phase)
        self.round_key: tuple[str, int] | None = None
        # Per-round accumulators, flushed when the next round starts.
        self.round_casts: set[tuple[str, str, str, str, str]] = set()
        self.round_cells: set[tuple[str, str, str, str]] = set()
        self.round_ability: set[tuple[str, str, str]] = set()
        self.round_op_holders: dict[str, str] = {}  # player_id -> side
        self.round_op_teams: set[tuple[str, str]] = set()  # (team, side)

    # -- round lifecycle -------------------------------------------------

    def _flush_round(self) -> None:
        """Commit the finished round's per-round sets to global counters."""
        agg = self.agg
        for key in self.round_casts:
            agg.cast_rounds[key] += 1
        for key in self.round_cells:
            agg.cell_rounds[key] += 1
        for key in self.round_ability:
            agg.ability_rounds[key] += 1
        if self.round_key is not None and self.map_name:
            _, rno = self.round_key
            for player_id, side in self.round_op_holders.items():
                agg.op_rounds[(player_id, self.map_name)] += 1
                agg.op_rounds_by_no[(player_id, self.map_name, rno)] += 1
            for team_id, side in self.round_op_teams:
                agg.op_team_rounds[(team_id, self.map_name, side)] += 1
        self.round_casts.clear()
        self.round_cells.clear()
        self.round_ability.clear()
        self.round_op_holders.clear()
        self.round_op_teams.clear()

    def _start_round(self, game_id: str, round_no: int, occurred: Any,
                     state: dict[str, Any]) -> None:
        """Begin a new round: flush the old one, snapshot the new one."""
        self._flush_round()
        agg = self.agg
        self.game_id = game_id
        self.round_no = round_no
        self.round_key = (game_id, round_no)
        self.round_start = occurred
        # Default: buy phase lasts 30 s; corrected if a sane freezetime-end
        # event arrives (see _end_freezetime).
        self.round_proper_start = (
            occurred + timedelta(seconds=BUY_PHASE_S) if occurred else None)
        agg.rounds_count += 1
        agg.games_seen.add(game_id)
        map_info = state.get("map") or {}
        if map_info.get("name"):
            self.map_name = agg.register_map(map_info["name"],
                                             map_info.get("bounds"))
            self.game_maps[game_id] = self.map_name
            self.bounds = map_info.get("bounds")
        for team in state.get("teams", []):
            team_id = str(team.get("id", ""))
            side = normalise_side(team.get("side"))
            agg.register_team(team_id, team.get("name", ""))
            if self.map_name:
                agg.rounds_team_map[(team_id, self.map_name)] += 1
                agg.rounds_team_map_side[(team_id, self.map_name, side)] += 1
            for player in team.get("players", []):
                player_id = str(player.get("id", ""))
                agg.register_player(player_id, player.get("name", ""), team_id)
                char = player.get("character") or {}
                if char.get("name"):
                    self.game_agents[game_id][player_id] = char["name"]
                    if self.map_name:
                        agg.agent_rounds[
                            (team_id, self.map_name, char["name"], side)] += 1
                if self.map_name:
                    agg.rounds_player[(player_id, self.map_name, round_no)] += 1
                items = (player.get("inventory") or {}).get("items", [])
                if any(it.get("id") == "operator" for it in items):
                    self._mark_operator_holder(player_id, team_id, side,
                                               from_inventory=True)
                    pos = player.get("position") or {}
                    if ("x" in pos and "y" in pos and self.bounds
                            and self.map_name):
                        nx, ny, _ = normalise_xy(pos["x"], pos["y"],
                                                 self.bounds)
                        agg.op_setup[(player_id, self.map_name)].add(
                            {"x": nx, "y": ny, "side": side})

    def _end_freezetime(self, occurred: Any) -> None:
        """Correct the round-proper start when the event timing is sane."""
        if occurred is None or self.round_start is None:
            return
        delta = (occurred - self.round_start).total_seconds()
        if FREEZETIME_MIN_S <= delta <= FREEZETIME_MAX_S:
            self.round_proper_start = occurred
        else:
            self.agg.ft_end_rejected += 1

    def _mark_operator_holder(self, player_id: str, team_id: str, side: str,
                              from_inventory: bool) -> None:
        """Record that a player held an Operator this round."""
        if player_id not in self.round_op_holders:
            self.round_op_holders[player_id] = side
            if from_inventory:
                self.agg.op_rounds_from_inventory += 1
            else:
                self.agg.op_rounds_from_kill_only += 1
        if team_id:
            self.round_op_teams.add((team_id, side))

    def _round_elapsed(self, occurred: Any) -> float | None:
        """Seconds since the round proper started (None if unknown)."""
        if occurred is None or self.round_proper_start is None:
            return None
        return max(0.0, (occurred - self.round_proper_start).total_seconds())

    # -- events pass -----------------------------------------------------

    def process_events(self, path: str) -> None:
        """Stream one series' events file and update the aggregates."""
        agg = self.agg
        for env in stream_jsonl_zst(path):
            occurred = parse_iso(env.get("occurredAt"))
            for ev in env.get("events", []):
                agg.events_processed += 1
                etype = ev.get("type")
                actor = ev.get("actor") or {}
                state = actor.get("state") or {}

                if etype == "game-started-round":
                    segments = (actor.get("stateDelta") or {}).get("segments", [])
                    rno = None
                    for seg in segments:
                        if seg.get("type") == "round":
                            rno = seg.get("sequenceNumber")
                    if rno is None:
                        m = re.search(r"round-(\d+)", str(actor.get("id", "")))
                        rno = int(m.group(1)) if m else (
                            (self.round_no or 0) + 1)
                    self._start_round(str(actor.get("id", "")), int(rno),
                                      occurred, state)
                elif etype == "round-ended-freezetime":
                    self._end_freezetime(occurred)
                elif etype in ("game-ended-round", "game-started-gameClock"):
                    # End-of-round / game-start snapshots: agent mapping +
                    # Operator inventory evidence (no setup positions here —
                    # those come from round-start snapshots only).
                    # The actor of these events is the game itself; prefer
                    # its id over the (possibly stale) current game id.
                    gid = (str(actor.get("id", ""))
                           if actor.get("type") == "game"
                           else (self.game_id or str(actor.get("id", ""))))
                    for team in state.get("teams", []):
                        team_id = str(team.get("id", ""))
                        side = normalise_side(team.get("side"))
                        agg.register_team(team_id, team.get("name", ""))
                        for player in team.get("players", []):
                            player_id = str(player.get("id", ""))
                            agg.register_player(player_id,
                                                player.get("name", ""), team_id)
                            char = player.get("character") or {}
                            if char.get("name"):
                                self.game_agents[gid][player_id] = char["name"]
                            items = (player.get("inventory") or {}).get(
                                "items", [])
                            if any(it.get("id") == "operator"
                                   for it in items):
                                self._mark_operator_holder(
                                    player_id, team_id, side,
                                    from_inventory=True)
                elif etype == "player-used-ability":
                    self._handle_ability_cast(ev, occurred)
                elif etype == "player-pickedUp-item":
                    target = ev.get("target") or {}
                    if target.get("id") == "operator":
                        player_id = str(actor.get("id", ""))
                        team_id = str(state.get("teamId", ""))
                        self._mark_operator_holder(
                            player_id, team_id,
                            normalise_side(state.get("side")),
                            from_inventory=True)
                elif etype == "player-killed-player":
                    self._handle_kill(ev)
        self._flush_round()

    def _handle_ability_cast(self, ev: dict[str, Any], occurred: Any) -> None:
        """Record one ability cast as a heatmap point + tendency signal."""
        agg = self.agg
        if self.map_name is None or self.bounds is None:
            return  # no map context yet (should not happen after round 1)
        actor = ev.get("actor") or {}
        state = actor.get("state") or {}
        game_state = state.get("game") or {}
        player_id = str(actor.get("id", ""))
        team_id = str(state.get("teamId", ""))
        side = normalise_side(state.get("side"))
        ability = str((ev.get("target") or {}).get("id", ""))
        agent = (self.game_agents.get(self.game_id or {}, {})
                 .get(player_id, "unknown"))
        agg.register_player(player_id, state.get("name", ""), team_id)
        pos = game_state.get("position") or {}
        if "x" not in pos or "y" not in pos:
            return
        nx, ny, in_bounds = normalise_xy(pos["x"], pos["y"], self.bounds)
        if not in_bounds:
            agg.oob_points += 1
        bucket = round_time_bucket(self._round_elapsed(occurred))
        agg.bucket_counts[bucket] += 1
        if bucket == "unknown":
            agg.bucket_unknown += 1
        agg.casts_total += 1
        agg.heatmap_total += 1
        agg.heatmap_by_map_total[self.map_name] += 1
        agg.heatmap_points[self.map_name].add({
            "map": self.map_name,
            "team_id": team_id,
            "player_id": player_id,
            "agent": agent,
            "ability": ability,
            "side": side,
            "x": nx,
            "y": ny,
            "round_time_bucket": bucket,
        })
        # Per-round tendency signals.
        self.round_casts.add((team_id, self.map_name, agent, ability, side))
        self.round_ability.add((team_id, self.map_name, ability))
        if is_placeable(ability):
            self.round_cells.add(
                (team_id, self.map_name, ability, sector_label(nx, ny)))
        # Context for the supplement join.
        self.ability_events[ev.get("id", "")] = {
            "map": self.map_name,
            "bounds": self.bounds,
            "team_id": team_id,
            "player_id": player_id,
            "side": side,
            "agent": agent,
            "ability": ability,
        }

    def _handle_kill(self, ev: dict[str, Any]) -> None:
        """Record Operator kills (and kill-based ownership fallback)."""
        agg = self.agg
        if self.map_name is None:
            return
        actor = ev.get("actor") or {}
        state = actor.get("state") or {}
        delta = (actor.get("stateDelta") or {}).get("round") or {}
        op_kills = (delta.get("weaponKills") or {}).get("operator", 0)
        if not op_kills:
            return
        player_id = str(actor.get("id", ""))
        team_id = str(state.get("teamId", ""))
        side = normalise_side(state.get("side"))
        agg.op_kills[(player_id, self.map_name)] += int(op_kills)
        # Fallback ownership evidence: a kill proves the player held the
        # weapon this round even when no inventory snapshot caught it.
        self._mark_operator_holder(player_id, team_id, side,
                                   from_inventory=False)

    # -- supplement pass -------------------------------------------------

    def process_supplement(self, path: str) -> None:
        """Stream one series' ability supplement; join + project landings."""
        agg = self.agg
        for rec in stream_jsonl_zst(path):
            agg.suppl_total += 1
            if not rec.get("in_grid"):
                continue
            agg.suppl_in_grid += 1
            ctx = self.ability_events.get(rec.get("grid_event_id") or "")
            if ctx is None:
                agg.suppl_missed += 1
                continue
            agg.suppl_joined += 1
            ability = ctx["ability"]
            if not is_throwable(ability):
                continue
            interp = rec.get("interpolated") or rec.get("frame_before") or {}
            pos = interp.get("position") or {}
            view = interp.get("view") or {}
            vel = interp.get("velocity") or {}
            if "x" not in pos or "y" not in pos or "z" not in pos:
                continue
            est = project_landing(pos, view, vel, ability)
            if est is None:
                continue
            bounds = ctx["bounds"]
            cast_x, cast_y, cast_ok = normalise_xy(pos["x"], pos["y"], bounds)
            est_x, est_y, est_ok = normalise_xy(est[0], est[1], bounds)
            if not (cast_ok and est_ok):
                agg.landing_oob += 1
            if not est_ok:
                agg.landing_clamped += 1
            agg.landing_total += 1
            agg.landing_zones[ctx["map"]].add({
                "map": ctx["map"],
                "team_id": ctx["team_id"],
                "player_id": ctx["player_id"],
                "ability": ability,
                "cast_x": cast_x,
                "cast_y": cast_y,
                "est_x": est_x,
                "est_y": est_y,
                "confidence": confidence_for(rec),
                "method": LANDING_METHOD,
            })

    # -- driver ----------------------------------------------------------

    def process_series(self, series_id: str) -> bool:
        """Process one series' events + supplement files. Returns success."""
        events_path = os.path.join(self.raw_dir, "val",
                                   f"events_{series_id}_grid.jsonl.zst")
        suppl_path = os.path.join(self.raw_dir, "supplement",
                                  f"{series_id}.jsonl.zst")
        try:
            self.process_events(events_path)
        except FileNotFoundError:
            return False
        if os.path.exists(suppl_path):
            self.process_supplement(suppl_path)
        return True


# ---------------------------------------------------------------------------
# Output builders
# ---------------------------------------------------------------------------


def build_meta(agg: Aggregator, series_ids: list[str],
               heatmap_kept: int) -> dict[str, Any]:
    """meta.json: coverage + registries + sampling disclosure."""
    teams = [{"id": tid, "name": name}
             for tid, name in sorted(agg.teams.items(), key=lambda kv: kv[1])]
    players = [{"id": pid, "name": info["name"], "team_id": info["team_id"]}
               for pid, info in sorted(agg.players.items(),
                                       key=lambda kv: kv[1]["name"].lower())]
    maps = [agg.maps[name] for name in sorted(agg.maps)]
    return {
        "generated_at": now_iso(),
        "series_count": agg.series_processed,
        "games_count": len(agg.games_seen),
        "rounds_count": agg.rounds_count,
        "events_processed": agg.events_processed,
        "teams": teams,
        "players": players,
        "maps": maps,
        # Extra (documented) fields — the frontend ignores unknown keys.
        "series_ids": series_ids,
        "heatmap_sampling": {
            "points_total": agg.heatmap_total,
            "points_kept": heatmap_kept,
            "method": ("reservoir sampling per map (cap "
                       f"{agg.heatmap_cap}/map, seed 42); systematic "
                       "stride downsampling applied only if the 8 MB "
                       "total budget would otherwise be exceeded"),
            "per_map_cap": agg.heatmap_cap,
        },
        "landing_zones_note": (
            "landing-zones.json berisi ESTIMASI proyeksi balistik, bukan "
            "posisi pendaratan terukur — lihat pipeline/README.md"
        ),
        "operator_evidence_note": (
            "rounds_with_operator dari snapshot inventory (game-started-round "
            "/ game-ended-round) + player-pickedUp-item; kill Operator "
            "dipakai sebagai bukti fallback bila tidak ada snapshot"
        ),
    }


def build_heatmaps(agg: Aggregator) -> list[dict[str, Any]]:
    """All sampled heatmap points, sorted for stable output."""
    points: list[dict[str, Any]] = []
    for name in sorted(agg.heatmap_points):
        points.extend(agg.heatmap_points[name].items)
    points.sort(key=lambda p: (p["map"], p["team_id"], p["player_id"],
                               p["ability"], p["x"], p["y"]))
    return points


def build_landing_zones(agg: Aggregator) -> list[dict[str, Any]]:
    """All sampled landing-zone estimates, sorted for stable output."""
    zones: list[dict[str, Any]] = []
    for name in sorted(agg.landing_zones):
        zones.extend(agg.landing_zones[name].items)
    zones.sort(key=lambda z: (z["map"], z["team_id"], z["ability"],
                              z["cast_x"], z["cast_y"]))
    return zones


def build_operators(agg: Aggregator) -> list[dict[str, Any]]:
    """Per-player Operator profiles (only players with Op evidence)."""
    profiles: dict[str, dict[str, Any]] = {}
    for (player_id, map_name), rounds in agg.op_rounds.items():
        prof = profiles.setdefault(player_id, {
            "player_id": player_id,
            "player_name": agg.players.get(player_id, {}).get("name", player_id),
            "team_id": agg.players.get(player_id, {}).get("team_id", ""),
            "maps": {},
        })
        buy_rate: dict[str, float] = {}
        for (pid, mname, rno), played in agg.rounds_player.items():
            if pid != player_id or mname != map_name:
                continue
            with_op = agg.op_rounds_by_no.get((pid, mname, rno), 0)
            buy_rate[str(rno)] = round(with_op / played, 3) if played else 0.0
        prof["maps"][map_name] = {
            "rounds_with_operator": rounds,
            "operator_kills": agg.op_kills.get((player_id, map_name), 0),
            "buy_rate_by_round": dict(sorted(
                buy_rate.items(), key=lambda kv: int(kv[0]))),
            "setup_positions": agg.op_setup.get(
                (player_id, map_name), Reservoir(0)).items,
        }
    # Players with Operator kills but no inventory-snapshot round (their
    # rounds are still counted via the kill fallback, so they are already
    # in op_rounds; this is only a safety net for kills without a round).
    for (player_id, map_name), kills in agg.op_kills.items():
        if player_id not in profiles or map_name not in profiles[player_id]["maps"]:
            prof = profiles.setdefault(player_id, {
                "player_id": player_id,
                "player_name": agg.players.get(player_id, {}).get(
                    "name", player_id),
                "team_id": agg.players.get(player_id, {}).get("team_id", ""),
                "maps": {},
            })
            prof["maps"][map_name] = {
                "rounds_with_operator": agg.op_rounds.get(
                    (player_id, map_name), 0),
                "operator_kills": kills,
                "buy_rate_by_round": {},
                "setup_positions": [],
            }
    out = sorted(profiles.values(),
                 key=lambda p: (-sum(m["rounds_with_operator"]
                                     for m in p["maps"].values()),
                                p["player_name"].lower()))
    return out


def _side_word(side: str) -> str:
    return {"attack": "attack", "defense": "defense"}.get(side, side)


def generate_cards(agg: Aggregator,
                   team_filter: set[str] | None) -> list[dict[str, Any]]:
    """Rule-template tendency cards per (team, map).

    Three tendency families, all with n >= MIN_ROUNDS_TENDENCY rounds:
    (1) agent+ability usage rate, (2) placeable-ability sector clustering,
    (3) team Operator usage per side. Top MAX_CARDS_PER_TEAM_MAP cards per
    (team, map), ranked by n then frequency.
    """
    # Group cast-rounds by (team, map, agent, ability) with side detail.
    by_combo: dict[tuple[str, str, str, str], dict[str, int]] = defaultdict(
        lambda: {"n": 0, "attack": 0, "defense": 0})
    for (team, map_name, agent, ability, side), n in agg.cast_rounds.items():
        key = (team, map_name, agent, ability)
        by_combo[key]["n"] += n
        if side in ("attack", "defense"):
            by_combo[key][side] += n

    # Global baseline per (agent, ability): how often the ability is used
    # in rounds where the agent is played, across ALL teams+maps. A team
    # tendency must beat this baseline by a clear margin — otherwise
    # routine abilities (Astra placing stars, Vyse raising her wall) would
    # flood the cards at ~100% for every team. Abilities with a baseline
    # above 0.90 are ubiquitous mechanics, not tendencies.
    baseline_cast: Counter = Counter()
    for (_t, _m, agent, ability, _s), n in agg.cast_rounds.items():
        baseline_cast[(agent, ability)] += n
    baseline_agent: Counter = Counter()
    for (team, map_name, agent, side), n in agg.agent_rounds.items():
        baseline_agent[agent] += n

    def baseline(agent: str, ability: str) -> float:
        denom = baseline_agent.get(agent, 0)
        return baseline_cast.get((agent, ability), 0) / denom if denom else 0.0

    cards_by_tm: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)

    def add(team: str, map_name: str, tendency: str, n: int,
            frequency: float, response: str) -> None:
        cards_by_tm[(team, map_name)].append({
            "team_id": team,
            "map": map_name,
            "tendency": tendency,
            "n": n,
            "frequency": round(frequency, 3),
            "response": response,
        })

    for (team, map_name), rounds_total in agg.rounds_team_map.items():
        if team_filter is not None and team not in team_filter:
            continue
        if rounds_total < MIN_ROUNDS_TENDENCY:
            continue
        # (1) Ability usage tendencies. Frequency is measured against the
        # rounds the team actually played that agent (not all rounds), and
        # must beat the global baseline for the (agent, ability) pair.
        for (t, m, agent, ability), counts in by_combo.items():
            if t != team or m != map_name:
                continue
            base = baseline(agent, ability)
            if base > 0.90:
                continue  # ubiquitous mechanic, not a tendency
            n = counts["n"]
            if n < MIN_ROUNDS_TENDENCY:
                continue
            agent_rounds = sum(
                agg.agent_rounds.get((team, map_name, agent, s), 0)
                for s in ("attack", "defense"))
            if not agent_rounds:
                continue
            freq = n / agent_rounds
            threshold = max(MIN_FREQ_ABILITY, base + 0.15)
            # Prefer a side-specific variant when it clearly dominates.
            best_side, best_freq, best_n = None, 0.0, 0
            for side in ("attack", "defense"):
                side_agent_rounds = agg.agent_rounds.get(
                    (team, map_name, agent, side), 0)
                if (side_agent_rounds
                        and counts[side] >= MIN_ROUNDS_TENDENCY):
                    f = counts[side] / side_agent_rounds
                    if f > best_freq:
                        best_side, best_freq, best_n = side, f, counts[side]
            if (best_side is not None and best_freq >= threshold
                    and best_freq >= freq + 0.15):
                add(team, map_name,
                    f"{pretty_agent(agent)} memakai {pretty_ability(ability)} "
                    f"di {round(best_freq * 100)}% round {_side_word(best_side)}",
                    best_n, best_freq,
                    RESPONSE_TEMPLATES[ability_category(ability)])
            elif freq >= threshold:
                add(team, map_name,
                    f"{pretty_agent(agent)} memakai {pretty_ability(ability)} "
                    f"di {round(freq * 100)}% round",
                    n, freq, RESPONSE_TEMPLATES[ability_category(ability)])
        # (2) Placeable sector clustering.
        for (t, m, ability, cell), n_cell in agg.cell_rounds.items():
            if t != team or m != map_name:
                continue
            if n_cell < MIN_ROUNDS_TENDENCY:
                continue
            n_ability = agg.ability_rounds.get((team, map_name, ability), 0)
            share = n_cell / n_ability if n_ability else 0.0
            freq = n_cell / rounds_total
            if freq >= MIN_FREQ_CELL and share >= MIN_CELL_SHARE:
                add(team, map_name,
                    f"Penempatan {pretty_ability(ability)} terkonsentrasi di "
                    f"sektor {cell} ({round(share * 100)}% dari pemakaian)",
                    n_cell, freq, RESPONSE_TEMPLATES["placeable"])
        # (3) Team Operator usage per side.
        for side in ("attack", "defense"):
            side_rounds = agg.rounds_team_map_side.get(
                (team, map_name, side), 0)
            n_op = agg.op_team_rounds.get((team, map_name, side), 0)
            if (side_rounds and n_op >= MIN_ROUNDS_TENDENCY
                    and n_op / side_rounds >= MIN_FREQ_OPERATOR):
                add(team, map_name,
                    f"Operator di {round(n_op / side_rounds * 100)}% round "
                    f"{_side_word(side)}",
                    n_op, n_op / side_rounds,
                    RESPONSE_TEMPLATES["operator"])

    cards: list[dict[str, Any]] = []
    for (team, map_name), tm_cards in cards_by_tm.items():
        tm_cards.sort(key=lambda c: (-c["n"], -c["frequency"], c["tendency"]))
        cards.extend(tm_cards[:MAX_CARDS_PER_TEAM_MAP])
    cards.sort(key=lambda c: (c["team_id"], c["map"], -c["n"]))
    return cards


# ---------------------------------------------------------------------------
# Budget enforcement
# ---------------------------------------------------------------------------


def json_size(obj: Any, compact: bool) -> int:
    """Byte size of an object as it will be written."""
    if compact:
        return len(json.dumps(obj, separators=(",", ":"),
                              ensure_ascii=False).encode("utf-8"))
    return len(json.dumps(obj, indent=2, ensure_ascii=False).encode("utf-8"))


def enforce_budget(outputs: dict[str, tuple[Any, bool]],
                   budget: int) -> tuple[dict[str, int], dict[str, int]]:
    """Downsample heatmaps/landing zones until the total fits the budget.

    ``outputs`` maps filename -> (object, compact?). Heatmaps are stride-
    downsampled first (they dominate the size), then landing zones. Returns
    (final per-file sizes in bytes, halvings applied per file).
    """
    def total() -> int:
        return sum(json_size(obj, comp) for obj, comp in outputs.values())

    strides: dict[str, int] = {}
    while total() > budget:
        # Prefer shrinking the largest downsampleable file.
        cands = [f for f in ("heatmaps.json", "landing-zones.json")
                 if f in outputs and len(outputs[f][0]) > 100]
        if not cands:
            break
        target = max(cands, key=lambda f: json_size(*outputs[f]))
        strides[target] = strides.get(target, 0) + 1
        obj, comp = outputs[target]
        # Progressive halving: keep every 2nd item of the current list.
        outputs[target] = (obj[::2], comp)
    return ({f: json_size(obj, comp) for f, (obj, comp) in outputs.items()},
            strides)


# ---------------------------------------------------------------------------
# Validation report
# ---------------------------------------------------------------------------


def write_validation_md(path: str, agg: Aggregator,
                        sizes: dict[str, int],
                        heatmap_kept: int, landing_kept: int,
                        halvings: dict[str, int] | None = None) -> None:
    """Write pipeline/VALIDATION.md with the run's validation numbers."""
    join_rate = (agg.suppl_joined / agg.suppl_in_grid
                 if agg.suppl_in_grid else 0.0)
    total_bytes = sum(sizes.values())
    lines = [
        "# SIGHTLINE — Validation Report (pipeline)",
        "",
        f"Generated: {now_iso()} — run `python pipeline/aggregate.py` to regenerate.",
        "",
        "## Coverage",
        "",
        f"- Series processed: **{agg.series_processed}**"
        + (f" (failed: {', '.join(agg.series_failed)})"
           if agg.series_failed else ""),
        f"- Games: **{len(agg.games_seen)}**",
        f"- Rounds: **{agg.rounds_count}**",
        f"- Events processed: **{agg.events_processed}**",
        f"- Ability casts seen: **{agg.casts_total}**",
        f"- Teams: **{len(agg.teams)}**, players: **{len(agg.players)}**, "
        f"maps: **{len(agg.maps)}**",
        "",
        "## Supplement join (supplement <-> events)",
        "",
        f"- Supplement records: {agg.suppl_total} "
        f"({agg.suppl_in_grid} with `in_grid=true`)",
        f"- Joined on `grid_event_id`: {agg.suppl_joined} "
        f"(**{join_rate:.1%}** of in-grid records)",
        f"- Unmatched in-grid records: {agg.suppl_missed}",
        "",
        "## Coordinate validation",
        "",
        f"- Heatmap points outside map bounds (pre-clamp): "
        f"**{agg.oob_points}** (all clamped into 0-1000; output has 0 "
        "out-of-range points by construction)",
        f"- Landing-zone points outside bounds (pre-clamp): "
        f"{agg.landing_oob} ({agg.landing_clamped} estimated landings "
        "clamped to bounds)",
        f"- Map bounds mismatches across series: "
        f"{dict(agg.map_bounds_mismatch) or 'none'}",
        "",
        "## Round-time buckets",
        "",
        f"- Bucket distribution: {dict(agg.bucket_counts)}",
        f"- Casts with unknown round time: {agg.bucket_unknown}",
        f"- Freezetime-end events rejected (outside 20-45 s window): "
        f"{agg.ft_end_rejected}",
        "",
        "## Operator evidence",
        "",
        f"- Rounds with Operator evidenced by inventory snapshot: "
        f"{agg.op_rounds_from_inventory}",
        f"- Rounds evidenced by Operator kill only (fallback): "
        f"{agg.op_rounds_from_kill_only}",
        f"- Total Operator kills: {sum(agg.op_kills.values())}",
        "",
        "## Output sizes (budget 8 MB total)",
        "",
    ]
    for fname in ("meta.json", "heatmaps.json", "operators.json",
                  "anti-strat.json", "self-scout.json", "landing-zones.json"):
        if fname in sizes:
            lines.append(f"- `{fname}`: {sizes[fname]:,} bytes")
    lines += [
        f"- **Total: {total_bytes:,} bytes "
        f"({total_bytes / (1024 * 1024):.2f} MB)**",
        "",
        "## Sampling",
        "",
        f"- Heatmap points: {heatmap_kept:,} kept of {agg.heatmap_total:,} "
        f"total (reservoir per map, cap {agg.heatmap_cap}/map)",
        f"- Landing zones: {landing_kept:,} kept of {agg.landing_total:,} "
        f"projected (reservoir per map, cap {agg.landing_cap}/map)",
        f"- Budget downsampling (halvings applied to fit 8 MB): "
        f"{halvings or 'none'}",
        "",
        "## Distribution per map (casts seen)",
        "",
    ]
    for map_name, n in agg.heatmap_by_map_total.most_common():
        lines.append(f"- {map_name}: {n:,} casts")
    lines += [
        "",
        "## Caveats (see pipeline/README.md for detail)",
        "",
        "- Round-time buckets use envelope `occurredAt` relative to the "
        "round-proper start (freezetime end, or round start + 30 s). GRID "
        "timestamps are occasionally delayed; buckets are approximate.",
        "- Landing zones are ballistic ESTIMATES with nominal projectile "
        "speeds, not measured trajectories.",
        "- Operator ownership is evidenced by inventory snapshots and "
        "pickups; kill-based rounds are a documented fallback.",
        "",
    ]
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------


def repo_root() -> str:
    """Absolute path of the repo root (parent of pipeline/)."""
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main(argv: list[str] | None = None) -> int:
    """Run the pipeline: select series, aggregate, write docs/data/*.json."""
    parser = argparse.ArgumentParser(
        description="SIGHTLINE aggregation pipeline (GRID -> docs/data).")
    parser.add_argument("--data-dir", default=None,
                        help="Raw data root (default: $STL_DATA_DIR or "
                             "../data/raw relative to the repo).")
    parser.add_argument("--out-dir", default=None,
                        help="Output dir (default: <repo>/docs/data).")
    parser.add_argument("--limit", type=int, default=0,
                        help="Process at most N series (0 = all).")
    parser.add_argument("--heatmap-cap", type=int, default=HEATMAP_PER_MAP_CAP,
                        help="Heatmap reservoir cap per map.")
    parser.add_argument("--landing-cap", type=int, default=LANDING_PER_MAP_CAP,
                        help="Landing-zone reservoir cap per map.")
    parser.add_argument("--budget", type=int, default=TOTAL_BUDGET_BYTES,
                        help="Total output budget in bytes.")
    parser.add_argument("--checkpoint", default=None,
                        help="Pickle file for periodic state checkpoints "
                             "(outside the repo; enables --resume).")
    parser.add_argument("--resume", default=None,
                        help="Checkpoint file to resume from (skips series "
                             "already processed).")
    args = parser.parse_args(argv)

    raw_dir = args.data_dir or data_dir()
    out_dir = args.out_dir or os.path.join(repo_root(), "docs", "data")
    os.makedirs(out_dir, exist_ok=True)

    rows = load_series_csv(os.path.join(raw_dir, "val", "series.csv"))
    selected = select_series(rows)
    if args.limit:
        selected = selected[: args.limit]
    print(f"Selected {len(selected)} series from {len(rows)} in series.csv",
          flush=True)

    def save_checkpoint() -> None:
        if not args.checkpoint:
            return
        tmp = args.checkpoint + ".tmp"
        with open(tmp, "wb") as fh:
            pickle.dump({"agg": agg, "series_ids": series_ids}, fh)
        os.replace(tmp, args.checkpoint)

    series_ids: list[str] = []
    done: set[str] = set()
    if args.resume:
        with open(args.resume, "rb") as fh:
            state = pickle.load(fh)
        agg = state["agg"]
        series_ids = state["series_ids"]
        done = set(series_ids) | set(agg.series_failed)
        print(f"Resumed from {args.resume}: {len(done)} series already done",
              flush=True)
    else:
        agg = Aggregator(args.heatmap_cap, args.landing_cap)
        # Meta CSVs enrich names for teams/players never seen in a full state.
        meta_dir = os.path.join(raw_dir, "meta")
        if os.path.exists(os.path.join(meta_dir, "teams.csv")):
            for tid, name in load_meta_teams(
                    os.path.join(meta_dir, "teams.csv")).items():
                agg.teams.setdefault(tid, name)
        if os.path.exists(os.path.join(meta_dir, "players.csv")):
            for pid, info in load_meta_players(
                    os.path.join(meta_dir, "players.csv")).items():
                agg.players.setdefault(pid, info)

    for i, row in enumerate(selected, 1):
        series_id = row["series_id"]
        if series_id in done:
            continue
        proc = SeriesProcessor(agg, raw_dir)
        ok = proc.process_series(series_id)
        if ok:
            agg.series_processed += 1
            series_ids.append(series_id)
        else:
            agg.series_failed.append(series_id)
        done.add(series_id)
        if agg.series_processed % 25 == 0 or i == len(selected):
            print(f"  [{i}/{len(selected)}] series {series_id} — "
                  f"events={agg.events_processed:,} "
                  f"rounds={agg.rounds_count} casts={agg.casts_total:,}",
                  flush=True)
            save_checkpoint()

    # Prune meta registries to teams/players actually observed in the
    # selected series (meta CSVs cover LoL + unselected VAL events too).
    # Teams/players seen in events were registered during processing; the
    # CSV preload above only fills names, so drop entries with no evidence.
    # (Evidence = appearing in a round state or a cast/kill event — all of
    # those paths call register_team/register_player, which cannot be told
    # apart from the preload, so instead we intersect with observed ids.)
    # Observed ids are tracked implicitly: heatmaps + operators + cast
    # counters reference them. Simplest robust check: keep a team/player
    # if it appears in any counter or point.
    observed_teams: set[str] = set()
    observed_players: set[str] = set()
    for (team, _m) in agg.rounds_team_map:
        observed_teams.add(team)
    for (player, _m, _r) in agg.rounds_player:
        observed_players.add(player)
    for pts in agg.heatmap_points.values():
        for p in pts.items:
            observed_teams.add(p["team_id"])
            observed_players.add(p["player_id"])
    agg.teams = {t: n for t, n in agg.teams.items() if t in observed_teams}
    agg.players = {p: info for p, info in agg.players.items()
                   if p in observed_players}

    heatmaps = build_heatmaps(agg)
    landing_zones = build_landing_zones(agg)
    operators = build_operators(agg)
    anti_strat = generate_cards(agg, team_filter=None)
    self_scout = generate_cards(agg, team_filter=SELF_SCOUT_TEAMS)
    meta = build_meta(agg, series_ids, len(heatmaps))

    outputs: dict[str, tuple[Any, bool]] = {
        "meta.json": (meta, False),
        "heatmaps.json": (heatmaps, True),
        "operators.json": (operators, False),
        "anti-strat.json": (anti_strat, False),
        "self-scout.json": (self_scout, False),
        "landing-zones.json": (landing_zones, True),
    }
    sizes, halvings = enforce_budget(outputs, args.budget)
    heatmap_kept = len(outputs["heatmaps.json"][0])
    landing_kept = len(outputs["landing-zones.json"][0])
    # Keep meta's sampling note honest after any downsampling.
    outputs["meta.json"][0]["heatmap_sampling"]["points_kept"] = heatmap_kept
    sizes["meta.json"] = json_size(outputs["meta.json"][0], False)

    for fname, (obj, compact) in outputs.items():
        with open(os.path.join(out_dir, fname), "w", encoding="utf-8") as fh:
            if compact:
                json.dump(obj, fh, separators=(",", ":"), ensure_ascii=False)
            else:
                json.dump(obj, fh, indent=2, ensure_ascii=False)
        print(f"  wrote {fname}: {sizes[fname]:,} bytes", flush=True)

    total = sum(sizes.values())
    print(f"Total output: {total:,} bytes "
          f"({total / (1024 * 1024):.2f} MB, budget {args.budget:,})",
          flush=True)
    print(f"Series: {agg.series_processed}, games: {len(agg.games_seen)}, "
          f"rounds: {agg.rounds_count}, events: {agg.events_processed:,}, "
          f"casts: {agg.casts_total:,}", flush=True)
    print(f"Supplement join: {agg.suppl_joined:,}/{agg.suppl_in_grid:,} "
          f"in-grid records", flush=True)
    print(f"Out-of-bounds heatmap points (pre-clamp): {agg.oob_points}",
          flush=True)
    print(f"Cards: anti-strat={len(anti_strat)} "
          f"self-scout={len(self_scout)} "
          f"operator profiles={len(operators)}", flush=True)

    write_validation_md(
        os.path.join(repo_root(), "pipeline", "VALIDATION.md"),
        agg, sizes, heatmap_kept, landing_kept, halvings)
    print("Wrote pipeline/VALIDATION.md", flush=True)
    if args.checkpoint and os.path.exists(args.checkpoint):
        os.remove(args.checkpoint)
        print(f"Removed checkpoint {args.checkpoint}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
