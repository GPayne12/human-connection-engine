# Human Connection Engine — Design Principles

These five laws govern every architectural and product decision. When a feature, refactor, or API choice conflicts with a law, the law wins. When facing ambiguity, choose the option that maximizes human-to-human contact and user data ownership.

---

## Law 1 — Human-Terminal Actions

The app may draft, remind, score, and suggest — but **a human sends every message, makes every call, attends every coffee**. No background job, scheduled task, or AI agent may trigger outreach on behalf of the user. Ever. The send button belongs to George.

**Enforced by:** ESLint rule blocking `fetch`/`axios`/`XMLHttpRequest` outside `src/api/`. All network calls must be in `src/api/`; all `src/api/` functions must be explicitly invoked by user action, never scheduled autonomously.

---

## Law 2 — Success = Human Contact Events, Not App Engagement

The north-star metric is **real-world touchpoints completed** — calls held, meetings taken, messages personally sent — not time-in-app, sessions, page views, or feature engagement. If a feature increases screen time without increasing human contact, it is a failure.

**Enforced by:** `src/metrics/index.ts` exports only `trackContactEvent()`. No `trackSession`, `trackPageView`, `trackFeatureUse`, or streak/badge mechanics exist in the codebase.

---

## Law 3 — The Graph Is the Moat

Relationship data (people, history, context, cadence state, reciprocity signals) is the irreplaceable asset. It must be:

- Stored locally by default (IndexedDB, no server required)
- Exportable in open formats (JSON / CSV / vCard) at any time
- Structured so it outlives the app, the vendor, and the subscription tier

No architecture may hold the user's own relationships hostage.

---

## Law 4 — Cadence Over Volume

The core mechanic is rhythm — the right touchpoint at the right interval per relationship tier — not maximizing the number of connections. Anti-spam by design: the app surfaces who needs attention, not who hasn't been emailed recently.

---

## Law 5 — Privacy as Respect for the Other Human

Notes about people are sensitive. The app must:

- Encrypt `notes` and `originStory` fields at rest (Web Crypto API)
- Never send contact data to third parties beyond what a feature strictly requires
- Surface to the user exactly what leaves the device when AI features are invoked ("What was sent to the model" disclosure on every AI call)

---

## Code Review Checklist

Before merging any pull request, verify:

- [ ] **Law 1:** Does this feature contain any outreach that fires without explicit user action? If yes, it must be removed or restructured.
- [ ] **Law 1:** Are all `fetch`/`axios` calls inside `src/api/`? ESLint should catch violations, but double-check.
- [ ] **Law 2:** Does this feature track anything other than contact events? Sessions, page views, streaks, badges, and engagement scores are prohibited.
- [ ] **Law 2:** Does this feature increase human contact events, or only app engagement? If only the latter, reconsider whether it belongs.
- [ ] **Law 3:** Does this feature store data outside of the local IndexedDB store? If yes, justify explicitly in `DECISIONS.md`.
- [ ] **Law 3:** If a new entity or field is added, is it included in the export schema?
- [ ] **Law 5:** Does this feature send contact data to an external API? If yes, is the "What was sent" disclosure present?
- [ ] **Law 5:** Are any new sensitive fields (anything personal about a contact) encrypted at rest?
- [ ] **General:** Would this change make sense to the person being managed in the relationship graph? Would they feel respected?
