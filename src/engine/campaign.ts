import type { CampaignEntry, CampaignStage, StageHistoryEntry } from "../types";
import { daysBetween } from "./health";

// Valid forward transitions for each stage.
// The map is intentionally exhaustive — unlisted targets are illegal.
const TRANSITIONS: Record<CampaignStage, CampaignStage[]> = {
  research: ["warmup", "closed"],
  warmup: ["ask", "nurture", "closed"],
  ask: ["nurture", "closed", "recycled"],
  nurture: ["ask", "closed", "recycled"],
  closed: ["recycled"],
  // recycled → research allows restarting a relationship arc
  recycled: ["research"],
};

export class InvalidStageTransitionError extends Error {
  constructor(from: CampaignStage, to: CampaignStage) {
    super(`Invalid campaign transition: ${from} → ${to}`);
    this.name = "InvalidStageTransitionError";
  }
}

/**
 * Pure FSM: returns a new CampaignEntry with the stage advanced.
 * Throws InvalidStageTransitionError for illegal transitions.
 * Does NOT write to the database — the caller is responsible for persisting.
 */
export function advanceCampaignStage(
  entry: CampaignEntry,
  toStage: CampaignStage,
  now: Date = new Date(),
  note?: string,
): CampaignEntry {
  const allowed = TRANSITIONS[entry.currentStage];
  if (!allowed.includes(toStage)) {
    throw new InvalidStageTransitionError(entry.currentStage, toStage);
  }

  const historyEntry: StageHistoryEntry = {
    stage: entry.currentStage,
    enteredAt: entry.updatedAt,
    note,
  };

  return {
    ...entry,
    currentStage: toStage,
    stageHistory: [...entry.stageHistory, historyEntry],
    updatedAt: now,
  };
}

/**
 * Returns all valid next stages from the current stage.
 * Used by the UI to populate the "move to" dropdown.
 */
export function validNextStages(currentStage: CampaignStage): CampaignStage[] {
  return TRANSITIONS[currentStage];
}

/**
 * Returns true when the campaign entry is in a terminal state that
 * should no longer appear in active views.
 */
export function isTerminalStage(stage: CampaignStage): boolean {
  return stage === "closed" || stage === "recycled";
}

/**
 * Days since the entry moved into its current stage. `updatedAt` only ever
 * changes on creation or a stage transition (see advanceCampaignEntryStage),
 * so it doubles as "entered current stage at" without a dedicated field.
 *
 * The campaign board has no staleness signal today — cadence rules are
 * calibrated for relationship maintenance (extended = 84-91 days), far too
 * slow for an active campaign, and the due list has no notion of campaigns
 * at all. This is the "days in current stage" count the Stage 2 roadmap
 * flagged as the most valuable next increment once the graph moved off
 * per-browser storage.
 */
export function daysInCurrentStage(
  entry: CampaignEntry,
  now: Date = new Date(),
): number {
  return daysBetween(entry.updatedAt, now);
}
