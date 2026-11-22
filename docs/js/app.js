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
  // filters
  teamId: "sen",
  map: "Ascent",
  playerId: "all",
  agent: "all",
  ability: "all",
  side: "all",
  buckets: new Set(["0-20s", "20-40s", "40-60s", "60s+"]),
  heatMode: "gradient", // "gradient" | "numbers"
  showLanding: true,
  selfScout: false,
  operatorPlayerId: "sen-1",
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
      throw new Error("Data inti (meta / heatmaps) tidak dapat dimuat.");
    }
    if (errors.length) renderDataErrors(errors);
    buildFilterOptions();
    wireEvents();
    renderAll();
    showLoading(false);
    renderSourceBadge();
  } catch (e) {
    showLoading(false);
    renderFatalError(e.message);
  }
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
  el.innerHTML = "<strong>Sebagian data gagal dimuat:</strong> "
    + errors.map((e) => esc(e.file) + ".json").join(", ")
    + " — panel terkait menampilkan keadaan kosong.";
}

function renderSourceBadge() {
  const anyMock = Object.values(state.sources).includes("mock");
  const badge = $("#data-source-badge");
  if (anyMock) {
    badge.textContent = "DATA: MOCK (agregat pipeline belum tersedia)";
    badge.classList.add("badge--mock");
  } else {
    badge.textContent = "DATA: LIVE — agregat GRID";
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
  sel.innerHTML = `<option value="all">Semua pemain</option>` + players.map((p) =>
    `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  if (!players.some((p) => p.id === state.playerId)) state.playerId = "all";
  sel.value = state.playerId;
}

function rebuildAbilityOptions() {
  const pts = state.datasets.heatmaps;
  const agents = [...new Set(pts.map((p) => p.agent))].sort();
  const abilities = [...new Set(pts.map((p) => p.ability))].sort();
  const agentSel = $("#filter-agent");
  agentSel.innerHTML = `<option value="all">Semua agent</option>` + agents.map((a) =>
    `<option value="${esc(a)}">${esc(a)}</option>`).join("");
  agentSel.value = state.agent;
  const abSel = $("#filter-ability");
  abSel.innerHTML = `<option value="all">Semua ability</option>` + abilities.map((a) =>
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
  $$(".bucket-toggle").forEach((b) => b.classList.add("active"));
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
  $("#meta-generated").textContent = "Agregat: " + (m.generated_at || "—");
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
  const bins = new Map();
  for (const p of points) {
    const bx = Math.min(999, Math.max(0, Math.floor(p.x / cellSize)));
    const by = Math.min(999, Math.max(0, Math.floor(p.y / cellSize)));
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

  let markup = renderMapBase(state.map);

  if (points.length) {
    const CELL = 50; // 20x20 grid over 0-1000
    const bins = binPoints(points, CELL);
    const maxN = Math.max.apply(null, bins.map((b) => b.n));
    if (state.heatMode === "gradient") {
      for (const b of bins) {
        const t = b.n / maxN; // 0..1 intensity
        const r = 26 + t * 46;
        const alpha = 0.18 + t * 0.62;
        const color = t > 0.66 ? "#ff4d4d" : t > 0.33 ? "#ff9f2e" : "#35c4ff";
        markup += `<circle cx="${b.cx}" cy="${b.cy}" r="${r}" fill="${color}" fill-opacity="${alpha.toFixed(2)}" class="heat-blob" />`;
      }
    } else {
      // Hard numbers: cell counts as labels
      for (const b of bins) {
        const t = b.n / maxN;
        const alpha = 0.15 + t * 0.55;
        markup += `<rect x="${b.cx - CELL / 2}" y="${b.cy - CELL / 2}" width="${CELL}" height="${CELL}" fill="#35c4ff" fill-opacity="${alpha.toFixed(2)}" class="heat-cell" />`;
        markup += `<text x="${b.cx}" y="${b.cy + 5}" class="heat-count" text-anchor="middle">${b.n}</text>`;
      }
    }
    // Individual cast dots (subtle, always on top)
    for (const p of points) {
      markup += `<circle cx="${p.x}" cy="${p.y}" r="3.5" class="cast-dot" />`;
    }
  }

  // Landing zones (estimates — always labelled as such)
  if (state.showLanding) {
    const zones = (state.datasets["landing-zones"] || []).filter((z) =>
      z.map === state.map && z.team_id === state.teamId);
    for (const z of zones) {
      markup += `<line x1="${z.cast_x}" y1="${z.cast_y}" x2="${z.est_x}" y2="${z.est_y}" class="lz-line" />`;
      markup += `<circle cx="${z.cast_x}" cy="${z.cast_y}" r="7" class="lz-cast" />`;
      markup += `<circle cx="${z.est_x}" cy="${z.est_y}" r="34" class="lz-zone" />`;
      markup += `<text x="${z.est_x}" y="${z.est_y - 42}" class="lz-label" text-anchor="middle">ESTIMASI ${pct(z.confidence)}</text>`;
      markup += `<text x="${z.est_x}" y="${z.est_y + 4}" class="lz-label-sub" text-anchor="middle">${esc(z.ability)}</text>`;
    }
  }

  svg.innerHTML = markup;

  // Evidence line
  const totalForMap = state.datasets.heatmaps.filter((p) =>
    p.map === state.map && p.team_id === state.teamId).length;
  $("#heatmap-evidence").innerHTML = points.length
    ? `<strong>n = ${fmtNum(points.length)}</strong> titik cast ditampilkan dari ${fmtNum(totalForMap)} titik ${esc(teamName(state.teamId))} di ${esc(state.map)} (filter aktif).`
    : `Tidak ada titik cast untuk filter ini — longgarkan filter atau pilih map/tim lain.`;

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
    el.innerHTML = `<p class="muted">Tidak ada data untuk filter ini.</p>`;
    return;
  }
  const total = points.length;
  el.innerHTML = rows.map(([label, n]) =>
    `<div class="stat-row"><span>${esc(label)}</span>`
    + `<span class="stat-bar"><i style="width:${Math.round((n / total) * 100)}%"></i></span>`
    + `<span class="stat-n">n=${n} · ${pct(n / total)}</span></div>`).join("");
}

/* ------------------------------------------------------------------ */
/* Operator Profiler                                                   */
/* ------------------------------------------------------------------ */

function renderOperator() {
  const ops = state.datasets.operators || [];
  const sel = $("#operator-player");
  const teamOps = ops.filter((o) => o.team_id === state.teamId);
  sel.innerHTML = teamOps.length
    ? teamOps.map((o) => `<option value="${esc(o.player_id)}">${esc(o.player_name)}</option>`).join("")
    : `<option value="">— tidak ada profil Operator —</option>`;
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
      ? `${prof.player_name} belum punya profil Operator di ${state.map} (n=0).`
      : `Tidak ada profil Operator untuk ${teamName(state.teamId)} di dataset ini.`;
    return;
  }
  empty.hidden = true;
  body.hidden = false;
  const m = prof.maps[state.map];

  // Setup map (defense setups + attack setups)
  let markup = renderMapBase(state.map);
  for (const s of m.setup_positions) {
    markup += `<g class="op-setup op-setup--${s.side}">`
      + `<circle cx="${s.x}" cy="${s.y}" r="16" />`
      + `<text x="${s.x}" y="${s.y + 4}" text-anchor="middle">OP</text></g>`;
  }
  $("#operator-svg").innerHTML = markup;

  // Summary stats
  const kpr = m.rounds_with_operator ? (m.operator_kills / m.rounds_with_operator) : 0;
  $("#op-stats").innerHTML =
    `<div class="kpi"><span class="kpi-num">${fmtNum(m.rounds_with_operator)}</span><span class="kpi-label">round dengan Operator</span></div>`
    + `<div class="kpi"><span class="kpi-num">${fmtNum(m.operator_kills)}</span><span class="kpi-label">kill Operator</span></div>`
    + `<div class="kpi"><span class="kpi-num">${kpr.toFixed(2)}</span><span class="kpi-label">kill / round OP</span></div>`
    + `<div class="kpi"><span class="kpi-num">${m.setup_positions.length}</span><span class="kpi-label">posisi setup unik</span></div>`;

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
    `Buy-rate Operator per nomor round — ${prof.player_name}, ${state.map} (n=${m.rounds_with_operator} round dengan Operator).`;

  // Handoff: Operator ownership across teammates
  const mates = teamOps.filter((o) => o.player_id !== prof.player_id);
  const handoffEl = $("#op-handoff");
  if (!mates.length) {
    handoffEl.innerHTML = `<p class="muted">${prof.player_name} satu-satunya pemegang Operator ${teamName(state.teamId)} di dataset ini.</p>`;
  } else {
    handoffEl.innerHTML = mates.map((o) => {
      const om = o.maps[state.map];
      const rounds = om ? om.rounds_with_operator : 0;
      return `<div class="stat-row"><span>${esc(o.player_name)}</span>`
        + `<span class="stat-n">${fmtNum(rounds)} round OP · ${om ? fmtNum(om.operator_kills) : 0} kill</span></div>`;
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
    title.textContent = "Self-Scout — Kecenderungan C9 yang Paling Mudah Ditebak";
    cards = (state.datasets["self-scout"] || []).filter((c) =>
      c.team_id === "c9" && c.map === state.map);
    note.textContent = "Mode self-scout: analisis yang sama diterapkan ke Cloud9 sendiri. "
      + "Kartu di bawah adalah pola C9 yang paling mudah dibaca lawan — beserta saran variasi.";
  } else {
    title.textContent = `Anti-Strat — vs ${teamName(state.teamId)} · ${state.map}`;
    cards = (state.datasets["anti-strat"] || []).filter((c) =>
      c.team_id === state.teamId && c.map === state.map);
    note.textContent = "Respons berbasis aturan dari data agregat (bukan LLM). "
      + "Setiap kartu menunjukkan sample size dan frekuensi kecenderungannya.";
  }

  if (!cards.length) {
    list.innerHTML = `<div class="empty-card">Belum ada kartu ${state.selfScout ? "self-scout" : "anti-strat"} `
      + `untuk ${state.selfScout ? "Cloud9" : teamName(state.teamId)} di ${esc(state.map)}. `
      + `Coba map lain.</div>`;
    return;
  }
  list.innerHTML = cards.map((c) => `
    <article class="strat-card">
      <div class="strat-card-head">
        <h3>${esc(c.tendency)}</h3>
        <span class="freq-badge">${pct(c.frequency)}</span>
      </div>
      <p class="strat-evidence">n = ${fmtNum(c.n)} round · frekuensi ${pct(c.frequency)} · ${esc(c.map)}</p>
      <p class="strat-response"><span class="resp-label">${state.selfScout ? "SARAN VARIASI" : "RESPONS"}</span> ${esc(c.response)}</p>
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
        text: `${o.player_name} membawa Operator di ${m.rounds_with_operator} round `
          + `(${m.operator_kills} kill) — setup defense terkonsentrasi di ${m.setup_positions.length} posisi.`,
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
    el.innerHTML = `<li class="muted">Belum ada insight untuk ${teamName(state.teamId)} di ${state.map} — pilih lawan/map lain.</li>`;
  } else {
    el.innerHTML = insights.map((ins, i) =>
      `<li><span class="insight-num">${i + 1}</span><span>${esc(ins.text)} `
      + `<em class="evidence">n=${fmtNum(ins.n)}${ins.freq !== null ? " · " + pct(ins.freq) : ""}</em></span></li>`).join("");
  }
  $("#scout-title").textContent =
    `SCOUT CARD — vs ${teamName(state.teamId)} · ${state.map}`;
  const m = state.datasets.meta;
  $("#scout-meta").textContent =
    `Sumber: ${m.series_count} series · ${m.games_count} game · ${m.rounds_count} round GRID `
    + `· agregat ${m.generated_at || ""} · SIGHTLINE / Cloud9 x JetBrains Hackathon 2026`;
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
