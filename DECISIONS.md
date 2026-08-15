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

---

## 2026-08-12 — The Origin-Story Toll Gate

**Decision:** `originStory` is required everywhere except the `dormant` tier. Bulk-imported contacts land in dormant with the field empty; **promoting a person to any other tier, or placing them on a campaign board, requires writing their origin story first** — in the user's own words, in the form, at that moment. The campaign "Add person" modal surfaces the field inline when the selected person has no story, and will not submit without it.

**Reasoning:** Bulk import is about to make mostly-empty origin stories statistically normal, which would quietly erode the field the schema calls "irreplaceable — AI cannot regenerate this." A hard requirement on every person would make import impossible; no requirement would make the field vestigial. Gating on _promotion_ puts the toll exactly where a stranger becomes someone the practice is actually working — and turns the standing no-fabrication rule from a prohibition into a practice of remembering. It is the most humanizing mechanic available and it costs one form field.

**Trade-off:** Friction at the exact moment of enthusiasm — placing someone on a board now requires a sentence of real recall first. Accepted, and in fact the point: a person who cannot be described is a person not ready to be campaigned at. Dormant remains a legitimate long-term home for contacts whose story hasn't been written yet; nothing forces the toll to be paid on a schedule.

---

## 2026-08-12 — Today and the Board Read Each Other; Empty States Tell the Truth

**Decision:** The two loops are joined at the card level rather than merged. A Today due card shows the person's active campaign placements (campaign name + current stage) and their origin story; a campaign board card shows a `● due` marker when that person is on today's due list. Terminal stages (`closed`, `recycled`) are excluded from both directions. Separately, Today's empty state no longer says "All caught up" — it reports when the next person comes due, how many people are on campaign boards (flagging zero as a problem, not a success), and how many contacts are still waiting for an origin story.

**Reasoning:** The activation handoff identified that the board drives campaign work while the due list drives maintenance, and that the two have no awareness of each other at the moment decisions get made. Joining them at the card is enough — a full merge would compromise the cadence engine's purity, which is calibrated for relationship maintenance and correctly so. On the empty state: during a bridge campaign, an empty queue usually means the campaigns aren't feeding it, and a UI that congratulates the user for that is lying. The tool should be able to notice its own neglect.

**Trade-off:** The due card is denser, and the empty state is no longer reassuring. Both accepted deliberately — this is an instrument for one user who needs the truth more than the comfort, and the failure mode this project has already demonstrated once is abandonment, not overload.

---

## 2026-08-13 — Campaign Readiness: The Whole Profile Is the Gate

**Decision:** The origin-story toll gate widens into a **profile-readiness gate**. A person may be placed on a campaign board only when all six required fields are populated: name, role, organization, relationship tier, origin story, and at least one tag. `sharedContext` and `notes` remain optional — six of the eight fields on `Person`, a deliberate majority. The rule lives in `src/engine/readiness.ts` as a pure function (`profileReadiness`, `isCampaignReady`, `nearlyReady`), tested like every other engine module, and is enforced at the one place placement happens: the campaign "Add person" list now contains only campaign-ready people. Ineligible contacts are not offered and rejected — they are simply not on the menu.

The importer's `linkedin-import` tag does **not** satisfy the tags requirement. It is provenance — a record of where a row came from — not a human judgment about a person, and letting it count would have opened the gate for the entire import at once.

The inline origin-story capture in the Add-person modal is removed as dead code: a person reaching that list already has a story. The toll is still paid in the user's own words, now in the person form, and the tier rule in `PersonForm` (dormant is the only tier that may hold an unwritten story) is untouched.

**Reasoning:** Triage established the shape of the thing — the satisfaction of clearing a hurdle and coming out the other side with ~100 real people instead of 1000+ names, an inventory that feels personal because it was earned. Readiness is the same hurdle one layer in. The bulk importer makes a mostly-empty profile statistically normal; a board of half-known people would reproduce, inside the tool, exactly the LinkedIn-shaped pile the triage swipe existed to escape. Gating placement rather than existence puts the cost at the moment of consequence and leaves the graph free to hold anyone.

Progress is shown, not just enforced: a six-pip meter moves live in the person form as fields are filled, the People list carries a campaign-ready count and an "Unfinished" filter sorted nearest-to-done first, and Today's empty state links into that queue. **This is not a Law 2 violation and the line is worth stating:** the meter counts fields on a profile, never sessions, visits, or activity; it cannot decay on its own; it ends permanently when a person is ready; and every point of progress is a piece of real relationship data George wrote himself. A streak measures showing up. This measures whether the tool knows enough about a human being to help you reach them.

**Also decided:** `Person.pronouns` is removed from the schema, the form, and the person page. Audience of one, all of whom George knows well enough not to misgender — the field carried no weight for its cost. Stored records keep the key harmlessly until their next save; nothing reads it.

**Trade-off:** Placement gets slower, and right after an import it gets much slower — the board can be empty while the graph holds a hundred people. Accepted, and it is the point: a person whose role, employer, and origin story can't be stated is a person not ready to be campaigned at. Contacts already on boards are grandfathered rather than evicted; the gate governs entry, not tenure. Revisit if finishing profiles becomes an avoidance ritual of its own — the failure mode to watch is grooming the graph instead of contacting the humans in it.

---

## 2026-08-13 — Repairing the OCR Capture: Role/Org Split, No Deletions

**Decision:** The screen-OCR capture wrote each contact's LinkedIn _headline_ into `role` and never captured an employer, leaving 101 of 111 people with no `organization` — the single biggest blocker to the readiness gate. 28 records were repaired by splitting title from employer: 19 by a mechanical rule (an explicit `" at "` / `" @ "` connector), 9 from an explicit curated table for headlines that name an employer with a different connector (`"CEO of Boundless Learning"`, `"Managing Director, Wharton Online"`). Organizations went from 9 to 37.

**Every value came verbatim from the person's own headline. Nothing was inferred, and no employer was guessed from a name, domain, or industry** — the no-fabrication rule covers `organization` as surely as it covers `originStory`. Two judgment calls are recorded rather than hidden: Federica Dall'Arche's headline lists two posts and the first was taken as primary; Matthew Campbell's lists a current AI lab "at the AAP" alongside two roles explicitly marked "Former," and AAP was taken as current. Marina Gracen-Farrell's headline names "Former Pearson Education" and was therefore left empty — a former employer is not an employer.

**Decided not to delete.** The remaining 74 people have a real job title and no employer anywhere in the captured text — the org was never captured, not garbled. Deleting them would have removed roughly 65 instructional-design and L&D professionals, which is to say the New W2 target audience, to solve a problem the readiness gate already solves: an unfinished profile simply cannot reach a campaign board. There was no gibberish to delete either; all 111 names are real people. `MARQUITA RICHARDSON` (a bare name, no other content) and two OCR-truncated names (`Jaime Mordue (Trullinger`, `Kristin H`) are kept.

**Trade-off:** The graph keeps 74 profiles that cannot be campaigned until George supplies an employer by hand, so the People list stays long while the campaign-ready count stays small. Accepted: list length costs nothing, and a deleted relationship costs a re-capture. The upstream fix belongs in `tools/screen-ocr`, which should capture the company line, not only the headline — until then every future import reproduces this same gap.

**Operational note:** The graph was exported before any write (`backups/`, now gitignored — it holds real contact data and must never be committed). Repairs were applied through the service's `PUT /people/:id`, not by editing `graph.json` underneath it.

---

## 2026-08-15 — HCE Reaches the Phone: Tailscale Serve, Origin-Derived Graph URL

**Decision:** HCE is now reachable from the iPhone and GLap at **`http://georges-mac-mini.tail24407f.ts.net:8199`** — one URL, serving both the app and its data — via `tailscale serve --bg --http` proxies on GDesk. A second proxy on `:8080` fronts the Vite dev server for development from the couch; it is not the daily driver. **Neither service changed its binding** — Vite stays on `[::1]:5174` and the graph server stays on `127.0.0.1:5199`. Tailscale reaches in from the tailnet; nothing was opened to the LAN.

**The graph server now also serves the built UI.** `dist/` is served at `/` with a history fallback, and every data route moved under **`/api`**. The prefix is not cosmetic: the SPA owns `/people` and `/campaigns` client-side and the API owned the same paths, so a refresh on those routes would have returned JSON instead of the app. Same-origin also means writes from the phone no longer take a CORS preflight.

`src/api/graph.ts` no longer hard-codes the graph address. `BASE_URL` is derived from `window.location`: a page served from loopback talks to `127.0.0.1:5199`, a page served from any other host talks to that same host on port 8199. `VITE_HCE_SERVER_URL` still overrides both.

**Reasoning:** The phone is where the networking actually happens — LinkedIn, email, and messages are all two taps away, and the desk is not. Stage 2 is what makes this safe: with the graph in a service and encryption server-side, a phone browser is just another client of the one store, so the divergent-second-store hazard that forced the old one-browser rule no longer exists. The multi-device roadmap's §1 is now stale and should be read as history.

Deriving the base URL from the serving origin rather than baking it in at build time was the load-bearing choice. A build-time `VITE_HCE_SERVER_URL` pointing at the tailnet name would have made the **desktop** depend on tailscaled being up to reach a service running three inches away, and would have needed a rebuild every time the address changed. Origin-derivation makes the desktop path fully local and the phone path automatic, with one code path and no per-device build.

**Trade-off:** The graph service has no authentication and reflects any `Origin` — acceptable on loopback, and now reachable by every device on the tailnet. The tailnet is three machines, all George's, so the exposure is real but bounded. **This must never be put behind `tailscale funnel`,** which would place an unauthenticated read/write API holding real contact data on the public internet. Traffic is plain HTTP, carried inside WireGuard; it is encrypted in transit but the browser will not treat the origin as secure. Enabling HTTPS certificates in the tailnet admin console would upgrade this — it is currently off (`CertDomains: none`), which is why `serve` runs in `--http` mode.

**Operational note:** The `serve` config persists across reboots in tailscaled state, and `com.hce.graphserver` has `KeepAlive` — so the phone URL comes back on its own after a reboot, UI and data together. That is the whole reason the bundle is served from this process rather than from Vite, which runs under dev-dashboard and is not restarted by anything.

**The cost is a build step.** The phone sees `dist/`, not the working tree, so UI changes do not reach it until `npm run build` runs. Development is unchanged — Vite on 5174 with HMR, talking to `/api` on 5199 — but "it works on the desktop and not on my phone" will almost always mean a missing rebuild. The server logs which mode it is in at startup and says so when `dist/` is absent.

---

## 2026-08-15 — The Mobile Pass: Thumb Navigation, and a Board That Moves Without a Mouse

**Decision:** The UI gets a real phone layout rather than a shrunken desktop one. Navigation splits by breakpoint: the header nav stays on `sm` and up, and phones get a fixed bottom tab bar within thumb reach. Modals become bottom sheets with their own scroll region, capped in `dvh`. The two-column form grids collapse to one column below `sm`. Interactive targets are floored at 44px (`min-h-11`), the campaign board scrolls with snap points and `78vw` columns, and `viewport-fit=cover` plus `env(safe-area-inset-bottom)` keep the tab bar clear of the home indicator.

**Two fixes are load-bearing and would each have made the phone unusable on their own:**

1. **iOS Safari zooms the page whenever a focused input's text is under 16px, and does not zoom back out.** The design is `text-sm` (14px) on every field, so every tap into a form would have left the app zoomed and drifting. Inputs are forced to 16px below the `sm` breakpoint only; the desktop keeps its tighter type.
2. **Touch devices never fire HTML5 drag events, so the campaign board was read-only on the phone.** Cards now carry a native `<select>` of stages, shown only below `sm` — iOS renders it as a wheel picker. It routes through the same `handleDrop` the desktop uses, so stage-transition validation is shared and neither path can bypass it. The remove `✕` moved from a hover-gated `useState` to CSS `group-hover`, since hover does not exist on touch and the button was unreachable there.

The triage card also gets `touch-none`. Without it the browser claims the gesture — vertical panning, and the left-edge back-swipe — and the swipe that the whole triage surface is built around barely moves.

**One signal is dropped on phones rather than shrunk: the health bar leaves the People list below `sm`.** Verified at 430px, four signals per row (name, tier, readiness, health) forced the tier badge to wrap onto two lines and the names to wrap with it, which cost more than the health score was worth in a scan. Health stays on the person page and returns to the list from `sm` up. Badges are now `shrink-0 whitespace-nowrap` so the name truncates instead — the name is the thing being scanned for. Empty campaign stages also collapse to a narrow marker on phones, so a swipe is never spent on an empty column.

**Reasoning:** The tailnet URL only pays off if the app is usable one-handed next to LinkedIn and Messages, which is where the networking actually happens. A layout that technically renders at 430px but demands pinch-zoom to fill a field would have sent the work back to the desk, which is the failure this project has already demonstrated once.

**Trade-off:** Every interactive surface now carries breakpoint variants, so the class strings are longer and a future component has two layouts to keep honest rather than one. Accepted — the alternative was a second mobile-specific view tree, which would drift. The board's `<select>` is a plainer affordance than dragging and shows the full stage list including transitions the engine will reject with an alert; a picker that pre-filtered to legal stages would be better and is worth doing if the alert becomes routine.

---

## 2026-08-15 — Health as Four Dots; the Chrome Pass and What It Found

**Decision:** The continuous health bar is replaced by **four quarter-dots** (`src/components/ui/HealthDots.tsx`, replacing `HealthBar.tsx`), coloured by the same 70/35 thresholds. Fill is `Math.round(score / 25)`, so 98 reads as four dots rather than three, and a score that has genuinely reached zero shows four empty ones.

**Reasoning:** A bar invites reading a precision the number does not have — health is a decaying estimate off cadence, not a measurement, and a smoothly-filling bar implies otherwise. Four dots say "roughly three quarters" and stop. The side effect is the useful one: dots cost ~44px against the bar's stretchy 96px, which is enough to **put health back in the People list on a phone** after the mobile pass had removed it. Below `sm` the dots show without the numeric score; the score returns from `sm` up.

**Trade-off:** Resolution drops to four buckets in the list, and names truncate ~44px earlier on a phone to make room. Both accepted — the person page still carries the exact score, and health earning its place back on the phone is worth more than the last few characters of a name. Revisit if the buckets turn out to hide a decline worth acting on.

**Chrome pass.** A web app manifest (`public/manifest.webmanifest`, plus a maskable icon that keeps the glyph inside the centre 80% Chrome crops to) makes the app installable; `overscroll-behavior-y: contain` stops Chrome's pull-to-refresh from competing with the triage swipe and the campaign board. Two real inefficiencies were measured and fixed in the server rather than guessed at: assets were served **uncompressed** (395kB against 115kB gzipped) and with Express's default `max-age=0`, costing a revalidation round-trip per asset per load. The service now gzips, and fingerprinted `assets/` are `immutable` for a year while `index.html` stays `no-cache` so a rebuild still reaches the phone. Measured: 357kB → 106kB on the wire, ~108ms load.

**The finding that matters most is a constraint, not a fix. `http://georges-mac-mini.tail24407f.ts.net:8199` is not a secure context** — verified in Chrome: `isSecureContext: false`, `navigator.clipboard` undefined, service workers unavailable. Chrome will not offer "Install app" there; only `http://localhost:5199` on GDesk qualifies. **This lands directly on Layer 4.** The "app drafts, human sends" flow depends on getting a draft into LinkedIn or Messages, and the obvious mechanism — `navigator.clipboard.writeText` — does not exist on the phone origin. Any copy affordance built for the phone must fall back to `document.execCommand("copy")`, which still works in insecure contexts, or the draft has to travel some other way. The clean fix is HTTPS, and it is **free and one toggle away** — an earlier note in this log read `tailscale cert`'s "your Tailscale account does not support getting TLS certs" as a paid-tier limit, which is wrong. HTTPS certificates are enabled per-tailnet in the admin console under DNS → HTTPS Certificates; the error means the toggle is off, which `tailscale status` corroborates (`CertDomains: null`, MagicDNS already on). Tailscale Funnel requires HTTPS certificates and is documented as available on all plans, including free Personal, so certificates cannot be tier-gated. **No plan upgrade is required to fix the secure-context problem — only the toggle**, and its one real cost is that machine names get published to the public Certificate Transparency ledger.

---

## 2026-08-15 — Prepared for the Rename + HTTPS Switch

**Decision:** `server.allowedHosts` in `vite.config.ts` matches the suffix `.ts.net` rather than naming this machine. Vite treats a leading dot as "this domain and any subdomain" (`isHostAllowedInternal`), so renaming the machine cannot 403 the dev server. The exposure this widens is nil: the dev server never leaves loopback, so the only way a `*.ts.net` Host header reaches it is through `tailscale serve`.

`src/api/graph.ts` was already name-agnostic — it derives its base URL from `window.location`. So after a rename the only things needing an edit are human-facing: the dev-dashboard `deployedUrl` and the URLs written down in docs.

**Reasoning:** Renaming this machine is the mitigation for the one real cost of enabling HTTPS certificates — the certificate's subject name is published to the public Certificate Transparency ledger, permanently and append-only. Verified 2026-08-15 via Cert Spotter that `tail24407f.ts.net` currently has **zero** entries, so nothing is published yet and the choice is still free. Also verified that the exposure is narrower than it first appears: `tailscale cert` is per-machine, so only a machine that _serves_ is ever published (GLap and the phone are clients and never appear), and the published name is inert — it does not resolve on public DNS (checked against 8.8.8.8 and 1.1.1.1) and resolves internally to `100.94.123.112`, which is CGNAT and not globally routable. What lands in the ledger is a string, not an attack surface.

**The trap, recorded because it fails silently and late:** the admin console's machine-name editor has **"Auto-generate from OS hostname" ticked by default**. macOS `ComputerName` here is "George's Mac mini", which is where `georges-mac-mini` came from. Renaming while that box stays ticked reverts on the next tailscaled start — and since certificates auto-renew every 90 days, the original name would then be published _months later_, after the question looked settled. Untick the box, or change `ComputerName` too. Note the rename is Tailscale-side only: `ComputerName`, `LocalHostName`, AirDrop, and Finder are untouched.

**Also added:** `tools/tailnet-url.sh`, which reports the current MagicDNS name, the app URL, the serve config, and whether HTTPS certificates are on (read from `CertDomains`, which is empty exactly when the toggle is off). Read-only; it exists so both transitions can be checked rather than assumed.

**Trade-off:** A suffix match is broader than an explicit allowlist, and a future reader could mistake it for laziness. Accepted and documented here: the alternative is a hostname that has to be edited in lockstep with an admin-console setting, which is the kind of coupling that breaks quietly six months later.
