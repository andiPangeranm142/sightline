/**
 * SIGHTLINE — schematic map geometry.
 *
 * Original zone-based schematics drawn for this project. They are NOT
 * copies of Riot Games map assets: simplified layouts (sites, mid,
 * spawns, connectors) in a normalized 0-1000 coordinate space matching
 * the heatmap data contract (x, y normalized from map.bounds).
 *
 * Each map: { label, zones: [{id, name, d (SVG path), labelX, labelY}],
 *   corridors: [SVG path d | { d, cls }], spawns: [{name, x, y, side}] }
 *
 * All 13 maps in the current dataset have bespoke geometry.
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
  Bind: {
    label: "Bind",
    zones: [
      { id: "a-site", name: "A SITE", d: "M90 90 L330 90 L330 300 L90 300 Z", labelX: 210, labelY: 200 },
      { id: "b-site", name: "B SITE", d: "M670 90 L910 90 L910 300 L670 300 Z", labelX: 790, labelY: 200 },
      { id: "mid", name: "MID", d: "M420 150 L580 150 L580 260 L420 260 Z", labelX: 500, labelY: 210 },
      { id: "a-short", name: "A SHORT", d: "M120 330 L300 330 L300 520 L120 520 Z", labelX: 210, labelY: 430 },
      { id: "b-long", name: "B LONG", d: "M700 330 L880 330 L880 520 L700 520 Z", labelX: 790, labelY: 430 },
      { id: "a-lobby", name: "A LOBBY", d: "M120 560 L300 560 L300 700 L120 700 Z", labelX: 210, labelY: 635 },
      { id: "b-lobby", name: "B LOBBY", d: "M700 560 L880 560 L880 700 L700 700 Z", labelX: 790, labelY: 635 },
    ],
    corridors: [
      "M330 200 L420 200",
      "M580 200 L670 200",
      "M210 300 L210 330",
      "M790 300 L790 330",
      "M210 520 L210 560",
      "M790 520 L790 560",
      "M500 260 L500 760",
      "M210 700 L210 800 L500 800",
      "M790 700 L790 800 L500 800",
      { d: "M300 425 L700 425", cls: "map-corridor--tp" }, // teleporter link
    ],
    spawns: [
      { name: "DEF SPAWN", x: 500, y: 100, side: "defense" },
      { name: "ATK SPAWN", x: 500, y: 850, side: "attack" },
    ],
  },
  Split: {
    label: "Split",
    zones: [
      { id: "a-site", name: "A SITE", d: "M100 90 L340 90 L340 290 L100 290 Z", labelX: 220, labelY: 195 },
      { id: "b-site", name: "B SITE", d: "M660 90 L900 90 L900 290 L660 290 Z", labelX: 780, labelY: 195 },
      { id: "mid", name: "MID", d: "M430 160 L570 160 L570 500 L430 500 Z", labelX: 500, labelY: 330 },
      { id: "vents", name: "VENTS", d: "M600 320 L700 320 L700 430 L600 430 Z", labelX: 650, labelY: 380 },
      { id: "a-main", name: "A MAIN", d: "M120 330 L320 330 L320 520 L120 520 Z", labelX: 220, labelY: 430 },
      { id: "b-main", name: "B MAIN", d: "M700 330 L880 330 L880 520 L700 520 Z", labelX: 790, labelY: 430 },
      { id: "a-lobby", name: "A LOBBY", d: "M120 560 L320 560 L320 700 L120 700 Z", labelX: 220, labelY: 635 },
      { id: "b-lobby", name: "B LOBBY", d: "M700 560 L880 560 L880 700 L700 700 Z", labelX: 790, labelY: 635 },
    ],
    corridors: [
      "M340 200 L430 200",
      "M570 200 L660 200",
      "M220 290 L220 330",
      "M780 290 L780 330",
      "M320 430 L430 430",
      "M570 380 L600 380",
      "M570 450 L700 450",
      "M220 520 L220 560",
      "M780 520 L780 560",
      "M320 630 L430 560",
      "M680 630 L570 560",
      "M500 500 L500 760",
      "M220 700 L220 800 L500 800",
      "M780 700 L780 800 L500 800",
    ],
    spawns: [
      { name: "DEF SPAWN", x: 500, y: 105, side: "defense" },
      { name: "ATK SPAWN", x: 500, y: 850, side: "attack" },
    ],
  },
  Lotus: {
    label: "Lotus",
    zones: [
      { id: "a-site", name: "A SITE", d: "M80 100 L290 100 L290 300 L80 300 Z", labelX: 185, labelY: 200 },
      { id: "b-site", name: "B SITE", d: "M400 80 L600 80 L600 250 L400 250 Z", labelX: 500, labelY: 170 },
      { id: "c-site", name: "C SITE", d: "M710 100 L920 100 L920 300 L710 300 Z", labelX: 815, labelY: 200 },
      { id: "mid", name: "MID", d: "M430 300 L570 300 L570 560 L430 560 Z", labelX: 500, labelY: 430 },
      { id: "rubble", name: "RUBBLE", d: "M600 300 L700 300 L700 420 L600 420 Z", labelX: 650, labelY: 365 },
      { id: "a-main", name: "A MAIN", d: "M110 330 L280 330 L280 520 L110 520 Z", labelX: 195, labelY: 430 },
      { id: "c-main", name: "C MAIN", d: "M720 330 L890 330 L890 520 L720 520 Z", labelX: 805, labelY: 430 },
      { id: "a-lobby", name: "A LOBBY", d: "M110 560 L280 560 L280 700 L110 700 Z", labelX: 195, labelY: 635 },
      { id: "c-lobby", name: "C LOBBY", d: "M720 560 L890 560 L890 700 L720 700 Z", labelX: 805, labelY: 635 },
    ],
    corridors: [
      "M290 190 L400 190",
      "M600 190 L710 190",
      "M185 300 L185 330",
      "M815 300 L815 330",
      "M500 250 L500 300",
      "M280 430 L430 430",
      "M570 365 L600 365",
      "M700 365 L720 365",
      "M195 520 L195 560",
      "M805 520 L805 560",
      "M280 630 L430 560",
      "M720 630 L570 560",
      "M500 560 L500 760",
      "M195 700 L195 800 L500 800",
      "M805 700 L805 800 L500 800",
    ],
    spawns: [
      { name: "DEF SPAWN", x: 500, y: 120, side: "defense" },
      { name: "ATK SPAWN", x: 500, y: 850, side: "attack" },
    ],
  },
  Icebox: {
    label: "Icebox",
    zones: [
      { id: "a-site", name: "A SITE", d: "M90 90 L330 90 L330 300 L90 300 Z", labelX: 210, labelY: 200 },
      { id: "b-site", name: "B SITE", d: "M670 90 L910 90 L910 300 L670 300 Z", labelX: 790, labelY: 200 },
      { id: "mid", name: "MID", d: "M440 300 L560 300 L560 520 L440 520 Z", labelX: 500, labelY: 410 },
      { id: "tube", name: "TUBE", d: "M600 300 L700 300 L700 520 L600 520 Z", labelX: 650, labelY: 410 },
      { id: "a-main", name: "A MAIN", d: "M120 330 L310 330 L310 520 L120 520 Z", labelX: 215, labelY: 430 },
      { id: "b-main", name: "B MAIN", d: "M730 330 L880 330 L880 520 L730 520 Z", labelX: 805, labelY: 430 },
      { id: "a-lobby", name: "A LOBBY", d: "M120 560 L310 560 L310 700 L120 700 Z", labelX: 215, labelY: 635 },
      { id: "b-lobby", name: "B LOBBY", d: "M730 560 L880 560 L880 700 L730 700 Z", labelX: 805, labelY: 635 },
    ],
    corridors: [
      "M330 190 L670 190",
      "M210 300 L210 330",
      "M790 300 L790 330",
      "M310 430 L440 430",
      "M560 430 L600 430",
      "M700 430 L730 430",
      "M210 520 L210 560",
      "M790 520 L790 560",
      "M310 630 L440 560",
      "M690 630 L560 560",
      "M500 520 L500 760",
      "M210 700 L210 800 L500 800",
      "M790 700 L790 800 L500 800",
    ],
    spawns: [
      { name: "DEF SPAWN", x: 500, y: 130, side: "defense" },
      { name: "ATK SPAWN", x: 500, y: 850, side: "attack" },
    ],
  },
  Breeze: {
    label: "Breeze",
    zones: [
      { id: "a-site", name: "A SITE", d: "M60 90 L300 90 L300 290 L60 290 Z", labelX: 180, labelY: 195 },
      { id: "b-site", name: "B SITE", d: "M700 90 L940 90 L940 290 L700 290 Z", labelX: 820, labelY: 195 },
      { id: "mid", name: "MID", d: "M400 170 L600 170 L600 520 L400 520 Z", labelX: 500, labelY: 345 },
      { id: "a-main", name: "A MAIN", d: "M90 330 L280 330 L280 520 L90 520 Z", labelX: 185, labelY: 430 },
      { id: "b-main", name: "B MAIN", d: "M720 330 L910 330 L910 520 L720 520 Z", labelX: 815, labelY: 430 },
      { id: "hall", name: "HALL", d: "M430 520 L570 520 L570 640 L430 640 Z", labelX: 500, labelY: 585 },
      { id: "a-lobby", name: "A LOBBY", d: "M90 560 L280 560 L280 700 L90 700 Z", labelX: 185, labelY: 635 },
      { id: "b-lobby", name: "B LOBBY", d: "M720 560 L910 560 L910 700 L720 700 Z", labelX: 815, labelY: 635 },
    ],
    corridors: [
      "M300 190 L400 190",
      "M600 190 L700 190",
      "M180 290 L180 330",
      "M820 290 L820 330",
      "M280 430 L400 430",
      "M600 430 L720 430",
      "M180 520 L180 560",
      "M820 520 L820 560",
      "M280 630 L430 580",
      "M720 630 L570 580",
      "M500 640 L500 760",
      "M180 700 L180 800 L500 800",
      "M820 700 L820 800 L500 800",
    ],
    spawns: [
      { name: "DEF SPAWN", x: 500, y: 105, side: "defense" },
      { name: "ATK SPAWN", x: 500, y: 850, side: "attack" },
    ],
  },
  Fracture: {
    label: "Fracture",
    zones: [
      { id: "a-site", name: "A SITE", d: "M80 90 L300 90 L300 280 L80 280 Z", labelX: 190, labelY: 190 },
      { id: "b-site", name: "B SITE", d: "M700 90 L920 90 L920 280 L700 280 Z", labelX: 810, labelY: 190 },
      { id: "dish", name: "DISH", d: "M420 130 L580 130 L580 240 L420 240 Z", labelX: 500, labelY: 190 },
      { id: "arcade", name: "ARCADE", d: "M430 300 L570 300 L570 520 L430 520 Z", labelX: 500, labelY: 415 },
      { id: "a-main", name: "A MAIN", d: "M110 330 L290 330 L290 510 L110 510 Z", labelX: 200, labelY: 425 },
      { id: "b-main", name: "B MAIN", d: "M710 330 L890 330 L890 510 L710 510 Z", labelX: 800, labelY: 425 },
      { id: "a-lobby", name: "A LOBBY", d: "M110 550 L290 550 L290 690 L110 690 Z", labelX: 200, labelY: 625 },
      { id: "b-lobby", name: "B LOBBY", d: "M710 550 L890 550 L890 690 L710 690 Z", labelX: 800, labelY: 625 },
    ],
    corridors: [
      "M300 190 L420 190",
      "M580 190 L700 190",
      "M500 240 L500 300",
      "M190 280 L190 330",
      "M810 280 L810 330",
      "M290 425 L430 425",
      "M570 425 L710 425",
      "M190 510 L190 550",
      "M810 510 L810 550",
      "M290 625 L430 560",
      "M710 625 L570 560",
      "M500 520 L500 760",
      "M190 690 L190 800 L500 800",
      "M810 690 L810 800 L500 800",
    ],
    spawns: [
      { name: "DEF SPAWN", x: 500, y: 70, side: "defense" },
      { name: "ATK SPAWN", x: 500, y: 850, side: "attack" },
    ],
  },
  Pearl: {
    label: "Pearl",
    zones: [
      { id: "a-site", name: "A SITE", d: "M100 90 L340 90 L340 300 L100 300 Z", labelX: 220, labelY: 200 },
      { id: "b-site", name: "B SITE", d: "M660 90 L900 90 L900 300 L660 300 Z", labelX: 780, labelY: 200 },
      { id: "mid", name: "MID", d: "M450 170 L550 170 L550 640 L450 640 Z", labelX: 500, labelY: 405 },
      { id: "art", name: "ART", d: "M580 300 L690 300 L690 420 L580 420 Z", labelX: 635, labelY: 365 },
      { id: "a-main", name: "A MAIN", d: "M120 330 L320 330 L320 520 L120 520 Z", labelX: 220, labelY: 430 },
      { id: "b-main", name: "B MAIN", d: "M720 330 L880 330 L880 520 L720 520 Z", labelX: 800, labelY: 430 },
      { id: "a-lobby", name: "A LOBBY", d: "M120 560 L320 560 L320 700 L120 700 Z", labelX: 220, labelY: 635 },
      { id: "b-lobby", name: "B LOBBY", d: "M720 560 L880 560 L880 700 L720 700 Z", labelX: 800, labelY: 635 },
    ],
    corridors: [
      "M340 200 L450 200",
      "M550 200 L660 200",
      "M220 300 L220 330",
      "M780 300 L780 330",
      "M320 430 L450 430",
      "M550 360 L580 360",
      "M690 360 L720 360",
      "M220 520 L220 560",
      "M780 520 L780 560",
      "M320 630 L450 580",
      "M680 630 L550 580",
      "M500 640 L500 760",
      "M220 700 L220 800 L500 800",
      "M780 700 L780 800 L500 800",
    ],
    spawns: [
      { name: "DEF SPAWN", x: 500, y: 105, side: "defense" },
      { name: "ATK SPAWN", x: 500, y: 850, side: "attack" },
    ],
  },
  Abyss: {
    label: "Abyss",
    zones: [
      { id: "a-site", name: "A SITE", d: "M110 90 L350 90 L350 290 L110 290 Z", labelX: 230, labelY: 195 },
      { id: "b-site", name: "B SITE", d: "M650 90 L890 90 L890 290 L650 290 Z", labelX: 770, labelY: 195 },
      { id: "mid", name: "MID", d: "M460 170 L540 170 L540 570 L460 570 Z", labelX: 500, labelY: 370 },
      { id: "a-main", name: "A MAIN", d: "M130 330 L330 330 L330 520 L130 520 Z", labelX: 230, labelY: 430 },
      { id: "b-main", name: "B MAIN", d: "M670 330 L870 330 L870 520 L670 520 Z", labelX: 770, labelY: 430 },
      { id: "a-lobby", name: "A LOBBY", d: "M130 560 L330 560 L330 700 L130 700 Z", labelX: 230, labelY: 635 },
      { id: "b-lobby", name: "B LOBBY", d: "M670 560 L870 560 L870 700 L670 700 Z", labelX: 770, labelY: 635 },
    ],
    corridors: [
      "M350 190 L460 190",
      "M540 190 L650 190",
      "M230 290 L230 330",
      "M770 290 L770 330",
      "M330 430 L460 430",
      "M540 430 L670 430",
      "M230 520 L230 560",
      "M770 520 L770 560",
      "M330 630 L460 560",
      "M670 630 L540 560",
      "M500 570 L500 760",
      "M230 700 L230 800 L500 800",
      "M770 700 L770 800 L500 800",
    ],
    spawns: [
      { name: "DEF SPAWN", x: 500, y: 110, side: "defense" },
      { name: "ATK SPAWN", x: 500, y: 850, side: "attack" },
    ],
  },
  Corrode: {
    label: "Corrode",
    zones: [
      { id: "a-site", name: "A SITE", d: "M90 80 L330 80 L330 280 L90 280 Z", labelX: 210, labelY: 185 },
      { id: "b-site", name: "B SITE", d: "M620 180 L900 180 L900 380 L620 380 Z", labelX: 760, labelY: 285 },
      { id: "mid", name: "MID", d: "M400 120 L560 120 L560 420 L400 420 Z", labelX: 480, labelY: 270 },
      { id: "a-main", name: "A MAIN", d: "M110 320 L300 320 L300 510 L110 510 Z", labelX: 205, labelY: 420 },
      { id: "b-main", name: "B MAIN", d: "M680 420 L870 420 L870 580 L680 580 Z", labelX: 775, labelY: 505 },
      { id: "a-lobby", name: "A LOBBY", d: "M110 550 L300 550 L300 690 L110 690 Z", labelX: 205, labelY: 625 },
      { id: "b-lobby", name: "B LOBBY", d: "M680 620 L870 620 L870 740 L680 740 Z", labelX: 775, labelY: 685 },
    ],
    corridors: [
      "M330 185 L400 185",
      "M560 250 L620 250",
      "M210 280 L210 320",
      "M760 380 L760 420",
      "M300 420 L400 420",
      "M560 450 L680 480",
      "M205 510 L205 550",
      "M775 580 L775 620",
      "M480 420 L480 760",
      "M205 690 L205 800 L500 800",
      "M775 740 L775 800 L500 800",
    ],
    spawns: [
      { name: "DEF SPAWN", x: 450, y: 70, side: "defense" },
      { name: "ATK SPAWN", x: 500, y: 850, side: "attack" },
    ],
  },
  Summit: {
    label: "Summit",
    zones: [
      { id: "a-site", name: "A SITE", d: "M80 100 L320 100 L320 310 L80 310 Z", labelX: 200, labelY: 205 },
      { id: "b-site", name: "B SITE", d: "M680 100 L920 100 L920 310 L680 310 Z", labelX: 800, labelY: 205 },
      { id: "mid", name: "MID", d: "M440 330 L560 330 L560 600 L440 600 Z", labelX: 500, labelY: 470 },
      { id: "a-main", name: "A MAIN", d: "M100 350 L300 350 L300 540 L100 540 Z", labelX: 200, labelY: 450 },
      { id: "b-main", name: "B MAIN", d: "M700 350 L900 350 L900 540 L700 540 Z", labelX: 800, labelY: 450 },
      { id: "a-lobby", name: "A LOBBY", d: "M100 580 L300 580 L300 720 L100 720 Z", labelX: 200, labelY: 655 },
      { id: "b-lobby", name: "B LOBBY", d: "M700 580 L900 580 L900 720 L700 720 Z", labelX: 800, labelY: 655 },
    ],
    corridors: [
      "M320 200 L680 200",
      "M200 310 L200 350",
      "M800 310 L800 350",
      "M300 450 L440 450",
      "M560 450 L700 450",
      "M200 540 L200 580",
      "M800 540 L800 580",
      "M300 655 L440 600",
      "M700 655 L560 600",
      "M500 600 L500 760",
      "M200 720 L200 800 L500 800",
      "M800 720 L800 800 L500 800",
    ],
    spawns: [
      { name: "DEF SPAWN", x: 500, y: 130, side: "defense" },
      { name: "ATK SPAWN", x: 500, y: 850, side: "attack" },
    ],
  },
  Sunset: {
    label: "Sunset",
    zones: [
      { id: "a-site", name: "A SITE", d: "M90 90 L330 90 L330 300 L90 300 Z", labelX: 210, labelY: 200 },
      { id: "b-site", name: "B SITE", d: "M670 90 L910 90 L910 300 L670 300 Z", labelX: 790, labelY: 200 },
      { id: "mid", name: "MID", d: "M440 170 L560 170 L560 500 L440 500 Z", labelX: 500, labelY: 335 },
      { id: "alley", name: "ALLEY", d: "M580 330 L700 330 L700 450 L580 450 Z", labelX: 640, labelY: 395 },
      { id: "a-main", name: "A MAIN", d: "M120 330 L310 330 L310 520 L120 520 Z", labelX: 215, labelY: 430 },
      { id: "b-main", name: "B MAIN", d: "M720 330 L880 330 L880 520 L720 520 Z", labelX: 800, labelY: 430 },
      { id: "a-lobby", name: "A LOBBY", d: "M120 560 L310 560 L310 700 L120 700 Z", labelX: 215, labelY: 635 },
      { id: "b-lobby", name: "B LOBBY", d: "M720 560 L880 560 L880 700 L720 700 Z", labelX: 800, labelY: 635 },
    ],
    corridors: [
      "M330 200 L440 200",
      "M560 200 L670 200",
      "M215 300 L215 330",
      "M800 300 L800 330",
      "M310 430 L440 430",
      "M560 390 L580 390",
      "M700 390 L720 390",
      "M215 520 L215 560",
      "M800 520 L800 560",
      "M310 630 L440 560",
      "M690 630 L560 560",
      "M500 500 L500 760",
      "M215 700 L215 800 L500 800",
      "M800 700 L800 800 L500 800",
    ],
    spawns: [
      { name: "DEF SPAWN", x: 500, y: 105, side: "defense" },
      { name: "ATK SPAWN", x: 500, y: 850, side: "attack" },
    ],
  },
};

/**
 * Generic 2-site schematic for maps without a bespoke layout. All 13 maps
 * in the current dataset have bespoke geometry; this is the fallback for
 * future/unknown maps.
 */
function genericTwoSiteGeometry(mapName) {
  const g = JSON.parse(JSON.stringify(MAP_GEOMETRY.Ascent));
  g.label = mapName;
  return g;
}

function getMapGeometry(mapName) {
  return MAP_GEOMETRY[mapName] || genericTwoSiteGeometry(mapName);
}

/**
 * Render the base schematic (defs + grid + zones + corridors + spawns +
 * map label) as SVG inner markup.
 * @param {string} mapName
 * @param {string} [uid="hm"] unique prefix for <defs> ids (one SVG per
 *   page uses "hm", the Operator map uses "op" — ids must not collide)
 * @returns {string} SVG inner markup (viewBox 0 0 1000 1000)
 */
function renderMapBase(mapName, uid) {
  const geo = getMapGeometry(mapName);
  uid = uid || "hm";
  let s = `<defs>`
    + `<pattern id="${uid}-grid" width="50" height="50" patternUnits="userSpaceOnUse">`
    + `<path d="M50 0H0V50" fill="none" stroke="rgba(120,170,255,0.055)" stroke-width="1" /></pattern>`
    + `<radialGradient id="${uid}-heat-low">`
    + `<stop offset="0%" stop-color="#8fe6ff" stop-opacity="0.95" />`
    + `<stop offset="45%" stop-color="#35c4ff" stop-opacity="0.55" />`
    + `<stop offset="100%" stop-color="#35c4ff" stop-opacity="0" /></radialGradient>`
    + `<radialGradient id="${uid}-heat-mid">`
    + `<stop offset="0%" stop-color="#ffc46b" stop-opacity="0.95" />`
    + `<stop offset="45%" stop-color="#ff9f2e" stop-opacity="0.55" />`
    + `<stop offset="100%" stop-color="#ff9f2e" stop-opacity="0" /></radialGradient>`
    + `<radialGradient id="${uid}-heat-high">`
    + `<stop offset="0%" stop-color="#ff9d8a" stop-opacity="0.95" />`
    + `<stop offset="45%" stop-color="#ff4d4d" stop-opacity="0.55" />`
    + `<stop offset="100%" stop-color="#ff4d4d" stop-opacity="0" /></radialGradient>`
    + `</defs>`;
  // faint blueprint grid under everything
  s += `<rect width="1000" height="1000" fill="url(#${uid}-grid)" />`;
  const label = mapName.toUpperCase().replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
  s += `<text x="24" y="44" class="map-name-label">${label}</text>`;
  // corridors (under zones); a corridor may be a plain path string or
  // { d, cls } for a styled variant (e.g. Bind's teleporter link)
  for (const c of geo.corridors) {
    const d = typeof c === "string" ? c : c.d;
    const cls = typeof c === "string" ? "map-corridor" : ("map-corridor " + (c.cls || ""));
    s += `<path d="${d}" class="${cls}" />`;
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
