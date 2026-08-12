// Shared date (de)serialization for anything that carries a Person/Interaction/
// etc across a JSON boundary — the Stage 1 export file and the Stage 2 API
// client both need it, so it lives here rather than duplicated in each.

import type {
  Person,
  Interaction,
  Campaign,
  CampaignEntry,
  Snooze,
  StageHistoryEntry,
} from "../types";

// Dates round-trip through JSON as ISO strings (JSON.stringify calls
// Date#toJSON). This restores the named keys back to Date instances so
// records read back from a file or the API match what the rest of the app
// expects.
export function reviveDates<T extends object>(
  value: T,
  dateKeys: readonly (keyof T)[],
): T {
  const revived: T = { ...value };
  for (const key of dateKeys) {
    const raw = revived[key];
    if (typeof raw === "string") {
      revived[key] = new Date(raw) as T[typeof key];
    }
  }
  return revived;
}

export function reviveStageHistory(
  history: StageHistoryEntry[],
): StageHistoryEntry[] {
  return history.map((h) => reviveDates(h, ["enteredAt"]));
}

export function revivePerson(p: Person): Person {
  return reviveDates(p, ["createdAt", "updatedAt", "lastContactDate"]);
}

export function reviveInteraction(i: Interaction): Interaction {
  return reviveDates(i, ["date", "createdAt"]);
}

export function reviveCampaign(c: Campaign): Campaign {
  return reviveDates(c, ["createdAt", "updatedAt"]);
}

export function reviveCampaignEntry(e: CampaignEntry): CampaignEntry {
  return {
    ...reviveDates(e, ["updatedAt"]),
    stageHistory: reviveStageHistory(e.stageHistory),
  };
}

export function reviveSnooze(s: Snooze): Snooze {
  return reviveDates(s, ["until"]);
}
