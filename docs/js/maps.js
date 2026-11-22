/**
 * SIGHTLINE — schematic map geometry.
 *
 * Original zone-based schematics drawn for this project. They are NOT
 * copies of Riot Games map assets: simplified layouts (sites, mid,
 * spawns, connectors) in a normalized 0-1000 coordinate space matching
 * the heatmap data contract (x, y normalized from map.bounds).
 *
 * Each map: { label, zones: [{id, name, d (SVG path), labelX, labelY}],
 *   corridors: [SVG path d], spawns: [{name, x, y, side}] }
 */
"use strict";

const MAP_GEOMETRY = {
  Ascent: {
    label: "Ascent",
    zones: [
      { id: "a-site", name: "A SITE", d: "M120 90 L360 90 L360 300 L120 300 Z", labelX: 240, labelY: 200 },
      { id: "b-site", name: "B SITE", d: "M640 90 L880 90 L880 300 L640 300 Z", labelX: 760, labelY: 200 },
      { id: "mid", name: "MID", d: "M430 330 L570 330 L570 620 L430 620 Z", labelX: 500, labelY: 480 },
      { id: "a-main", name: "A MAIN", d: "M150 320 L330 320 L330 520 L150 520 Z", labelX: 240, labelY: 425 },
      { id: "b-main", name: "B MAIN", d: "M670 320 L850 320 L850 520 L670 520 Z", labelX: 760, labelY: 425 },
      { id: "a-lobby", name: "A LOBBY", d: "M150 560 L330 560 L330 700 L150 700 Z", labelX: 240, labelY: 635 },
      { id: "b-lobby", name: "B LOBBY", d: "M670 560 L850 560 L850 700 L670 700 Z", labelX: 760, labelY: 635 },
    ],
    corridors: [
      "M360 180 L640 180",          // A site <-> B site (defender side)
      "M240 300 L240 320",          // A site -> A main
      "M760 300 L760 320",          // B site -> B main
      "M330 420 L430 420",          // A main -> mid
      "M570 420 L670 420",          // mid -> B main
      "M240 520 L240 560",          // A main -> A lobby
      "M760 520 L760 560",          // B main -> B lobby
      "M330 630 L430 560",          // A lobby -> mid bottom
      "M670 630 L570 560",          // B lobby -> mid bottom
      "M430 620 L570 620",          // mid floor
      "M500 620 L500 760",          // mid -> attacker spawn
      "M240 700 L240 800 L500 800", // A lobby -> spawn
      "M760 700 L760 800 L500 800", // B lobby -> spawn
    ],
    spawns: [
      { name: "DEF SPAWN", x: 500, y: 130, side: "defense" },
      { name: "ATK SPAWN", x: 500, y: 850, side: "attack" },
    ],
  },
  Haven: {
    label: "Haven",
    zones: [
      { id: "a-site", name: "A SITE", d: "M90 90 L300 90 L300 290 L90 290 Z", labelX: 195, labelY: 195 },
      { id: "b-site", name: "B SITE", d: "M395 90 L605 90 L605 260 L395 260 Z", labelX: 500, labelY: 180 },
      { id: "c-site", name: "C SITE", d: "M700 90 L910 90 L910 290 L700 290 Z", labelX: 805, labelY: 195 },
      { id: "mid", name: "MID", d: "M430 320 L570 320 L570 600 L430 600 Z", labelX: 500, labelY: 465 },
      { id: "a-long", name: "A LONG", d: "M120 320 L270 320 L270 520 L120 520 Z", labelX: 195, labelY: 425 },
      { id: "c-long", name: "C LONG", d: "M730 320 L880 320 L880 520 L730 520 Z", labelX: 805, labelY: 425 },
      { id: "garage", name: "GARAGE", d: "M620 420 L760 420 L760 560 L620 560 Z", labelX: 690, labelY: 495 },
      { id: "a-lobby", name: "A LOBBY", d: "M120 560 L270 560 L270 700 L120 700 Z", labelX: 195, labelY: 635 },
      { id: "c-lobby", name: "C LOBBY", d: "M730 560 L880 560 L880 700 L730 700 Z", labelX: 805, labelY: 635 },
    ],
    corridors: [
      "M300 180 L395 180",          // A site <-> B site
      "M605 180 L700 180",          // B site <-> C site
      "M195 290 L195 320",          // A site -> A long
      "M805 290 L805 320",          // C site -> C long
      "M500 260 L500 320",          // B site -> mid
      "M270 420 L430 420",          // A long -> mid
      "M570 420 L620 420",          // mid -> garage
      "M760 490 L730 490",          // garage -> C long
      "M195 520 L195 560",          // A long -> A lobby
      "M805 520 L805 560",          // C long -> C lobby
      "M270 630 L430 560",          // A lobby -> mid bottom
      "M730 630 L570 560",          // C lobby -> mid bottom
      "M500 600 L500 760",          // mid -> attacker spawn
      "M195 700 L195 800 L500 800", // A lobby -> spawn
      "M805 700 L805 800 L500 800", // C lobby -> spawn
    ],
    spawns: [
      { name: "DEF SPAWN", x: 500, y: 120, side: "defense" },
      { name: "ATK SPAWN", x: 500, y: 850, side: "attack" },
    ],
  },
};

/**
 * Render the base schematic (zones + corridors + spawns) as SVG inner markup.
 * @param {string} mapName
 * @returns {string} SVG inner markup (viewBox 0 0 1000 1000)
 */
function renderMapBase(mapName) {
  const geo = MAP_GEOMETRY[mapName] || MAP_GEOMETRY.Ascent;
  let s = "";
  // corridors (under zones)
  for (const d of geo.corridors) {
    s += `<path d="${d}" class="map-corridor" />`;
  }
  // zones
  for (const z of geo.zones) {
    s += `<path d="${z.d}" class="map-zone" data-zone="${z.id}" />`;
    s += `<text x="${z.labelX}" y="${z.labelY}" class="map-zone-label" text-anchor="middle">${z.name}</text>`;
  }
  // spawns
  for (const sp of geo.spawns) {
    s += `<g class="map-spawn map-spawn--${sp.side}">`
      + `<circle cx="${sp.x}" cy="${sp.y}" r="26" />`
      + `<text x="${sp.x}" y="${sp.y + 4}" text-anchor="middle">${sp.side === "defense" ? "DEF" : "ATK"}</text>`
      + `<text x="${sp.x}" y="${sp.y + 44}" class="map-spawn-name" text-anchor="middle">${sp.name}</text>`
      + `</g>`;
  }
  return s;
}
