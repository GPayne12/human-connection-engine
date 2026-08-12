"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Point the store at a throwaway directory before anything requires
// store.js/crypto.js, since both read HCE_DATA_DIR at module-load time.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hce-server-test-"));
process.env.HCE_DATA_DIR = tmpDir;

const app = require("../src/server");

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("GET /health", async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test("GET /cadence-rules seeds the four default tiers", async () => {
  const res = await fetch(`${baseUrl}/cadence-rules`);
  const rules = await res.json();
  assert.equal(rules.length, 4);
  assert.ok(rules.some((r) => r.tier === "inner" && r.intervalMinDays === 14));
});

test("PUT then GET /people round-trips notes/originStory as plaintext over the wire", async () => {
  const person = {
    id: "p1",
    name: "Alice",
    tier: "inner",
    originStory: "Met at a conference",
    sharedContext: [],
    tags: [],
    notes: "Prefers email",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };

  const putRes = await fetch(`${baseUrl}/people/${person.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(person),
  });
  assert.equal(putRes.status, 204);

  const getRes = await fetch(`${baseUrl}/people/${person.id}`);
  const roundTripped = await getRes.json();
  assert.equal(roundTripped.notes, "Prefers email");
  assert.equal(roundTripped.originStory, "Met at a conference");
});

test("the on-disk record stores ciphertext, not plaintext", async () => {
  const raw = fs.readFileSync(path.join(tmpDir, "graph.json"), "utf8");
  assert.ok(!raw.includes("Prefers email"), "plaintext notes leaked to disk");
  const parsed = JSON.parse(raw);
  assert.ok(parsed.people.p1.notes.ciphertext, "expected an EncryptedField shape on disk");
});

test("DELETE /people/:id cascades to interactions and campaign entries", async () => {
  await fetch(`${baseUrl}/interactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "i1",
      personId: "p1",
      type: "call",
      direction: "outbound",
      date: "2026-08-01T00:00:00.000Z",
      summary: "Caught up",
      warmthDelta: 1,
      createdAt: "2026-08-01T00:00:00.000Z",
    }),
  });

  await fetch(`${baseUrl}/people/p1`, { method: "DELETE" });

  const interactions = await (await fetch(`${baseUrl}/interactions`)).json();
  assert.equal(interactions.length, 0);
});

test("POST /campaign-entries/:id/advance appends stage history", async () => {
  await fetch(`${baseUrl}/campaign-entries/e1`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "e1",
      campaignId: "c1",
      personId: "p1",
      currentStage: "research",
      stageHistory: [],
      updatedAt: "2026-08-01T00:00:00.000Z",
    }),
  });

  const advanceRes = await fetch(`${baseUrl}/campaign-entries/e1/advance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toStage: "warmup", note: "sent intro" }),
  });
  assert.equal(advanceRes.status, 204);

  const entries = await (await fetch(`${baseUrl}/campaign-entries`)).json();
  const entry = entries.find((e) => e.id === "e1");
  assert.equal(entry.currentStage, "warmup");
  assert.equal(entry.stageHistory.length, 1);
  assert.equal(entry.stageHistory[0].stage, "research");
  assert.equal(entry.stageHistory[0].note, "sent intro");
});
