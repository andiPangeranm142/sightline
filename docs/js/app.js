/**
 * SIGHTLINE — scouting console application logic.
 * Vanilla JS, no dependencies. All insight claims render with their
 * sample size (n) and frequency — evidence-first, no insight without proof.
 */
"use strict";

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const state = {
  datasets: null,
  sources: {},
  // filters (teamId resolved from loaded data in resolveDefaults())
  teamId: null,
  map: "Ascent",
  playerId: "all",
  agent: "all",
  ability: "all",
  side: "all",
  buckets: new Set(["0-20s", "20-40s", "40-60s", "60s+"]),
  heatMode: "gradient", // "gradient" | "numbers"
  showLanding: true,
  selfScout: false,
  operatorPlayerId: null, // resolved to first Operator profile on render
};

const BUCKETS = ["0-20s", "20-40s", "40-60s", "60s+"];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function pct(f) { return Math.round(f * 100) + "%"; }

function teamName(id) {
  const t = (state.datasets.meta.teams || []).find((x) => x.id === id);
  return t ? t.name : id;
}

function playerName(id) {
  const p = (state.datasets.meta.players || []).find((x) => x.id === id);
  return p ? p.name : id;
}

function fmtNum(n) { return Number(n).toLocaleString("en-US"); }

/** "2026-11-22T23:32:20Z" -> "22 Nov 2026, 23:32 UTC" (same instant). */
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return iso || "—";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}, `
    + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", init);

async function init() {
  showLoading(true);
  try {
    const { datasets, sources, errors } = await loadAllData();
    state.datasets = datasets;
    state.sources = sources;
    if (!datasets.meta || !datasets.heatmaps) {
      throw new Error("Core data (meta / heatmaps) could not be loaded.");
    }
    resolveDefaults();
    if (errors.length) renderDataErrors(errors);
    buildFilterOptions();
    wireEvents();
    renderAll();
    showLoading(false);
    renderSourceBadge();
  } catch (e) {
    $("#loading-state").hidden = true;
    $("#app-main").hidden = true;
    renderFatalError(e.message);
  }
}

/**
 * Resolve filter defaults from the loaded data (never hardcode team ids:
 * real GRID ids differ from mock ids). Prefers Sentinels as the default
 * opponent for the demo narrative; falls back to the first team.
 */
function resolveDefaults() {
  const meta = state.datasets.meta;
  const teams = meta.teams || [];
  const sen = teams.find((t) => t.name === "Sentinels");
  if (!teams.some((t) => t.id === state.teamId)) {
    state.teamId = sen ? sen.id : (teams[0] && teams[0].id);
  }
  if (!meta.maps.some((m) => m.name === state.map)) {
    state.map = meta.maps[0].name;
  }
}

/** Team ids for Cloud9 + Cloud9 GC, derived from meta by name. */
function c9TeamIds() {
  return new Set((state.datasets.meta.teams || [])
    .filter((t) => t.name === "Cloud9" || t.name === "Cloud9 GC")
    .map((t) => t.id));
}

function showLoading(on) {
  $("#loading-state").hidden = !on;
  $("#app-main").hidden = on;
}

function renderFatalError(msg) {
  const el = $("#error-state");
  el.hidden = false;
  $("#error-message").textContent = msg;
}

function renderDataErrors(errors) {
  const el = $("#data-errors");
  el.hidden = false;
  el.innerHTML = "<strong>Some data failed to load:</strong> "
    + errors.map((e) => esc(e.file) + ".json").join(", ")
    + " — affected panels show an empty state.";
}

function renderSourceBadge() {
  const anyMock = Object.values(state.sources).includes("mock");
  const badge = $("#data-source-badge");
  if (anyMock) {
    badge.textContent = "DATA: MOCK (pipeline aggregates not available yet)";
    badge.classList.add("badge--mock");
  } else {
    badge.textContent = "DATA: LIVE — GRID aggregates";
    badge.classList.add("badge--live");
  }
}

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

function buildFilterOptions() {
  const meta = state.datasets.meta;

  // Team select (opponent teams + C9 for self-scout context)
  const teamSel = $("#filter-team");
  teamSel.innerHTML = meta.teams.map((t) =>
    `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("");
  teamSel.value = state.teamId;

  // Map select
  const mapSel = $("#filter-map");
  mapSel.innerHTML = meta.maps.map((m) =>
    `<option value="${esc(m.name)}">${esc(m.name)}</option>`).join("");
  mapSel.value = state.map;

  rebuildPlayerOptions();
  rebuildAbilityOptions();
  renderCoverage();
}

function rebuildPlayerOptions() {
  const meta = state.datasets.meta;
  const players = meta.players.filter((p) => p.team_id === state.teamId);
  const sel = $("#filter-player");
  sel.innerHTML = `<option value="all">All players</option>` + players.map((p) =>
    `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  if (!players.some((p) => p.id === state.playerId)) state.playerId = "all";
  sel.value = state.playerId;
}

function rebuildAbilityOptions() {
  const pts = state.datasets.heatmaps;
  const agents = [...new Set(pts.map((p) => p.agent))].sort();
  const abilities = [...new Set(pts.map((p) => p.ability))].sort();
  const agentSel = $("#filter-agent");
  agentSel.innerHTML = `<option value="all">All agents</option>` + agents.map((a) =>
    `<option value="${esc(a)}">${esc(a)}</option>`).join("");
  agentSel.value = state.agent;
  const abSel = $("#filter-ability");
  abSel.innerHTML = `<option value="all">All abilities</option>` + abilities.map((a) =>
    `<option value="${esc(a)}">${esc(a)}</option>`).join("");
  abSel.value = state.ability;
}

function wireEvents() {
  $("#filter-team").addEventListener("change", (e) => {
    state.teamId = e.target.value;
    rebuildPlayerOptions();
    syncOperatorPlayer();
    renderAll();
  });
  $("#filter-map").addEventListener("change", (e) => { state.map = e.target.value; renderAll(); });
  $("#filter-player").addEventListener("change", (e) => { state.playerId = e.target.value; renderAll(); });
  $("#filter-agent").addEventListener("change", (e) => { state.agent = e.target.value; renderAll(); });
  $("#filter-ability").addEventListener("change", (e) => { state.ability = e.target.value; renderAll(); });
  $("#filter-side").addEventListener("change", (e) => { state.side = e.target.value; renderAll(); });

  $$(".bucket-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const b = btn.dataset.bucket;
      if (state.buckets.has(b)) state.buckets.delete(b); else state.buckets.add(b);
      btn.classList.toggle("active", state.buckets.has(b));
      btn.setAttribute("aria-pressed", String(state.buckets.has(b)));
      renderAll();
    });
  });

  $$("input[name='heat-mode']").forEach((r) => {
    r.addEventListener("change", () => { state.heatMode = r.value; renderHeatmap(); });
  });

  $("#toggle-landing").addEventListener("change", (e) => {
    state.showLanding = e.target.checked;
    renderHeatmap();
  });

  $("#toggle-selfscout").addEventListener("change", (e) => {
    state.selfScout = e.target.checked;
    document.body.classList.toggle("self-scout-mode", state.selfScout);
    renderAntiStrat();
    renderScoutCard();
  });

  $("#operator-player").addEventListener("change", (e) => {
    state.operatorPlayerId = e.target.value;
    renderOperator();
  });

  $("#btn-print").addEventListener("click", () => window.print());
  $("#btn-reset").addEventListener("click", resetFilters);
}

function resetFilters() {
  state.playerId = "all"; state.agent = "all"; state.ability = "all";
  state.side = "all"; state.buckets = new Set(BUCKETS);
  state.heatMode = "gradient";
  $("#filter-player").value = "all";
  $("#filter-agent").value = "all";
  $("#filter-ability").value = "all";
  $("#filter-side").value = "all";
  $$(".bucket-toggle").forEach((b) => {
    b.classList.add("active");
    b.setAttribute("aria-pressed", "true");
  });
  $("#heat-gradient").checked = true;
  renderAll();
}

function syncOperatorPlayer() {
  const ops = (state.datasets.operators || []).filter((o) => o.team_id === state.teamId);
  if (ops.length && !ops.some((o) => o.player_id === state.operatorPlayerId)) {
    state.operatorPlayerId = ops[0].player_id;
  }
}

/* ------------------------------------------------------------------ */
/* Coverage header                                                     */
/* ------------------------------------------------------------------ */

function renderCoverage() {
  const m = state.datasets.meta;
  $("#cov-series").textContent = fmtNum(m.series_count);
  $("#cov-games").textContent = fmtNum(m.games_count);
  $("#cov-rounds").textContent = fmtNum(m.rounds_count);
  $("#cov-events").textContent = fmtNum(m.events_processed);
  $("#meta-generated").textContent = "Aggregates: " + fmtDate(m.generated_at);
}

/* ------------------------------------------------------------------ */
/* Heatmap                                                             */
/* ------------------------------------------------------------------ */

function filteredPoints() {
  return state.datasets.heatmaps.filter((p) =>
    p.map === state.map
    && p.team_id === state.teamId
    && (state.playerId === "all" || p.player_id === state.playerId)
    && (state.agent === "all" || p.agent === state.agent)
    && (state.ability === "all" || p.ability === state.ability)
    && (state.side === "all" || p.side === state.side)
    && state.buckets.has(p.round_time_bucket));
}

/** Bin points into a 20x20 grid; returns [{cx, cy, n}] for non-empty cells. */
function binPoints(points, cellSize) {
  // The grid spans 0-1000, so the last valid bin index is
  // (1000 / cellSize) - 1: a point at exactly 1000 belongs in the last
  // cell, not in a phantom cell centred at 1025, off the map.
  const lastBin = Math.floor(1000 / cellSize) - 1;
  const bins = new Map();
  for (const p of points) {
    const bx = Math.min(lastBin, Math.max(0, Math.floor(p.x / cellSize)));
    const by = Math.min(lastBin, Math.max(0, Math.floor(p.y / cellSize)));
    const key = bx + "," + by;
    bins.set(key, (bins.get(key) || 0) + 1);
  }
  return Array.from(bins.entries()).map(([key, n]) => {
    const [bx, by] = key.split(",").map(Number);
    return { cx: bx * cellSize + cellSize / 2, cy: by * cellSize + cellSize / 2, n };
  });
}

function renderHeatmap() {
  const svg = $("#heatmap-svg");
  const points = filteredPoints();
  const empty = $("#heatmap-empty");
  empty.hidden = points.length > 0;

  let markup = renderMapBase(state.map, "hm");

  if (points.length) {
    const CELL = 50; // 20x20 grid over 0-1000
    const bins = binPoints(points, CELL);
    const maxN = Math.max.apply(null, bins.map((b) => b.n));
    if (state.heatMode === "gradient") {
      // Radial-gradient blobs (soft falloff) + staggered entrance.
      // Radius is slightly larger than before because the gradient fades
      // to transparent at the edge; intensity encoding (t, alpha) is
      // unchanged, as are the low/mid/high thresholds.
      bins.forEach((b, i) => {
        const t = b.n / maxN; // 0..1 intensity
        const r = 30 + t * 54;
        const alpha = 0.18 + t * 0.62;
        const tier = t > 0.66 ? "high" : t > 0.33 ? "mid" : "low";
        const delay = Math.min(i * 14, 500);
        markup += `<circle cx="${b.cx}" cy="${b.cy}" r="${r}" fill="url(#hm-heat-${tier})" fill-opacity="${alpha.toFixed(2)}" class="heat-blob" style="animation-delay:${delay}ms" />`;
      });
    } else {
      // Hard numbers: cell counts as labels
      bins.forEach((b, i) => {
        const t = b.n / maxN;
        const alpha = 0.15 + t * 0.55;
        const delay = Math.min(i * 14, 500);
        markup += `<rect x="${b.cx - CELL / 2}" y="${b.cy - CELL / 2}" width="${CELL}" height="${CELL}" fill="#35c4ff" fill-opacity="${alpha.toFixed(2)}" class="heat-cell" style="animation-delay:${delay}ms" />`;
        markup += `<text x="${b.cx}" y="${b.cy + 5}" class="heat-count" text-anchor="middle" style="animation-delay:${delay}ms">${b.n}</text>`;
      });
    }
    // Individual cast dots (subtle, always on top)
    for (const p of points) {
      markup += `<circle cx="${p.x}" cy="${p.y}" r="3.5" class="cast-dot" />`;
    }
  }

  // Landing zones (estimates — always labelled as such). On-map text
  // labels are capped at the top 4 by confidence and skipped when their
  // box would overlap an already-placed label, so ESTIMATE labels never
  // pile into unreadable stacks. Every zone still renders its circle +
  // dashed line, and a <title> tooltip carries the ability + ESTIMATE
  // confidence on hover.
  $("#legend-lz").hidden = !state.showLanding;
  if (state.showLanding) {
    const zones = (state.datasets["landing-zones"] || []).filter((z) =>
      z.map === state.map && z.team_id === state.teamId);
    const MAX_LABELS = 4;
    const HALF_W = 88, TOP = 22, BOTTOM = 20; // label box around est point
    const placed = [];
    const labeled = new Set();
    const byConfidence = zones.slice().sort((a, b) => b.confidence - a.confidence);
    for (const z of byConfidence) {
      if (labeled.size >= MAX_LABELS) break;
      const labelY = Math.max(22, z.est_y - 42);
      const box = {
        x0: z.est_x - HALF_W, x1: z.est_x + HALF_W,
        y0: labelY - TOP, y1: z.est_y + BOTTOM,
      };
      const collides = placed.some((p) =>
        box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0);
      if (!collides) { placed.push(box); labeled.add(z); }
    }
    for (const z of zones) {
      const labelY = Math.max(22, z.est_y - 42);
      markup += `<g class="lz"><title>${esc(z.ability)} — ESTIMATE ${pct(z.confidence)} (estimate, not a measured position)</title>`;
      markup += `<line x1="${z.cast_x}" y1="${z.cast_y}" x2="${z.est_x}" y2="${z.est_y}" class="lz-line" />`;
      markup += `<circle cx="${z.cast_x}" cy="${z.cast_y}" r="7" class="lz-cast" />`;
      markup += `<circle cx="${z.est_x}" cy="${z.est_y}" r="34" class="lz-zone" />`;
      if (labeled.has(z)) {
        markup += `<text x="${z.est_x}" y="${labelY}" class="lz-label" text-anchor="middle">ESTIMATE ${pct(z.confidence)}</text>`;
        markup += `<text x="${z.est_x}" y="${z.est_y + 4}" class="lz-label-sub" text-anchor="middle">${esc(z.ability)}</text>`;
      }
      markup += `</g>`;
    }
  }

  svg.innerHTML = markup;

  // Evidence line
  const totalForMap = state.datasets.heatmaps.filter((p) =>
    p.map === state.map && p.team_id === state.teamId).length;
  $("#heatmap-evidence").innerHTML = points.length
    ? `<strong>n = ${fmtNum(points.length)}</strong> cast points shown out of ${fmtNum(totalForMap)} points for ${esc(teamName(state.teamId))} on ${esc(state.map)} (active filters).`
    : `No cast points for these filters — loosen the filters or pick another map/team.`;

  // Top-ability breakdown (evidence table)
  renderTopAbilities(points);
}

function renderTopAbilities(points) {
  const counts = new Map();
  for (const p of points) {
    const k = p.agent + " — " + p.ability;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const rows = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const el = $("#top-abilities");
  if (!rows.length) {
    el.innerHTML = `<p class="muted">No data for these filters.</p>`;
    return;
  }
  const total = points.length;
  el.innerHTML = rows.map(([label, n], i) =>
    `<div class="stat-row"><span class="stat-rank">${i + 1}</span><span>${esc(label)}</span>`
    + `<span class="stat-bar"><i style="width:${Math.round((n / total) * 100)}%"></i></span>`
    + `<span class="stat-n">n=${n} · ${pct(n / total)}</span></div>`).join("");
}

/* ------------------------------------------------------------------ */
/* Operator Profiler                                                   */
/* ------------------------------------------------------------------ */

/**
 * Deterministic declutter for setup markers: when two setups are closer
 * than MIN_SEP, the later one is nudged out along a golden-angle spiral
 * from its true position (same input always yields the same layout).
 * Returns positions with display coords (dx, dy) alongside the true (x, y).
 */
function spreadSetups(positions) {
  const MIN_SEP = 42;
  const placed = [];
  for (const s of positions) {
    let x = s.x, y = s.y;
    let angle = 0.7, radius = MIN_SEP;
    let tries = 0;
    // Clamp each candidate BEFORE testing it, so the final position
    // always honours MIN_SEP (clamping after the loop could re-collide).
    const clamp = (v) => Math.min(975, Math.max(25, v));
    const collides = () => placed.some((p) => Math.hypot(x - p.dx, y - p.dy) < MIN_SEP);
    while (collides() && tries < 24) {
      angle += 2.39996; // golden angle — spreads neighbours evenly
      radius += 7;
      x = clamp(s.x + Math.cos(angle) * radius);
      y = clamp(s.y + Math.sin(angle) * radius);
      tries++;
    }
    placed.push({ ...s, dx: clamp(x), dy: clamp(y) });
  }
  return placed;
}

function renderOperator() {
  const ops = state.datasets.operators || [];
  const sel = $("#operator-player");
  const teamOps = ops.filter((o) => o.team_id === state.teamId);
  sel.innerHTML = teamOps.length
    ? teamOps.map((o) => `<option value="${esc(o.player_id)}">${esc(o.player_name)}</option>`).join("")
    : `<option value="">— no Operator profile —</option>`;
  if (teamOps.length && !teamOps.some((o) => o.player_id === state.operatorPlayerId)) {
    state.operatorPlayerId = teamOps[0].player_id;
  }
  sel.value = state.operatorPlayerId;

  const prof = ops.find((o) => o.player_id === state.operatorPlayerId);
  const empty = $("#operator-empty");
  const body = $("#operator-body");
  if (!prof || !prof.maps[state.map]) {
    empty.hidden = false;
    body.hidden = true;
    empty.textContent = prof
      ? `${prof.player_name} has no Operator profile on ${state.map} (n=0).`
      : `No Operator profile for ${teamName(state.teamId)} in this dataset.`;
    return;
  }
  empty.hidden = true;
  body.hidden = false;
  const m = prof.maps[state.map];

  // Setup map (defense setups + attack setups). Near-identical
  // positions are spread out so each marker is visible; a dashed leader
  // line + small dot mark the true position of any displaced marker.
  let markup = renderMapBase(state.map, "op");
  for (const s of spreadSetups(m.setup_positions)) {
    const displaced = Math.hypot(s.dx - s.x, s.dy - s.y) > 1;
    if (displaced) {
      markup += `<line x1="${s.x}" y1="${s.y}" x2="${s.dx}" y2="${s.dy}" class="op-spread-line" />`;
      markup += `<circle cx="${s.x}" cy="${s.y}" r="4" class="op-true-dot" />`;
    }
    markup += `<g class="op-setup op-setup--${s.side}">`
      + `<circle cx="${s.dx}" cy="${s.dy}" r="16" />`
      + `<text x="${s.dx}" y="${s.dy + 4}" text-anchor="middle">OP</text></g>`;
  }
  $("#operator-svg").innerHTML = markup;

  // Summary stats
  const kpr = m.rounds_with_operator ? (m.operator_kills / m.rounds_with_operator) : 0;
  $("#op-stats").innerHTML =
    `<div class="kpi"><span class="kpi-num">${fmtNum(m.rounds_with_operator)}</span><span class="kpi-label">rounds with Operator</span></div>`
    + `<div class="kpi"><span class="kpi-num">${fmtNum(m.operator_kills)}</span><span class="kpi-label">Operator kills</span></div>`
    + `<div class="kpi"><span class="kpi-num">${kpr.toFixed(2)}</span><span class="kpi-label">kills / OP round</span></div>`
    + `<div class="kpi"><span class="kpi-num">${m.setup_positions.length}</span><span class="kpi-label">unique setup positions</span></div>`;

  // Buy-rate bar chart (rounds 1-24)
  const rates = m.buy_rate_by_round || {};
  const bars = Object.keys(rates).sort((a, b) => Number(a) - Number(b)).map((r) => {
    const v = rates[r];
    return `<div class="bar-col" title="Round ${r}: ${pct(v)} buy-rate">`
      + `<div class="bar" style="height:${Math.round(v * 100)}%"></div>`
      + `<span class="bar-x">${r}</span></div>`;
  }).join("");
  $("#op-buychart").innerHTML = bars;
  $("#op-buychart-note").textContent =
    `Operator buy-rate by round number — ${prof.player_name}, ${state.map} (n=${m.rounds_with_operator} rounds with Operator).`;

  // Handoff: Operator ownership across teammates
  const mates = teamOps.filter((o) => o.player_id !== prof.player_id);
  const handoffEl = $("#op-handoff");
  if (!mates.length) {
    handoffEl.innerHTML = `<p class="muted">${esc(prof.player_name)} is the only Operator holder for ${esc(teamName(state.teamId))} in this dataset.</p>`;
  } else {
    handoffEl.innerHTML = mates.map((o) => {
      const om = o.maps[state.map];
      const rounds = om ? om.rounds_with_operator : 0;
      return `<div class="stat-row"><span>${esc(o.player_name)}</span>`
        + `<span class="stat-n">${fmtNum(rounds)} OP rounds · ${om ? fmtNum(om.operator_kills) : 0} kills</span></div>`;
    }).join("");
  }
}

/* ------------------------------------------------------------------ */
/* Anti-Strat Cards + Self-Scout                                       */
/* ------------------------------------------------------------------ */

function renderAntiStrat() {
  const list = $("#anti-strat-list");
  const title = $("#anti-strat-title");
  const note = $("#anti-strat-note");

  let cards;
  if (state.selfScout) {
    title.textContent = "Self-Scout — C9's Most Readable Tendencies";
    const c9 = c9TeamIds();
    cards = (state.datasets["self-scout"] || []).filter((c) =>
      c9.has(c.team_id) && c.map === state.map);
    note.textContent = "Self-scout mode: the same analysis applied to Cloud9 itself. "
      + "The cards below are C9's most readable patterns — with variation suggestions.";
  } else {
    title.textContent = `Anti-Strat — vs ${teamName(state.teamId)} · ${state.map}`;
    cards = (state.datasets["anti-strat"] || []).filter((c) =>
      c.team_id === state.teamId && c.map === state.map);
    note.textContent = "Rule-based responses from aggregate data (not LLM). "
      + "Every card shows its tendency's sample size and frequency.";
  }

  if (!cards.length) {
    list.innerHTML = `<div class="empty-card">No ${state.selfScout ? "self-scout" : "anti-strat"} cards `
      + `for ${state.selfScout ? "Cloud9" : esc(teamName(state.teamId))} on ${esc(state.map)} yet. `
      + `Try another map.</div>`;
    return;
  }
  list.innerHTML = cards.map((c) => `
    <article class="strat-card">
      <div class="strat-card-head">
        <h3>${esc(c.tendency)}</h3>
        <span class="freq-badge">${pct(c.frequency)}</span>
      </div>
      <p class="strat-evidence">n = ${fmtNum(c.n)} rounds · frequency ${pct(c.frequency)} · ${esc(c.map)}</p>
      <p class="strat-response"><span class="resp-label">${state.selfScout ? "VARIATION TIP" : "RESPONSE"}</span> ${esc(c.response)}</p>
    </article>`).join("");
}

/* ------------------------------------------------------------------ */
/* Scout Card (print-friendly export)                                  */
/* ------------------------------------------------------------------ */

/** Top 3 insights for the current opponent+map, each with evidence. */
function topInsights() {
  const insights = [];
  const cards = (state.datasets["anti-strat"] || []).filter((c) =>
    c.team_id === state.teamId && c.map === state.map);
  for (const c of cards.slice(0, 3)) {
    insights.push({ text: c.tendency + " — " + c.response, n: c.n, freq: c.frequency });
  }
  // Fill from operator profile if fewer than 3 cards
  if (insights.length < 3) {
    const ops = (state.datasets.operators || []).filter((o) => o.team_id === state.teamId);
    for (const o of ops) {
      const m = o.maps[state.map];
      if (!m) continue;
      insights.push({
        text: `${o.player_name} carried the Operator for ${m.rounds_with_operator} rounds `
          + `(${m.operator_kills} kills) — defense setups concentrated in ${m.setup_positions.length} positions.`,
        n: m.rounds_with_operator, freq: null,
      });
      if (insights.length >= 3) break;
    }
  }
  return insights.slice(0, 3);
}

function renderScoutCard() {
  const insights = topInsights();
  const el = $("#scout-insights");
  if (!insights.length) {
    el.innerHTML = `<li class="muted">No insights for ${esc(teamName(state.teamId))} on ${esc(state.map)} yet — pick another opponent/map.</li>`;
  } else {
    el.innerHTML = insights.map((ins, i) =>
      `<li><span class="insight-num">${i + 1}</span><span>${esc(ins.text)} `
      + `<em class="evidence">n=${fmtNum(ins.n)}${ins.freq !== null ? " · " + pct(ins.freq) : ""}</em></span></li>`).join("");
  }
  $("#scout-title").textContent =
    `SCOUT CARD — vs ${teamName(state.teamId)} · ${state.map}`;
  const m = state.datasets.meta;
  $("#scout-meta").textContent =
    `Source: ${m.series_count} series · ${m.games_count} games · ${m.rounds_count} rounds of GRID data `
    + `· aggregates ${m.generated_at ? fmtDate(m.generated_at) : ""} · SIGHTLINE / Cloud9 x JetBrains Hackathon 2026`;
}

/* ------------------------------------------------------------------ */
/* Render all                                                          */
/* ------------------------------------------------------------------ */

function renderAll() {
  renderCoverage();
  renderHeatmap();
  renderOperator();
  renderAntiStrat();
  renderScoutCard();
  $("#current-context").textContent =
    `${teamName(state.teamId)} · ${state.map}`;
}
