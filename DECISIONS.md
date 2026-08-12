# Architecture Decisions

Running log of significant choices, thesis-based reasoning, and trade-offs.

---

## 2026-06-10 — Storage: IndexedDB via Dexie.js (no server)

**Decision:** All relationship data is stored in IndexedDB on the user's device using Dexie.js as the wrapper.

**Reasoning:** Design law #3 — "the graph is the moat." Local-first means no vendor holds the user's relationship data. No backend server = no account, no subscription required to read your own contacts, no data breach at a third-party server.

**Trade-off:** No multi-device sync without explicit export/import or a user-supplied sync layer. Accepted: sync can be added later via a user-controlled backend; the default must be local.

---

## 2026-06-10 — Framework: React 19 + Vite + TypeScript

**Decision:** Use the existing career-aggregator-proven stack.

**Reasoning:** George has direct experience; no learning curve tax on a time-boxed build window.

**Trade-off:** Not a native app; no offline-push notifications. Acceptable for v1 — the two-minutes-before-coffee use case works fine as a browser tab.

---

## 2026-06-11 — Encryption: AES-GCM-256 with localStorage Key

**Decision:** `notes` and `originStory` on Person are encrypted at rest using AES-GCM-256 via the Web Crypto API. The key is generated on first use and stored in `localStorage` as a JWK under `hce_field_key_v1`.

**Reasoning:** Law #5 — sensitive notes about other humans must be encrypted at rest. Web Crypto is available in all target browsers with no dependencies.

**Trade-off:** The key lives in `localStorage` in the same browser profile as the IndexedDB data. This protects against raw IndexedDB file extraction from disk, but not against a full browser profile compromise. A password-derived key (PBKDF2) would be stronger but adds a login friction step incompatible with the "open app before a coffee meeting" UX. Revisit for v2 if a biometric unlock or OS keychain integration becomes viable.

---

## 2026-06-11 — CampaignEntry Stage History is Append-Only

**Decision:** `stageHistory` is an array embedded in the `CampaignEntry` row, not a separate table. Stage transitions are appended; nothing is deleted.

**Reasoning:** The full audit trail of how a relationship progressed through a campaign is valuable context. Deletions would erase the story. Embedded array is simple and sufficient at this scale.

**Trade-off:** Rows grow over time; not a concern until a single entry has hundreds of transitions, which would indicate a design problem (campaigns should close and recycle, not run forever).

---

## 2026-06-10 — AI Provider Abstraction from Day One

**Decision:** All Claude API calls go through `src/ai/provider.ts`; no component imports the Anthropic SDK directly.

**Reasoning:** Design law #4 — "build a thin provider abstraction so models can be swapped as the race churns." The Fable 5 window will end June 23; subsequent sessions may use different models.

**Trade-off:** Slight indirection overhead. Worth it: the abstraction is thin and the switching cost without it is high.

---

## 2026-08-12 — Stage 2: Storage Moves to a Local Service; Field Encryption Moves Server-Side

**Decision:** The relationship graph moved off per-browser IndexedDB (`src/db/schema.ts`, deleted) to a small single-user Express service (`server/`), reachable at `http://127.0.0.1:5199` by default, backed by a JSON file (`~/Library/Application Support/human-connection-engine/graph.json`) rather than SQLite at this data volume. `src/db/index.ts` keeps every exported function signature identical — it now calls `src/api/graph.ts` instead of Dexie — so no component, hook, or engine file changed.

`notes`/`originStory` encryption (AES-GCM-256) moved from the browser (`src/db/crypto.ts`, deleted, key in `localStorage`) to the service (`server/src/crypto.js`, key in a chmod-0600 file next to the graph). The browser now sends and receives these fields as plaintext over the connection to the service.

**Reasoning:** The alternative — keep encrypting client-side and have the service store ciphertext — reopens the key-portability problem this was supposed to solve: two browsers (GDesk, GLap) would need the _same_ AES key, which means a password-derived key entered on each one. That's the login step the original 2026-06-11 encryption decision explicitly rejected for the "open it two minutes before a coffee" use case, and multi-device access was the entire point of Stage 2. Server-side encryption keeps that UX intact — Law 5 ("encrypted at rest") is still satisfied, just by the service rather than the browser — and the service is loopback-only, reached from a second machine via an SSH tunnel (same pattern as the dev-dashboard tunnel), not a LAN-exposed bind.

**Trade-off:** The trust boundary changes from "only this browser can ever read this" to "only this service on this machine can." Anyone who can reach the service (this machine's local user, or anyone who can open an SSH tunnel to it) can read plaintext notes for the duration of a request. Accepted: the service still never persists plaintext to disk, and the alternative traded this for a UX regression the app was explicitly designed to avoid. Revisit if the tailnet ever needs to include an untrusted device.

**Also decided:** Law 1's ESLint rule (`no fetch outside src/api/`) needed no amendment. The new HTTP calls live in `src/api/graph.ts`, which was already the sanctioned location — `src/db/index.ts` calls into it rather than calling `fetch` itself. Law 1's actual substance ("no agent may trigger outreach") was never about local-service plumbing, just about where network calls are allowed to originate from in the source tree.

---

## 2026-08-12 — Audience of One; Usage Gates Building

**Decision:** HCE has no future as a product. It is a personal instrument for one user, pumped with his own data, and is designed accordingly: opinionated defaults, no multi-tenancy, no onboarding, no generality tax. Its immediate purpose is settled — **bridge to the next job.** The "New W2" campaign (learning design / AI enablement, $75–200k) is the fall campaign; securing a new W2 or consistent contract work is the breakpoint the tool exists to break.

Feature development follows an **adaptive-release rule: usage gates building.** Each increment unlocks only after a usage milestone — per-campaign cadence and the Layer 4 brief unlock when ~15 people are placed in campaign rosters; draft assist unlocks when the brief is in real use; context refresh and Layer 6 unlock at ~25 logged interactions. The LinkedIn importer is the one exemption, because it is what makes population feasible at all.

**Reasoning:** The 2026-08-04 leadership analysis's warning applies directly: no amount of tool work fixes the people gap, and building HCE features _is_ tool work. The gate inverts the temptation permanently — the only way to unlock the next feature is to do the human outreach the tool exists to serve. The gate applies to the builder; it is not an in-app mechanic. Law 2's ban on streaks, badges, and engagement bait inside the app is untouched and permanent. The app's daily pull must come from being genuinely useful — who's due, who's stalled, what the brief says — not from manufactured compulsion.

**Trade-off:** Slower feature velocity, deliberately. A feature idea that arrives mid-gate waits, however good it is. Accepted: the alternative is an elegant procrastination engine for the exact avoidance the tool was built to end.

---

## 2026-08-12 — Layer 4 Scope: Prepare-Only AI, Serving the New W2 Bridge

**Decision:** Layer 4 is a set of one-click **prepare** actions on people and campaign cards — never an agent, never a feed, never a background job. Mechanism: gather specific graph fields → one call through `src/ai/provider.ts` → text returned to the UI → the human edits, uses, or discards it. Three capabilities, in build order:

1. **Pre-contact brief** — where we left off, what I owe them, stage-aware (a brief for someone in `warmup` orients toward what a clean `ask` requires: referral or informational call, never an application).
2. **Draft assist on stage moves** — dragging a card to a new stage offers a draft opener in the user's register; drafts are throwaway and nothing persists unless acted on.
3. **Context refresh** — on-click only: what changed around this person since last contact (company news, role changes), via model-side web search.

The Quantic MSAIE concentration project (due 2026-09-13) is a **separate track** — Layer 4 is not scoped as coursework and carries no deadline other than the fall hiring cycle itself.

**Reasoning:** Every message is currently drafted from scratch — the biggest named friction in campaign mode — and pre-contact preparation is where an AI layer serves the "two minutes before a coffee" use case without touching the human-terminal rule. Law 1 stands untouched: the app has no send button and never will; the lint rule keeps all network calls in `src/api/`. Law 5's disclosure ("what was sent to the model") appears on every call.

**Trade-off:** Context refresh is the only capability where graph data (a contact's name/company) leaves the machine, to a third-party model with web search. Bounded: it fires only on an explicit click, never on a schedule, and the disclosure shows the exact query. Accepted — the value of fresh context for a warmup message that lands as genuine attention outweighs a per-click, disclosed, user-initiated lookup. Revisit if a local-model option becomes practical.
