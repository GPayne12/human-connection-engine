// Profile readiness — the gate between "a name in the graph" and "someone the
// practice is actually working."
//
// This generalizes the origin-story toll gate (DECISIONS.md 2026-08-12). That
// gate asked for one field; triage proved the harder, more valuable hurdle is
// the whole profile. Six fields of the eight on Person are required — a
// majority — and `sharedContext` and `notes` stay optional.
//
// Pure: no DB, no React. Same contract as every other module in src/engine.

import type { Person, Tier } from "../types";

export type ProfileField =
  | "name"
  | "role"
  | "organization"
  | "tier"
  | "originStory"
  | "tags";

// Order matters — it is the order the UI lists what's still missing, and it
// mirrors the field order in PersonForm so "what's left" reads top to bottom.
export const REQUIRED_PROFILE_FIELDS: ProfileField[] = [
  "name",
  "role",
  "organization",
  "tier",
  "originStory",
  "tags",
];

export const PROFILE_FIELD_LABELS: Record<ProfileField, string> = {
  name: "Name",
  role: "Role",
  organization: "Org",
  tier: "Relationship",
  originStory: "Origin story",
  tags: "Tags",
};

// The importer stamps every bulk-imported contact with a provenance tag
// (src/db/linkedin.ts). It records where a row came from — it is not a human
// judgment about the person, so it must not satisfy the tags requirement or
// the gate would open itself for the entire import.
export const PROVENANCE_TAGS = new Set(["linkedin-import"]);

/** Tags George applied himself — provenance stamps don't count. */
export function meaningfulTags(tags: string[] | undefined): string[] {
  return (tags ?? [])
    .map((t) => t.trim())
    .filter((t) => t && !PROVENANCE_TAGS.has(t.toLowerCase()));
}

// Accepts unsaved form state as well as a stored Person, so the form can show
// live progress against the same rule the board enforces.
export interface ProfileDraft {
  name?: string;
  role?: string;
  organization?: string;
  tier?: Tier;
  originStory?: string;
  tags?: string[];
}

export interface ProfileReadiness {
  filled: ProfileField[];
  missing: ProfileField[];
  filledCount: number;
  totalCount: number;
  /** Every required field populated — eligible for a campaign board. */
  isReady: boolean;
}

function isFilled(person: ProfileDraft, field: ProfileField): boolean {
  switch (field) {
    case "tier":
      return Boolean(person.tier);
    case "tags":
      return meaningfulTags(person.tags).length > 0;
    default:
      return Boolean(person[field]?.trim());
  }
}

export function profileReadiness(person: ProfileDraft): ProfileReadiness {
  const filled: ProfileField[] = [];
  const missing: ProfileField[] = [];
  for (const field of REQUIRED_PROFILE_FIELDS) {
    (isFilled(person, field) ? filled : missing).push(field);
  }
  return {
    filled,
    missing,
    filledCount: filled.length,
    totalCount: REQUIRED_PROFILE_FIELDS.length,
    isReady: missing.length === 0,
  };
}

/** The campaign-board eligibility test. */
export function isCampaignReady(person: ProfileDraft): boolean {
  return profileReadiness(person).isReady;
}

/**
 * People sorted by how close they are to ready, nearest first — the queue for
 * finishing profiles. Already-ready people are excluded; there is nothing left
 * to do to them.
 */
export function nearlyReady(people: Person[]): Person[] {
  return people
    .map((person) => ({ person, readiness: profileReadiness(person) }))
    .filter(({ readiness }) => !readiness.isReady)
    .sort(
      (a, b) =>
        a.readiness.missing.length - b.readiness.missing.length ||
        a.person.name.localeCompare(b.person.name),
    )
    .map(({ person }) => person);
}
