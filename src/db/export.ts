// Layer 5, Stage 1 — JSON export/import (PLAN.md, handoff 2026-08-12).
//
// Decrypt-on-export, re-encrypt-on-import: the file carries plaintext
// notes/originStory. The alternative — exporting ciphertext — is permanently
// undecryptable the moment the file reaches a browser with a different
// hce_field_key_v1, because the key never leaves localStorage (crypto.ts).
// A plaintext export is the only form that satisfies Law 3 ("structured to
// outlive the app and the vendor") and sidesteps that landmine entirely.

import {
  getAllPeople,
  getAllInteractions,
  getCadenceRules,
  getAllCampaigns,
  getAllCampaignEntries,
  getAllSnoozes,
  bulkImportPeople,
  bulkImportInteractions,
  bulkImportCadenceRules,
  bulkImportCampaigns,
  bulkImportCampaignEntries,
  bulkImportSnoozes,
} from "./index";
import { SCHEMA_VERSION } from "../types";
import type {
  Person,
  Interaction,
  CadenceRule,
  Campaign,
  CampaignEntry,
  Snooze,
  StageHistoryEntry,
} from "../types";

export interface ExportFile {
  schemaVersion: number;
  exportedAt: string; // ISO
  people: Person[];
  interactions: Interaction[];
  cadenceRules: CadenceRule[];
  campaigns: Campaign[];
  campaignEntries: CampaignEntry[];
  snoozes: Snooze[];
}

export class UnsupportedSchemaVersionError extends Error {
  constructor(found: number, supported: number) {
    super(
      `Export file has schemaVersion ${found}; this app supports ${supported}.`,
    );
    this.name = "UnsupportedSchemaVersionError";
  }
}

export class InvalidExportFileError extends Error {
  constructor(reason: string) {
    super(`Not a valid HCE export: ${reason}`);
    this.name = "InvalidExportFileError";
  }
}

export async function exportGraph(): Promise<ExportFile> {
  const [
    people,
    interactions,
    cadenceRules,
    campaigns,
    campaignEntries,
    snoozes,
  ] = await Promise.all([
    getAllPeople(),
    getAllInteractions(),
    getCadenceRules(),
    getAllCampaigns(),
    getAllCampaignEntries(),
    getAllSnoozes(),
  ]);

  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    people,
    interactions,
    cadenceRules,
    campaigns,
    campaignEntries,
    snoozes,
  };
}

export function serializeExport(file: ExportFile): string {
  return JSON.stringify(file, null, 2);
}

// Dates round-trip through JSON as ISO strings (JSON.stringify calls
// Date#toJSON). This restores the named keys back to Date instances so
// imported records match what the rest of the app expects.
function reviveDates<T extends object>(
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

function reviveStageHistory(history: StageHistoryEntry[]): StageHistoryEntry[] {
  return history.map((h) => reviveDates(h, ["enteredAt"]));
}

export function parseExport(raw: string): ExportFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidExportFileError("not valid JSON.");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new InvalidExportFileError("root is not an object.");
  }
  const file = parsed as Partial<ExportFile>;

  if (typeof file.schemaVersion !== "number") {
    throw new InvalidExportFileError("missing schemaVersion.");
  }
  if (file.schemaVersion !== SCHEMA_VERSION) {
    throw new UnsupportedSchemaVersionError(file.schemaVersion, SCHEMA_VERSION);
  }
  for (const key of [
    "people",
    "interactions",
    "cadenceRules",
    "campaigns",
    "campaignEntries",
    "snoozes",
  ] as const) {
    if (!Array.isArray(file[key])) {
      throw new InvalidExportFileError(`missing or malformed "${key}".`);
    }
  }

  return {
    schemaVersion: file.schemaVersion,
    exportedAt: file.exportedAt ?? new Date(0).toISOString(),
    people: file.people!.map((p) =>
      reviveDates(p, ["createdAt", "updatedAt", "lastContactDate"]),
    ),
    interactions: file.interactions!.map((i) =>
      reviveDates(i, ["date", "createdAt"]),
    ),
    cadenceRules: file.cadenceRules!,
    campaigns: file.campaigns!.map((c) =>
      reviveDates(c, ["createdAt", "updatedAt"]),
    ),
    campaignEntries: file.campaignEntries!.map((e) => ({
      ...reviveDates(e, ["updatedAt"]),
      stageHistory: reviveStageHistory(e.stageHistory),
    })),
    snoozes: file.snoozes!.map((s) => reviveDates(s, ["until"])),
  };
}

// Insert-or-replace by primary key (Dexie bulkPut) — importing the same file
// twice is safe. People first since nothing else in the app reads a row
// before its Person exists; Dexie itself does not enforce the ordering.
export async function importGraph(file: ExportFile): Promise<void> {
  await bulkImportPeople(file.people);
  await Promise.all([
    bulkImportInteractions(file.interactions),
    bulkImportCadenceRules(file.cadenceRules),
    bulkImportCampaigns(file.campaigns),
    bulkImportCampaignEntries(file.campaignEntries),
    bulkImportSnoozes(file.snoozes),
  ]);
}
