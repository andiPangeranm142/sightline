/**
 * SIGHTLINE — jsdom end-to-end smoke test (rebuilt 24 Nov 2026).
 * Serves docs/ over a local HTTP server, loads the page in jsdom with
 * real aggregates, and runs 30 assertions mirroring docs/TESTING.md §5.
 *
 * Usage: npm install   (once, in docs/tests/ — installs jsdom)
 *        node smoke.js [port]   (default port 8901)
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const DOCS = path.resolve(__dirname, "..");
const PORT = Number(process.argv[2] || 8901);

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
      const file = path.join(DOCS, urlPath === "/" ? "index.html" : urlPath);
      if (!file.startsWith(DOCS)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); return res.end("not found"); }
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
        res.end(buf);
      });
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const server = await serve();
  const jsErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => jsErrors.push(e));

  let passed = 0, failed = 0;
  const check = (name, cond, extra = "") => {
    if (cond) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
  };

  const dom = await JSDOM.fromURL(`http://127.0.0.1:${PORT}/`, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      // jsdom has no fetch; give the page Node's fetch for data loading.
      // Node fetch cannot resolve relative URLs, so resolve them against
      // the document URL first (the app fetches "data/*.json").
      window.fetch = (input, init) => {
        const url = typeof input === "string"
          ? new URL(input, window.location.href).href
          : input;
        return fetch(url, init);
      };
    },
  });
  const { window } = dom;
  const { document } = window;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // Wait for the app to finish loading (max 20 s).
  const deadline = Date.now() + 20000;
  while ($("#app-main").hidden && Date.now() < deadline) await sleep(200);
  await sleep(300); // let any trailing renders settle
  if ($("#app-main").hidden) {
    console.log("  DIAG app did not initialize; error-state hidden =",
      $("#error-state").hidden, "; error-message =",
      JSON.stringify($("#error-message").textContent));
  }

  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));

  // ---- 1-3: boot state -------------------------------------------------
  check("1. app loads with 0 JS errors", jsErrors.length === 0,
    jsErrors.map((e) => String(e && e.message || e)).join(" | "));
  check("2. error state hidden", $("#error-state").hidden === true);
  check("3. main visible", $("#app-main").hidden === false);

  // ---- 4-7: coverage header + badge ------------------------------------
  check("4. coverage: 337 series", $("#cov-series").textContent.trim() === "337",
    `got "${$("#cov-series").textContent.trim()}"`);
  check("5. coverage: 848 games", $("#cov-games").textContent.trim() === "848",
    `got "${$("#cov-games").textContent.trim()}"`);
  check("6. coverage: 17,435 rounds", $("#cov-rounds").textContent.trim() === "17,435",
    `got "${$("#cov-rounds").textContent.trim()}"`);
  check("7. badge DATA: LIVE", $("#data-source-badge").textContent.includes("DATA: LIVE"),
    `got "${$("#data-source-badge").textContent.trim()}"`);

  // ---- 8-11: filters ----------------------------------------------------
  check("8. team filter: 72 teams", $("#filter-team").options.length === 72,
    `got ${$("#filter-team").options.length}`);
  check("9. default team Sentinels (1079)", $("#filter-team").value === "1079",
    `got "${$("#filter-team").value}"`);
  check("10. map filter: 13 maps", $("#filter-map").options.length === 13,
    `got ${$("#filter-map").options.length}`);
  check("11. default map Ascent", $("#filter-map").value === "Ascent",
    `got "${$("#filter-map").value}"`);

  // ---- 12-15: heatmap (Sentinels / Ascent) ------------------------------
  const blobs = $$(".heat-blob", $("#heatmap-svg"));
  check("12. heatmap renders 33 blobs (Sentinels/Ascent)", blobs.length === 33,
    `got ${blobs.length}`);
  check("13. evidence line shows n = 44 cast points",
    $("#heatmap-evidence").textContent.includes("n = 44"),
    `got "${$("#heatmap-evidence").textContent.trim().slice(0, 80)}"`);
  check("14. top abilities listed", $("#top-abilities").children.length > 0,
    `got ${$("#top-abilities").children.length}`);
  check("15. map name label ASCENT",
    $(".map-name-label", $("#heatmap-svg")).textContent === "ASCENT",
    `got "${$(".map-name-label", $("#heatmap-svg")).textContent}"`);

  // ---- 16-18: operator profiler -----------------------------------------
  check("16. operator body visible", $("#operator-body").hidden !== true &&
    $("#operator-empty").hidden === true);
  check("17. operator profiler: 4 KPIs", $$(".kpi", $("#op-stats")).length === 4,
    `got ${$$(".kpi", $("#op-stats")).length}`);
  check("18. operator buy-rate bars present", $("#op-buychart").children.length > 0,
    `got ${$("#op-buychart").children.length}`);

  // ---- 19-20: anti-strat + scout card -----------------------------------
  check("19. anti-strat: 5 cards (Sentinels/Ascent)",
    $$(".strat-card", $("#anti-strat-list")).length === 5,
    `got ${$$(".strat-card", $("#anti-strat-list")).length}`);
  check("20. scout card insights rendered", $("#scout-insights").children.length > 0,
    `got ${$("#scout-insights").children.length}`);

  // ---- 21-22: self-scout toggle -----------------------------------------
  $("#toggle-selfscout").checked = true;
  fire($("#toggle-selfscout"), "change");
  await sleep(100);
  check("21. self-scout toggle: title switches",
    $("#anti-strat-title").textContent.startsWith("Self-Scout"),
    `got "${$("#anti-strat-title").textContent}"`);
  check("22. self-scout: 10 cards (C9/Ascent)",
    $$(".strat-card", $("#anti-strat-list")).length === 10,
    `got ${$$(".strat-card", $("#anti-strat-list")).length}`);
  $("#toggle-selfscout").checked = false;
  fire($("#toggle-selfscout"), "change");
  await sleep(100);

  // ---- 23-24: map switch to Haven ---------------------------------------
  $("#filter-map").value = "Haven";
  fire($("#filter-map"), "change");
  await sleep(100);
  check("23. map switch to Haven: label HAVEN",
    $(".map-name-label", $("#heatmap-svg")).textContent === "HAVEN",
    `got "${$(".map-name-label", $("#heatmap-svg")).textContent}"`);
  check("24. map switch to Haven: heatmap re-renders",
    $$(".heat-blob", $("#heatmap-svg")).length > 0,
    `got ${$$(".heat-blob", $("#heatmap-svg")).length}`);

  // ---- 25-26: map switch to Summit --------------------------------------
  $("#filter-map").value = "Summit";
  fire($("#filter-map"), "change");
  await sleep(100);
  check("25. map switch to Summit: label SUMMIT",
    $(".map-name-label", $("#heatmap-svg")).textContent === "SUMMIT",
    `got "${$(".map-name-label", $("#heatmap-svg")).textContent}"`);
  check("26. Summit: 7 zones", $$(".map-zone", $("#heatmap-svg")).length === 7,
    `got ${$$(".map-zone", $("#heatmap-svg")).length}`);

  // ---- 27: numbers mode (back on Ascent — Summit has 0 points) ---------
  $("#filter-map").value = "Ascent";
  fire($("#filter-map"), "change");
  await sleep(100);
  $("#heat-numbers").checked = true;
  fire($("#heat-numbers"), "change");
  await sleep(100);
  check("27. numbers mode renders cells",
    $$(".heat-cell", $("#heatmap-svg")).length > 0,
    `got ${$$(".heat-cell", $("#heatmap-svg")).length}`);

  // ---- 28: team switch to Cloud9 ----------------------------------------
  $("#filter-team").value = "79";
  fire($("#filter-team"), "change");
  await sleep(100);
  check("28. team switch to Cloud9 updates context chip",
    $("#current-context").textContent.includes("Cloud9"),
    `got "${$("#current-context").textContent}"`);

  // ---- 29-30: final ------------------------------------------------------
  check("29. 0 JS errors after all interactions", jsErrors.length === 0,
    jsErrors.map((e) => String(e && e.message || e)).join(" | "));
  check("30. coverage: 1,421,082 events", $("#cov-events").textContent.trim() === "1,421,082",
    `got "${$("#cov-events").textContent.trim()}"`);

  console.log(`\nResult: ${passed}/30 passed, ${failed} failed`);
  window.close();
  server.close();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error("smoke test crashed:", e); process.exit(2); });
