"use strict";
//
// server.js — the Stage 2 graph service.
//
// Binds to 127.0.0.1 only, by default — same posture as dev-dashboard
// ("never exposed publicly"). A second machine (GLap) reaches it the same
// way it already reaches the dashboard: an SSH local-port-forward tunnel
// (see the handoff, 2026-08-12), not by widening the bind address to the
// LAN. Set HOST to change this deliberately.

const express = require("express");
const store = require("./store");
const { encryptField, decryptField } = require("./crypto");

const PORT = Number(process.env.PORT) || 5199;
const HOST = process.env.HOST || "127.0.0.1";

const app = express();
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

app.get("/health", (_req, res) => res.json({ ok: true }));

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

app.get(
  "/people",
  asyncRoute(async (_req, res) => {
    const people = await Promise.all(store.all("people").map(toResponsePerson));
    res.json(people);
  }),
);

app.get(
  "/people/:id",
  asyncRoute(async (req, res) => {
    const stored = store.get("people", req.params.id);
    if (!stored) return res.sendStatus(404);
    res.json(await toResponsePerson(stored));
  }),
);

app.put(
  "/people/:id",
  asyncRoute(async (req, res) => {
    const stored = await toStoredPerson({ ...req.body, id: req.params.id });
    store.put("people", req.params.id, stored);
    res.sendStatus(204);
  }),
);

app.delete("/people/:id", (req, res) => {
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

app.post(
  "/people/bulk",
  asyncRoute(async (req, res) => {
    const stored = await Promise.all(req.body.map(toStoredPerson));
    store.bulkPut("people", stored, (p) => p.id);
    res.sendStatus(204);
  }),
);

// ---- Interaction ------------------------------------------------------------

app.get("/interactions", (_req, res) => res.json(store.all("interactions")));

app.get("/people/:id/interactions", (req, res) => {
  const list = store
    .all("interactions")
    .filter((i) => i.personId === req.params.id)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  res.json(list);
});

app.post("/interactions", (req, res) => {
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

app.delete("/interactions/:id", (req, res) => {
  store.remove("interactions", req.params.id);
  res.sendStatus(204);
});

app.post("/interactions/bulk", (req, res) => {
  store.bulkPut("interactions", req.body, (i) => i.id);
  res.sendStatus(204);
});

// ---- CadenceRule --------------------------------------------------------------

app.get("/cadence-rules", (_req, res) => res.json(store.all("cadenceRules")));

app.put("/cadence-rules/:tier", (req, res) => {
  store.put("cadenceRules", req.params.tier, req.body);
  res.sendStatus(204);
});

app.post("/cadence-rules/bulk", (req, res) => {
  store.bulkPut("cadenceRules", req.body, (r) => r.tier);
  res.sendStatus(204);
});

// ---- Campaign -------------------------------------------------------------

app.get("/campaigns", (_req, res) => res.json(store.all("campaigns")));

app.put("/campaigns/:id", (req, res) => {
  store.put("campaigns", req.params.id, { ...req.body, id: req.params.id });
  res.sendStatus(204);
});

app.delete("/campaigns/:id", (req, res) => {
  store.remove("campaigns", req.params.id);
  const id = req.params.id;
  for (const e of store.all("campaignEntries")) {
    if (e.campaignId === id) store.remove("campaignEntries", e.id);
  }
  res.sendStatus(204);
});

app.post("/campaigns/bulk", (req, res) => {
  store.bulkPut("campaigns", req.body, (c) => c.id);
  res.sendStatus(204);
});

// ---- CampaignEntry ------------------------------------------------------------

app.get("/campaign-entries", (_req, res) => res.json(store.all("campaignEntries")));

app.get("/campaigns/:id/entries", (req, res) => {
  res.json(store.all("campaignEntries").filter((e) => e.campaignId === req.params.id));
});

app.put("/campaign-entries/:id", (req, res) => {
  store.put("campaignEntries", req.params.id, { ...req.body, id: req.params.id });
  res.sendStatus(204);
});

// Mirrors advanceCampaignEntryStage() — the FSM validation itself stays a
// pure client-side function (src/engine/campaign.ts); the caller sends the
// already-validated next stage, this just appends to history and persists.
app.post("/campaign-entries/:id/advance", (req, res) => {
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

app.delete("/campaign-entries/:id", (req, res) => {
  store.remove("campaignEntries", req.params.id);
  res.sendStatus(204);
});

app.post("/campaign-entries/bulk", (req, res) => {
  store.bulkPut("campaignEntries", req.body, (e) => e.id);
  res.sendStatus(204);
});

// ---- Snooze -----------------------------------------------------------------

app.get("/snoozes", (_req, res) => res.json(store.all("snoozes")));

app.get("/snoozes/:personId", (req, res) => {
  const snooze = store.get("snoozes", req.params.personId);
  if (!snooze) return res.sendStatus(404);
  res.json(snooze);
});

app.put("/snoozes/:personId", (req, res) => {
  store.put("snoozes", req.params.personId, { ...req.body, personId: req.params.personId });
  res.sendStatus(204);
});

app.delete("/snoozes/:personId", (req, res) => {
  store.remove("snoozes", req.params.personId);
  res.sendStatus(204);
});

app.post("/snoozes/bulk", (req, res) => {
  store.bulkPut("snoozes", req.body, (s) => s.personId);
  res.sendStatus(204);
});

// ---- errors -----------------------------------------------------------------

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`HCE graph server listening on http://${HOST}:${PORT}`);
    console.log(`Data dir: ${store.DATA_DIR}`);
  });
}

module.exports = app;
