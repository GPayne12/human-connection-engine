"use strict";
//
// store.js — durable JSON-file store for the relationship graph.
//
// Mirrors dev-dashboard/app/process-store.js's persistence pattern (atomic
// write via tmp-file + rename) rather than reaching for SQLite: at this data
// volume (one person's relationship graph) a JSON file is simpler to inspect,
// back up, and reason about, and DECISIONS.md (2026-06-10) already accepted
// "SQLite, or even a JSON file at this scale" for Stage 2. Revisit if this
// file ever gets large enough that a full read/rewrite on every write starts
// to matter.
//
// Data lives outside the git repo by design — see the hub's own
// STATE_DIR convention — so an accidental `git add -A` can never catch it.
// Override via HCE_DATA_DIR for tests.

const fs = require("fs");
const os = require("os");
const path = require("path");

const DATA_DIR =
  process.env.HCE_DATA_DIR ||
  path.join(os.homedir(), "Library", "Application Support", "human-connection-engine");
const STORE_FILE = path.join(DATA_DIR, "graph.json");

// Keep in sync with DEFAULT_CADENCE_RULES in src/types/index.ts — duplicated
// here because the server is deliberately a plain Node script with no build
// step or shared-package machinery (mirrors dev-dashboard's "no dependency
// beyond express" ethos).
const DEFAULT_CADENCE_RULES = [
  { tier: "inner", intervalMinDays: 14, intervalMaxDays: 21 },
  { tier: "active", intervalMinDays: 42, intervalMaxDays: 56 },
  { tier: "extended", intervalMinDays: 84, intervalMaxDays: 91 },
  { tier: "dormant", intervalMinDays: 180, intervalMaxDays: 365 },
];

function emptyGraph() {
  const cadenceRules = {};
  for (const rule of DEFAULT_CADENCE_RULES) cadenceRules[rule.tier] = rule;
  return {
    schemaVersion: 1,
    people: {},
    interactions: {},
    cadenceRules,
    campaigns: {},
    campaignEntries: {},
    snoozes: {},
  };
}

fs.mkdirSync(DATA_DIR, { recursive: true });

let graph;
try {
  graph = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
} catch {
  graph = emptyGraph();
}

function save() {
  const tmp = `${STORE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(graph, null, 2));
  fs.renameSync(tmp, STORE_FILE); // atomic: never leaves a half-written file
}

// ---- generic per-table helpers ---------------------------------------------

function all(table) {
  return Object.values(graph[table]);
}

function get(table, key) {
  return graph[table][key];
}

function put(table, key, value) {
  graph[table][key] = value;
  save();
}

function remove(table, key) {
  delete graph[table][key];
  save();
}

function bulkPut(table, entries, keyOf) {
  for (const entry of entries) graph[table][keyOf(entry)] = entry;
  save();
}

module.exports = {
  STORE_FILE,
  DATA_DIR,
  all,
  get,
  put,
  remove,
  bulkPut,
};
