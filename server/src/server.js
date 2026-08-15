"use strict";
//
// server.js — the Stage 2 graph service.
//
// Binds to 127.0.0.1 only, by default — same posture as dev-dashboard
// ("never exposed publicly"). Other machines (GLap, the phone) reach it
// through `tailscale serve`, which proxies in from the tailnet rather than
// widening the bind address to the LAN (DECISIONS.md, 2026-08-15). Set HOST
// to change this deliberately.
//
// This process also serves the built UI when dist/ exists — see the bottom
// of the file for why.

const express = require("express");
const compression = require("compression");
const path = require("node:path");
const fs = require("node:fs");
const store = require("./store");
const { encryptField, decryptField } = require("./crypto");

const PORT = Number(process.env.PORT) || 5199;
const HOST = process.env.HOST || "127.0.0.1";

const UI_DIST = process.env.HCE_UI_DIST || path.resolve(__dirname, "../../dist");
const UI_INDEX = path.join(UI_DIST, "index.html");

const app = express();

// The bundle is ~395kB uncompressed and ~115kB gzipped. The tailnet reaches
// this machine from anywhere, including cellular, so the difference is real
// on a cold load away from home.
app.use(compression());

app.use(express.json({ limit: "5mb" }));

// Single-user, loopback/SSH-tunnel-only service — reflecting the request
// Origin is safe here (there is no cookie/session to leak) and avoids
// hardcoding a port allowlist that drifts every time the client's dev
// port changes (5173 fallback, production preview port, etc).
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

// Every data route lives under /api so the built UI can be served from the
// same origin at /. Without the prefix the SPA's own /people and /campaigns
// routes would collide with the API's, and a page refresh on those paths
// would return JSON instead of the app.
const api = express.Router();

api.get("/health", (_req, res) => res.json({ ok: true }));

// ---- Person (encrypted fields live only in this process) ------------------

async function toResponsePerson(stored) {
  const [notes, originStory] = await Promise.all([
    decryptField(stored.notes),
    decryptField(stored.originStory),
  ]);
  return { ...stored, notes, originStory };
}

async function toStoredPerson(person) {
  const [notes, originStory] = await Promise.all([
    encryptField(person.notes),
    encryptField(person.originStory),
  ]);
  return { ...person, notes, originStory };
}

api.get(
  "/people",
  asyncRoute(async (_req, res) => {
    const people = await Promise.all(store.all("people").map(toResponsePerson));
    res.json(people);
  }),
);

api.get(
  "/people/:id",
  asyncRoute(async (req, res) => {
    const stored = store.get("people", req.params.id);
    if (!stored) return res.sendStatus(404);
    res.json(await toResponsePerson(stored));
  }),
);

api.put(
  "/people/:id",
  asyncRoute(async (req, res) => {
    const stored = await toStoredPerson({ ...req.body, id: req.params.id });
    store.put("people", req.params.id, stored);
    res.sendStatus(204);
  }),
);

api.delete("/people/:id", (req, res) => {
  store.remove("people", req.params.id);
  const id = req.params.id;
  for (const i of store.all("interactions")) {
    if (i.personId === id) store.remove("interactions", i.id);
  }
  for (const e of store.all("campaignEntries")) {
    if (e.personId === id) store.remove("campaignEntries", e.id);
  }
  res.sendStatus(204);
});

api.post(
  "/people/bulk",
  asyncRoute(async (req, res) => {
    const stored = await Promise.all(req.body.map(toStoredPerson));
    store.bulkPut("people", stored, (p) => p.id);
    res.sendStatus(204);
  }),
);

// ---- Interaction ------------------------------------------------------------

api.get("/interactions", (_req, res) => res.json(store.all("interactions")));

api.get("/people/:id/interactions", (req, res) => {
  const list = store
    .all("interactions")
    .filter((i) => i.personId === req.params.id)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  res.json(list);
});

api.post("/interactions", (req, res) => {
  const interaction = req.body;
  store.put("interactions", interaction.id, interaction);

  // Denormalize lastContactDate onto Person, same as the old addInteraction().
  const person = store.get("people", interaction.personId);
  if (person) {
    const ts = new Date(interaction.date).getTime();
    if (!person.lastContactDate || ts > new Date(person.lastContactDate).getTime()) {
      store.put("people", person.id, { ...person, lastContactDate: interaction.date });
    }
  }
  res.sendStatus(204);
});

api.delete("/interactions/:id", (req, res) => {
  store.remove("interactions", req.params.id);
  res.sendStatus(204);
});

api.post("/interactions/bulk", (req, res) => {
  store.bulkPut("interactions", req.body, (i) => i.id);
  res.sendStatus(204);
});

// ---- CadenceRule --------------------------------------------------------------

api.get("/cadence-rules", (_req, res) => res.json(store.all("cadenceRules")));

api.put("/cadence-rules/:tier", (req, res) => {
  store.put("cadenceRules", req.params.tier, req.body);
  res.sendStatus(204);
});

api.post("/cadence-rules/bulk", (req, res) => {
  store.bulkPut("cadenceRules", req.body, (r) => r.tier);
  res.sendStatus(204);
});

// ---- Campaign -------------------------------------------------------------

api.get("/campaigns", (_req, res) => res.json(store.all("campaigns")));

api.put("/campaigns/:id", (req, res) => {
  store.put("campaigns", req.params.id, { ...req.body, id: req.params.id });
  res.sendStatus(204);
});

api.delete("/campaigns/:id", (req, res) => {
  store.remove("campaigns", req.params.id);
  const id = req.params.id;
  for (const e of store.all("campaignEntries")) {
    if (e.campaignId === id) store.remove("campaignEntries", e.id);
  }
  res.sendStatus(204);
});

api.post("/campaigns/bulk", (req, res) => {
  store.bulkPut("campaigns", req.body, (c) => c.id);
  res.sendStatus(204);
});

// ---- CampaignEntry ------------------------------------------------------------

api.get("/campaign-entries", (_req, res) => res.json(store.all("campaignEntries")));

api.get("/campaigns/:id/entries", (req, res) => {
  res.json(store.all("campaignEntries").filter((e) => e.campaignId === req.params.id));
});

api.put("/campaign-entries/:id", (req, res) => {
  store.put("campaignEntries", req.params.id, { ...req.body, id: req.params.id });
  res.sendStatus(204);
});

// Mirrors advanceCampaignEntryStage() — the FSM validation itself stays a
// pure client-side function (src/engine/campaign.ts); the caller sends the
// already-validated next stage, this just appends to history and persists.
api.post("/campaign-entries/:id/advance", (req, res) => {
  const entry = store.get("campaignEntries", req.params.id);
  if (!entry) return res.sendStatus(404);
  const { toStage, note } = req.body;
  const updated = {
    ...entry,
    currentStage: toStage,
    stageHistory: [
      ...entry.stageHistory,
      { stage: entry.currentStage, enteredAt: entry.updatedAt, note },
    ],
    updatedAt: new Date().toISOString(),
  };
  store.put("campaignEntries", entry.id, updated);
  res.sendStatus(204);
});

api.delete("/campaign-entries/:id", (req, res) => {
  store.remove("campaignEntries", req.params.id);
  res.sendStatus(204);
});

api.post("/campaign-entries/bulk", (req, res) => {
  store.bulkPut("campaignEntries", req.body, (e) => e.id);
  res.sendStatus(204);
});

// ---- Snooze -----------------------------------------------------------------

api.get("/snoozes", (_req, res) => res.json(store.all("snoozes")));

api.get("/snoozes/:personId", (req, res) => {
  const snooze = store.get("snoozes", req.params.personId);
  if (!snooze) return res.sendStatus(404);
  res.json(snooze);
});

api.put("/snoozes/:personId", (req, res) => {
  store.put("snoozes", req.params.personId, { ...req.body, personId: req.params.personId });
  res.sendStatus(204);
});

api.delete("/snoozes/:personId", (req, res) => {
  store.remove("snoozes", req.params.personId);
  res.sendStatus(204);
});

api.post("/snoozes/bulk", (req, res) => {
  store.bulkPut("snoozes", req.body, (s) => s.personId);
  res.sendStatus(204);
});

app.use("/api", api);

// Kept at the root as well: dev-dashboard and any future supervisor probe
// /health, and they should not have to know about the /api prefix.
app.get("/health", (_req, res) => res.json({ ok: true }));

// ---- built UI ---------------------------------------------------------------
//
// Serving the bundle from this process is what makes the phone reliable: the
// graph server is the one thing under a KeepAlive LaunchAgent, so UI and data
// come back together after a reboot instead of the UI silently staying down.
// In development this is skipped entirely — Vite serves the UI on 5174 with
// HMR and talks to /api here.

if (fs.existsSync(UI_INDEX)) {
  app.use(
    express.static(UI_DIST, {
      setHeaders(res, filePath) {
        // Vite fingerprints everything under assets/, so those filenames can
        // never mean different bytes — cache them hard. Express's default of
        // max-age=0 costs a revalidation round-trip per asset per load, which
        // is the wrong trade over a phone connection.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          // index.html and the manifest are unfingerprinted: they must be
          // revalidated or a rebuild would never reach the phone.
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    }),
  );
  // React Router owns /people, /campaigns, /triage and /data on the client.
  // A deep link or refresh on those paths must return the shell, not a 404.
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (!req.accepts("html")) return next();
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(UI_INDEX);
  });
}

// ---- errors -----------------------------------------------------------------

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`HCE graph server listening on http://${HOST}:${PORT}`);
    console.log(`Data dir: ${store.DATA_DIR}`);
    if (fs.existsSync(UI_INDEX)) {
      console.log(`Serving built UI from ${UI_DIST}`);
    } else {
      console.log(
        `No built UI at ${UI_DIST} — API only. Run \`npm run build\` in the repo root to serve the app from this process.`,
      );
    }
  });
}

module.exports = app;
