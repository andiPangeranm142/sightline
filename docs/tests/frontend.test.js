"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const docs = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(docs, "js/app.js"), "utf8");
const maps = fs.readFileSync(path.join(docs, "js/maps.js"), "utf8");

function element() {
  const classes = new Set();
  return {
    hidden: false, value: "", checked: false, innerHTML: "", textContent: "",
    dataset: {}, attributes: {}, listeners: {},
    classList: {
      add: (name) => classes.add(name),
      toggle: (name, on) => on ? classes.add(name) : classes.delete(name),
      contains: (name) => classes.has(name),
    },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener(name, callback) { this.listeners[name] = callback; },
  };
}

function setup() {
  const elements = new Map();
  const buckets = ["0-20s", "20-40s", "40-60s", "60s+"].map((bucket) => {
    const btn = element();
    btn.dataset.bucket = bucket;
    btn.classList.add("active");
    return btn;
  });
  const document = {
    body: element(),
    addEventListener() {},
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, element());
      return elements.get(selector);
    },
    querySelectorAll(selector) { return selector === ".bucket-toggle" ? buckets : []; },
  };
  const context = vm.createContext({ document, window: { print() {} }, console });
  vm.runInContext(maps + "\n" + app, context);
  return { context, document, buckets };
}

test("fatal initialization leaves the main content hidden", async () => {
  const { context, document } = setup();
  context.loadAllData = async () => ({ datasets: {}, sources: {}, errors: [] });
  await vm.runInContext("init()", context);
  assert.equal(document.querySelector("#loading-state").hidden, true);
  assert.equal(document.querySelector("#app-main").hidden, true);
  assert.equal(document.querySelector("#error-state").hidden, false);
});

test("round time buttons expose their state after click and reset", () => {
  const { context, buckets } = setup();
  const html = fs.readFileSync(path.join(docs, "index.html"), "utf8");
  assert.equal((html.match(/class="bucket-toggle active"[^>]*aria-pressed="true"/g) || []).length, 4);
  vm.runInContext("renderAll = () => {}; wireEvents()", context);
  buckets[0].listeners.click();
  assert.equal(buckets[0].classList.contains("active"), false);
  assert.equal(buckets[0].attributes["aria-pressed"], "false");
  buckets[0].listeners.click();
  assert.equal(buckets[0].attributes["aria-pressed"], "true");
  buckets[0].listeners.click();
  vm.runInContext("resetFilters()", context);
  for (const btn of buckets) {
    assert.equal(btn.classList.contains("active"), true);
    assert.equal(btn.attributes["aria-pressed"], "true");
  }
});

test("dynamic names are escaped in generated markup", () => {
  const { context, document } = setup();
  vm.runInContext(`
    state.teamId = 'team'; state.map = '<map>';
    state.datasets = {
      meta: { teams: [{ id: 'team', name: '<team>' }], players: [] },
      operators: [], 'anti-strat': []
    };
    renderAntiStrat(); renderScoutCard();
  `, context);
  assert.match(document.querySelector("#anti-strat-list").innerHTML, /&lt;team&gt;/);
  assert.match(document.querySelector("#scout-insights").innerHTML, /&lt;team&gt;.*&lt;map&gt;/);
  assert.match(vm.runInContext("renderMapBase('<map>', 'hm')", context), /&lt;MAP&gt;/);
  vm.runInContext(`
    state.datasets.operators = [{ team_id: 'team', player_id: 'p', player_name: '<player>',
      maps: { '<map>': { setup_positions: [], rounds_with_operator: 1, operator_kills: 0 } } }];
    renderOperator();
  `, context);
  assert.match(document.querySelector("#op-handoff").innerHTML, /&lt;player&gt;.*&lt;team&gt;/);
});

test("successful initialization and filter interactions render real aggregates", async () => {
  const { context, document, buckets } = setup();
  const names = ["meta", "heatmaps", "operators", "anti-strat", "self-scout", "landing-zones"];
  const datasets = Object.fromEntries(names.map((name) => [name,
    JSON.parse(fs.readFileSync(path.join(docs, "data", name + ".json"), "utf8")),
  ]));
  context.loadAllData = async () => ({ datasets, sources: { meta: "real" }, errors: [] });
  await vm.runInContext("init()", context);
  assert.equal(document.querySelector("#app-main").hidden, false);
  assert.equal(document.querySelector("#loading-state").hidden, true);
  assert.match(document.querySelector("#heatmap-svg").innerHTML, /map-name-label/);
  assert.match(document.querySelector("#heatmap-evidence").innerHTML, /n = /);
  buckets[0].listeners.click();
  assert.equal(buckets[0].attributes["aria-pressed"], "false");
  document.querySelector("#btn-reset").listeners.click();
  assert.equal(buckets[0].attributes["aria-pressed"], "true");
});