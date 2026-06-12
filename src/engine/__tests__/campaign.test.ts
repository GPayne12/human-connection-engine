import { describe, expect, it } from "vitest";
import {
  advanceCampaignStage,
  InvalidStageTransitionError,
  isTerminalStage,
  validNextStages,
} from "../campaign";
import type { CampaignEntry, CampaignStage } from "../../types";

function entry(stage: CampaignStage): CampaignEntry {
  const now = new Date("2025-01-01T00:00:00Z");
  return {
    id: "e1",
    campaignId: "c1",
    personId: "p1",
    currentStage: stage,
    stageHistory: [],
    updatedAt: now,
  };
}

const NOW = new Date("2025-06-01T00:00:00Z");

describe("advanceCampaignStage", () => {
  it("advances research → warmup", () => {
    const result = advanceCampaignStage(entry("research"), "warmup", NOW);
    expect(result.currentStage).toBe("warmup");
  });

  it("appends previous stage to stageHistory", () => {
    const result = advanceCampaignStage(entry("research"), "warmup", NOW);
    expect(result.stageHistory).toHaveLength(1);
    expect(result.stageHistory[0].stage).toBe("research");
  });

  it("preserves full history across multiple transitions", () => {
    const e1 = advanceCampaignStage(entry("research"), "warmup", NOW);
    const e2 = advanceCampaignStage(e1, "ask", NOW);
    const e3 = advanceCampaignStage(e2, "nurture", NOW);
    expect(e3.stageHistory).toHaveLength(3);
    expect(e3.stageHistory.map((h) => h.stage)).toEqual([
      "research",
      "warmup",
      "ask",
    ]);
  });

  it("attaches optional note to history entry", () => {
    const result = advanceCampaignStage(
      entry("research"),
      "warmup",
      NOW,
      "intro email sent",
    );
    expect(result.stageHistory[0].note).toBe("intro email sent");
  });

  it("updates updatedAt", () => {
    const result = advanceCampaignStage(entry("research"), "warmup", NOW);
    expect(result.updatedAt).toEqual(NOW);
  });

  it("does not mutate the original entry", () => {
    const original = entry("research");
    advanceCampaignStage(original, "warmup", NOW);
    expect(original.currentStage).toBe("research");
    expect(original.stageHistory).toHaveLength(0);
  });

  it("allows recycled → research (restart)", () => {
    const result = advanceCampaignStage(entry("recycled"), "research", NOW);
    expect(result.currentStage).toBe("research");
  });

  it("throws InvalidStageTransitionError for illegal transition", () => {
    expect(() =>
      advanceCampaignStage(entry("research"), "ask", NOW),
    ).toThrowError(InvalidStageTransitionError);
  });

  it("throws for warmup → research (no going back)", () => {
    expect(() =>
      advanceCampaignStage(entry("warmup"), "research", NOW),
    ).toThrowError(InvalidStageTransitionError);
  });

  it("throws for closed → ask", () => {
    expect(() =>
      advanceCampaignStage(entry("closed"), "ask", NOW),
    ).toThrowError(InvalidStageTransitionError);
  });
});

describe("validNextStages", () => {
  it("returns correct options for research", () => {
    expect(validNextStages("research")).toEqual(["warmup", "closed"]);
  });

  it("returns correct options for warmup", () => {
    expect(validNextStages("warmup")).toEqual(["ask", "nurture", "closed"]);
  });

  it("returns recycled as only option for closed", () => {
    expect(validNextStages("closed")).toEqual(["recycled"]);
  });
});

describe("isTerminalStage", () => {
  it("returns true for closed and recycled", () => {
    expect(isTerminalStage("closed")).toBe(true);
    expect(isTerminalStage("recycled")).toBe(true);
  });

  it("returns false for active stages", () => {
    (["research", "warmup", "ask", "nurture"] as CampaignStage[]).forEach(
      (s) => {
        expect(isTerminalStage(s)).toBe(false);
      },
    );
  });
});
