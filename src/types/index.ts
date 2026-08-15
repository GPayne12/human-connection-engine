// Schema version — bump when any entity shape changes. Stamped into every
// export (src/db/export.ts); migrations belong in the graph service's store
// (server/src/store.js), not in the client, since Stage 2 moved the data there.
export const SCHEMA_VERSION = 1;

// ── Tiers ────────────────────────────────────────────────────────────────────

export type Tier = "inner" | "active" | "extended" | "dormant";

// ── Person ───────────────────────────────────────────────────────────────────
// The node. Every other entity is anchored to a Person.

export interface Person {
  id: string;
  name: string;
  role?: string;
  organization?: string;
  tier: Tier;
  // How you met. Irreplaceable — AI cannot regenerate this. Encrypted at rest.
  originStory: string;
  // Ongoing shared threads: projects, interests, mutual connections.
  sharedContext: string[];
  // Denormalized from Interaction for fast sort; updated on every interaction write.
  lastContactDate?: Date;
  tags: string[];
  // Free-form sensitive notes. Encrypted at rest.
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Interaction ───────────────────────────────────────────────────────────────
// A single human contact event — the atom of the cadence engine.

export type InteractionType =
  | "message"
  | "call"
  | "meeting"
  | "email"
  | "other";
export type InteractionDirection = "outbound" | "inbound" | "mutual";

export interface Interaction {
  id: string;
  personId: string;
  type: InteractionType;
  direction: InteractionDirection;
  date: Date;
  summary: string;
  // +2 deepened significantly, +1 warm, 0 neutral, -1 slightly cool, -2 strained
  warmthDelta: number;
  createdAt: Date;
}

// ── CadenceRule ───────────────────────────────────────────────────────────────
// Per-tier contact rhythm. One row per tier; these are defaults the user can edit.

export interface CadenceRule {
  tier: Tier; // primary key
  intervalMinDays: number;
  intervalMaxDays: number;
}

export const DEFAULT_CADENCE_RULES: CadenceRule[] = [
  { tier: "inner", intervalMinDays: 14, intervalMaxDays: 21 },
  { tier: "active", intervalMinDays: 42, intervalMaxDays: 56 },
  { tier: "extended", intervalMinDays: 84, intervalMaxDays: 91 },
  { tier: "dormant", intervalMinDays: 180, intervalMaxDays: 365 },
];

// ── Campaign ──────────────────────────────────────────────────────────────────
// A goal-driven outreach effort (e.g., job search, partnership, reconnect push).
// The lifecycle models intentional, bounded outreach — not a spray-and-pray list.

export type CampaignStage =
  | "research"
  | "warmup"
  | "ask"
  | "nurture"
  | "closed"
  | "recycled";

export interface Campaign {
  id: string;
  name: string;
  goal: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── CampaignEntry ─────────────────────────────────────────────────────────────
// Junction: one person's position within one campaign.

export interface StageHistoryEntry {
  stage: CampaignStage;
  enteredAt: Date;
  note?: string;
}

export interface CampaignEntry {
  id: string;
  campaignId: string;
  personId: string;
  currentStage: CampaignStage;
  stageHistory: StageHistoryEntry[];
  updatedAt: Date;
}

// ── ReciprocitySignal ─────────────────────────────────────────────────────────
// Derived by the cadence engine from Interaction records — not stored in DB.
// Surfaced in the UI to prompt reflection, never to judge.

export type ReciprocityBalance = "giving" | "balanced" | "receiving";
export type ReciprocityPeriod = "month" | "quarter" | "year";

export interface ReciprocitySignal {
  personId: string;
  period: ReciprocityPeriod;
  outboundCount: number;
  inboundCount: number;
  avgResponseLatencyHours: number | null;
  balance: ReciprocityBalance;
}

// ── Snooze ────────────────────────────────────────────────────────────────────
// Temporarily suppresses a person from the due list. Stored in IndexedDB.
// The engine respects it as a pure input — it does not read from DB directly.

export interface Snooze {
  personId: string; // primary key
  until: Date;
}

// ── DueItem ───────────────────────────────────────────────────────────────────
// Engine output for the Today view. Everything needed to act without navigating away.

export interface DueItem {
  person: Person;
  rule: CadenceRule;
  healthScore: number; // 0–100
  daysSinceContact: number;
  daysOverdue: number; // days past intervalMin; negative = not yet due
  lastInteraction?: Interaction; // warm-reentry context
}

// ── Encrypted field wrapper ───────────────────────────────────────────────────
// Stored as-is in IndexedDB; the crypto module handles serialization.

export interface EncryptedField {
  iv: string; // base64
  ciphertext: string; // base64
}
