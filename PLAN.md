# Human Connection Engine — Production Plan

**Owner:** George Payne (GPayne12)  
**Stack:** React 19 / Vite / TypeScript, IndexedDB (Dexie.js), Claude API  
**Constraint:** Front-load all frontier-reasoning work before June 23, 2026 (Claude Fable 5 window).

---

## Sequencing Rationale

Layers 0–2 are the hardest intellectually and must happen within the Fable 5 window. Layers 3–6 involve wiring, styling, and measurement — work that can be driven with a lesser model or by George directly.

| Priority | Layer                         | Why now vs. later                                                      |
| -------- | ----------------------------- | ---------------------------------------------------------------------- |
| **NOW**  | 0 – Philosophy as constraints | Shapes everything; do it first so later layers cannot drift            |
| **NOW**  | 1 – Data model                | Core schema decisions are irreversible; wrong here = expensive rewrite |
| **NOW**  | 2 – Cadence engine            | Pure logic; needs careful design, complete test coverage               |
| Later    | 3 – UI wiring                 | CRUD + mockup hookup; pattern work, not reasoning work                 |
| Later    | 4 – AI features               | Thin layer on top of solid data model                                  |
| Later    | 5 – Data ownership            | Export/import plumbing; straightforward once schema is locked          |
| Later    | 6 – Measurement               | Instrumentation on top of working app                                  |

---

## Layer 0 — Philosophy Encoded as Constraints

**Goal:** Translate the five design laws into enforceable artifacts so drift is caught at commit time, not code review.

**Deliverables:**

- `PRINCIPLES.md` — canonical reference for the five laws
- `DECISIONS.md` — running log of architectural choices (created empty, filled as we go)
- ESLint rule or comment convention: no direct API call that sends a message (e.g., flag any usage of `fetch`/`axios` in files outside `src/api/`) — enforced via lint
- Contact-event tracking contract: `src/metrics/` module must export `trackContactEvent()`, never `trackSession()` or `trackPageView()`
- Code-review checklist item in `PRINCIPLES.md`: "Does this feature increase human contact events or only app engagement?"

**Approval gate:** Review `PRINCIPLES.md` and lint rule before Layer 1 begins.

---

## Layer 1 — Data Model: The Relationship Graph

**Goal:** Lock the schema before any UI or logic is written. Every entity must justify its existence against the thesis.

**Entities:**

```
Person
  id, name, role, organization
  tier: 'inner' | 'active' | 'extended' | 'dormant'
  originStory: string          -- how you met; irreplaceable context
  sharedContext: string[]      -- ongoing shared threads (projects, interests)
  lastContactDate: Date
  contactFrequencyTarget: number (days)
  tags: string[]
  notes: string                -- encrypted at rest

Interaction
  id, personId, type, direction, date
  type: 'message' | 'call' | 'meeting' | 'email' | 'other'
  direction: 'outbound' | 'inbound' | 'mutual'
  summary: string
  warmthDelta: number          -- did this contact deepen or cool things?

CadenceRule
  tier: Tier
  intervalDays: { min: number; max: number }
  -- defaults: inner 14–21, active 42–56, extended 84–91, dormant 180+

Campaign
  id, name, goal, status
  status: 'research' | 'warmup' | 'ask' | 'nurture' | 'closed' | 'recycled'
  targetPersonIds: string[]
  notes: string

CampaignEntry
  campaignId, personId, currentStage, stageHistory[]

ReciprocitySignal
  personId, period: 'month' | 'quarter' | 'year'
  outboundCount, inboundCount
  avgResponseLatencyHours: number
  balance: 'giving' | 'balanced' | 'receiving'
```

**Storage:** IndexedDB via Dexie.js. No server required. All data stays on device.  
**Encryption:** `notes` and `originStory` encrypted via Web Crypto API before write.  
**Approval gate:** Schema review (entities, field names, types) before engine is written.

---

## Layer 2 — The Cadence Engine

**Goal:** Pure deterministic functions that compute relationship health and due-for-contact state. Zero AI dependency. Fully unit-tested.

**Core functions:**

- `computeHealthScore(person, interactions, rule): HealthScore` — 0–100, decays continuously from last contact
- `isDueForContact(person, interactions, rule, snooze?): boolean`
- `getDueList(allPersons, ...): DueItem[]` — sorted by urgency, annotated with warm-reentry context
- `advanceCampaignStage(entry, trigger): CampaignEntry` — deterministic FSM
- `computeReciprocity(personId, interactions, period): ReciprocitySignal`
- `snoozePerson(personId, untilDate): void`

**Design constraints:**

- No async, no API calls, no side effects — pure input → output
- Decay curve: linear by default; configurable per tier
- All functions exported from `src/engine/` and covered by Vitest unit tests
- Engine must pass tests if every Claude API key on earth expires

**Approval gate:** Function signatures + test plan before implementation.

---

## Layer 3 — Human-Centered UI

**Goal:** Wire engine output to React UI. Three priority surfaces.

**Surfaces:**

1. **Today view** — who is due, cadence tier, one-line warm-reentry context, last-contact summary. CTA: "Log contact" (sends to Interaction store, never auto-sends anything).
2. **Person page** — full relationship story: origin, shared context, interaction timeline, health trend, reciprocity balance, active campaigns.
3. **Campaign board** — Kanban columns matching Campaign lifecycle states. Drag-to-advance triggers `advanceCampaignStage`.

**UI constraints:**

- Mobile-first, readable in 2 minutes pre-meeting
- No infinite scroll, no notification badges for engagement, no streaks
- Every AI-generated element visually distinguished (e.g., italic + "AI draft" label)

**Approval gate:** Component tree + routing plan before wiring.

---

## Layer 4 — AI as Servant

**Goal:** Thin Claude API integration that reduces friction without substituting for human judgment.

**Features (all require explicit user trigger):**

- Outreach draft: user picks a person + context → Claude drafts a message → user edits → user sends manually
- Pre-meeting brief: summarize interaction history + shared context for a person
- Cadence suggestion: "You haven't reached out in 6 weeks; inner-circle target is 3. Want to adjust the rule or log a contact?"
- Brain-dump parser: user pastes free-text notes → Claude extracts structured Interaction fields

**Transparency:** Every AI call shows a "What was sent to Claude" expandable disclosure before submission.

**Provider abstraction:** `src/ai/provider.ts` — swap model behind a single interface. Current: `claude-sonnet-4-6`. Target: `claude-opus-4-8` for drafting.

**Approval gate:** Feature list + provider interface design before implementation.

---

## Layer 5 — Data Ownership

**Goal:** The relationship graph outlives the app, the vendor, and the subscription tier.

**Deliverables:**

- Full JSON export of all entities
- CSV export (People + Interactions flattened)
- vCard export for People
- LinkedIn export CSV importer (maps to Person schema)
- Documented schema version in every export (`schemaVersion: "1.0"`)
- Local backup: auto-export on demand, or on a user-set schedule, to a file the user controls

**Approval gate:** Export schema review before implementation.

---

## Layer 6 — Honest Measurement

**Goal:** Track the north-star metric. Explicitly avoid engagement-maximization patterns.

**Tracked:**

- Contact events completed per week (by tier)
- Relationship health distribution (histogram) over time
- Cadence adherence rate: due contacts acted on within the window
- Campaign conversion by stage

**Explicitly NOT tracked:**

- Session duration
- Page views
- Feature engagement
- Anything that could feed a notification-spam loop

**Approval gate:** Metric definitions before instrumentation.

---

## Working Agreement

- State a 5–10 line plan for each layer and wait for go-ahead before writing code.
- Commit in small reviewable increments; conventional commit messages; all hooks passing.
- When facing an ambiguity, choose the option that maximizes human-to-human contact and user data ownership, then flag the choice in `DECISIONS.md`.
- `DECISIONS.md` is updated with every significant architectural choice.
