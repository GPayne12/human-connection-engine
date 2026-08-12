// Stage 2 — this module's exported function signatures are unchanged from
// the Dexie/IndexedDB version (see git history). Internals now call the
// graph service (src/api/graph.ts) instead of touching a local database
// directly, which is the whole point of keeping this file the app's only
// storage seam: no component, hook, or engine file needed to change.
//
// notes/originStory now travel as plaintext between the browser and the
// service — encryption moved server-side (server/src/crypto.js). See
// DECISIONS.md, "Stage 2 — server-side field encryption".

import * as api from "../api/graph";
import {
  revivePerson,
  reviveInteraction,
  reviveCampaign,
  reviveCampaignEntry,
  reviveSnooze,
} from "./dates";
import type {
  Person,
  Interaction,
  CadenceRule,
  Campaign,
  CampaignEntry,
  CampaignStage,
  Snooze,
} from "../types";

export {
  checkHealth,
  GraphUnreachableError,
  GraphServiceError,
} from "../api/graph";

// ── Person ────────────────────────────────────────────────────────────────

export async function upsertPerson(person: Person): Promise<void> {
  await api.putPersonRaw(person.id, { ...person, updatedAt: new Date() });
}

export async function getPerson(id: string): Promise<Person | undefined> {
  const raw = await api.getPersonRaw<Person>(id);
  return raw ? revivePerson(raw) : undefined;
}

export async function getAllPeople(): Promise<Person[]> {
  const raw = await api.getAllPeopleRaw<Person>();
  return raw.map(revivePerson);
}

export async function deletePerson(id: string): Promise<void> {
  await api.deletePersonRaw(id);
}

// ── Interaction ───────────────────────────────────────────────────────────

export async function addInteraction(interaction: Interaction): Promise<void> {
  // Denormalizing lastContactDate onto Person happens server-side (POST
  // /interactions) so it stays atomic with the write, same as the old
  // single Dexie transaction did.
  await api.postInteractionRaw(interaction);
}

export async function getInteractionsForPerson(
  personId: string,
): Promise<Interaction[]> {
  const raw = await api.getInteractionsForPersonRaw<Interaction>(personId);
  return raw.map(reviveInteraction);
}

// ── CadenceRule ───────────────────────────────────────────────────────────

export async function getCadenceRules(): Promise<CadenceRule[]> {
  return api.getCadenceRulesRaw<CadenceRule>();
}

export async function upsertCadenceRule(rule: CadenceRule): Promise<void> {
  await api.putCadenceRuleRaw(rule.tier, rule);
}

// ── Campaign ──────────────────────────────────────────────────────────────

export async function upsertCampaign(campaign: Campaign): Promise<void> {
  await api.putCampaignRaw(campaign.id, { ...campaign, updatedAt: new Date() });
}

export async function getAllCampaigns(): Promise<Campaign[]> {
  const raw = await api.getAllCampaignsRaw<Campaign>();
  return raw.map(reviveCampaign);
}

export async function deleteCampaign(id: string): Promise<void> {
  await api.deleteCampaignRaw(id);
}

// ── CampaignEntry ─────────────────────────────────────────────────────────

export async function upsertCampaignEntry(entry: CampaignEntry): Promise<void> {
  await api.putCampaignEntryRaw(entry.id, { ...entry, updatedAt: new Date() });
}

export async function getCampaignEntries(
  campaignId: string,
): Promise<CampaignEntry[]> {
  const raw = await api.getCampaignEntriesRaw<CampaignEntry>(campaignId);
  return raw.map(reviveCampaignEntry);
}

export async function advanceCampaignEntryStage(
  entryId: string,
  toStage: CampaignStage,
  note?: string,
): Promise<void> {
  await api.advanceCampaignEntryRaw(entryId, toStage, note);
}

export async function deleteCampaignEntry(id: string): Promise<void> {
  await api.deleteCampaignEntryRaw(id);
}

// ── Snooze ────────────────────────────────────────────────────────────────

export async function snoozePerson(
  personId: string,
  until: Date,
): Promise<void> {
  await api.putSnoozeRaw(personId, { personId, until });
}

export async function clearSnooze(personId: string): Promise<void> {
  await api.clearSnoozeRaw(personId);
}

export async function getSnooze(personId: string): Promise<Snooze | undefined> {
  const raw = await api.getSnoozeRaw<Snooze>(personId);
  return raw ? reviveSnooze(raw) : undefined;
}

export async function getAllSnoozes(): Promise<Snooze[]> {
  const raw = await api.getAllSnoozesRaw<Snooze>();
  return raw.map(reviveSnooze);
}

// ── Bulk loaders (used by the app context to populate Maps) ───────────────────

export async function getAllInteractions(): Promise<Interaction[]> {
  const raw = await api.getAllInteractionsRaw<Interaction>();
  return raw.map(reviveInteraction);
}

export async function getAllCampaignEntries(): Promise<CampaignEntry[]> {
  const raw = await api.getAllCampaignEntriesRaw<CampaignEntry>();
  return raw.map(reviveCampaignEntry);
}

export async function deleteInteraction(id: string): Promise<void> {
  await api.deleteInteractionRaw(id);
}

// ── Bulk import (Layer 5) ────────────────────────────────────────────────────
// Raw writes for restoring an export file: no updatedAt stamping, no
// denormalization side effects, because an import should reproduce the
// file's records exactly. The service's bulk routes are insert-or-replace
// by primary key, so re-running an import is safe.

export async function bulkImportPeople(people: Person[]): Promise<void> {
  await api.bulkPutPeopleRaw(people);
}

export async function bulkImportInteractions(
  interactions: Interaction[],
): Promise<void> {
  await api.bulkPutInteractionsRaw(interactions);
}

export async function bulkImportCadenceRules(
  rules: CadenceRule[],
): Promise<void> {
  await api.bulkPutCadenceRulesRaw(rules);
}

export async function bulkImportCampaigns(
  campaigns: Campaign[],
): Promise<void> {
  await api.bulkPutCampaignsRaw(campaigns);
}

export async function bulkImportCampaignEntries(
  entries: CampaignEntry[],
): Promise<void> {
  await api.bulkPutCampaignEntriesRaw(entries);
}

export async function bulkImportSnoozes(snoozes: Snooze[]): Promise<void> {
  await api.bulkPutSnoozesRaw(snoozes);
}
