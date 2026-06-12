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
