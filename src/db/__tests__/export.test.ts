import { describe, expect, it } from "vitest";
import {
  InvalidExportFileError,
  UnsupportedSchemaVersionError,
  parseExport,
  serializeExport,
  type ExportFile,
} from "../export";
import { SCHEMA_VERSION } from "../../types";
import type { Person, Interaction, CampaignEntry } from "../../types";

function makePerson(): Person {
  const now = new Date("2026-08-01T12:00:00.000Z");
  return {
    id: "p1",
    name: "Alice",
    tier: "inner",
    originStory: "Met at a conference",
    sharedContext: ["AI in L&D"],
    lastContactDate: now,
    tags: ["mentor"],
    notes: "Prefers email",
    createdAt: now,
    updatedAt: now,
  };
}

function makeInteraction(): Interaction {
  return {
    id: "i1",
    personId: "p1",
    type: "call",
    direction: "outbound",
    date: new Date("2026-08-01T12:00:00.000Z"),
    summary: "Caught up",
    warmthDelta: 1,
    createdAt: new Date("2026-08-01T12:00:00.000Z"),
  };
}

function makeCampaignEntry(): CampaignEntry {
  const now = new Date("2026-08-01T12:00:00.000Z");
  return {
    id: "e1",
    campaignId: "c1",
    personId: "p1",
    currentStage: "warmup",
    stageHistory: [{ stage: "research", enteredAt: now, note: "started" }],
    updatedAt: now,
  };
}

function makeFile(): ExportFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: "2026-08-12T00:00:00.000Z",
    people: [makePerson()],
    interactions: [makeInteraction()],
    cadenceRules: [{ tier: "inner", intervalMinDays: 14, intervalMaxDays: 21 }],
    campaigns: [
      {
        id: "c1",
        name: "AI-era L&D leadership",
        goal: "Land a role",
        notes: "",
        createdAt: new Date("2026-08-01T12:00:00.000Z"),
        updatedAt: new Date("2026-08-01T12:00:00.000Z"),
      },
    ],
    campaignEntries: [makeCampaignEntry()],
    snoozes: [{ personId: "p1", until: new Date("2026-09-01T00:00:00.000Z") }],
  };
}

describe("serializeExport / parseExport round-trip", () => {
  it("preserves plain fields", () => {
    const file = makeFile();
    const parsed = parseExport(serializeExport(file));
    expect(parsed.people[0].name).toBe("Alice");
    expect(parsed.people[0].notes).toBe("Prefers email");
    expect(parsed.interactions[0].summary).toBe("Caught up");
  });

  it("restores Date instances on Person, Interaction, Campaign, CampaignEntry, Snooze", () => {
    const parsed = parseExport(serializeExport(makeFile()));
    expect(parsed.people[0].createdAt).toBeInstanceOf(Date);
    expect(parsed.people[0].lastContactDate).toBeInstanceOf(Date);
    expect(parsed.interactions[0].date).toBeInstanceOf(Date);
    expect(parsed.campaigns[0].updatedAt).toBeInstanceOf(Date);
    expect(parsed.campaignEntries[0].updatedAt).toBeInstanceOf(Date);
    expect(parsed.campaignEntries[0].stageHistory[0].enteredAt).toBeInstanceOf(
      Date,
    );
    expect(parsed.snoozes[0].until).toBeInstanceOf(Date);
  });

  it("round-trips timestamps exactly", () => {
    const original = makeFile();
    const parsed = parseExport(serializeExport(original));
    expect(parsed.people[0].createdAt.getTime()).toBe(
      original.people[0].createdAt.getTime(),
    );
  });

  it("handles an optional lastContactDate that is absent", () => {
    const file = makeFile();
    file.people[0].lastContactDate = undefined;
    const parsed = parseExport(serializeExport(file));
    expect(parsed.people[0].lastContactDate).toBeUndefined();
  });
});

describe("parseExport validation", () => {
  it("rejects invalid JSON", () => {
    expect(() => parseExport("not json")).toThrow(InvalidExportFileError);
  });

  it("rejects a JSON array at the root", () => {
    expect(() => parseExport("[]")).toThrow(InvalidExportFileError);
  });

  it("rejects a file missing schemaVersion", () => {
    const rest: Record<string, unknown> = { ...makeFile() };
    delete rest.schemaVersion;
    expect(() => parseExport(JSON.stringify(rest))).toThrow(
      InvalidExportFileError,
    );
  });

  it("rejects a file with an unsupported schemaVersion", () => {
    const file = { ...makeFile(), schemaVersion: SCHEMA_VERSION + 1 };
    expect(() => parseExport(JSON.stringify(file))).toThrow(
      UnsupportedSchemaVersionError,
    );
  });

  it("rejects a file with a malformed entity array", () => {
    const file = { ...makeFile(), people: "not an array" };
    expect(() => parseExport(JSON.stringify(file))).toThrow(
      InvalidExportFileError,
    );
  });
});
