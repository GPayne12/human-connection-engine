import { describe, expect, it } from "vitest";
import {
  isCampaignReady,
  meaningfulTags,
  nearlyReady,
  profileReadiness,
  REQUIRED_PROFILE_FIELDS,
} from "../readiness";
import type { Person } from "../../types";

const NOW = new Date("2026-08-13T00:00:00Z");

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: crypto.randomUUID(),
    name: "Dana Reyes",
    role: "Director of Learning",
    organization: "Pearson",
    tier: "active",
    originStory: "Met at the 2024 accessibility working group.",
    sharedContext: [],
    tags: ["mentor"],
    notes: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("profileReadiness", () => {
  it("marks a fully populated profile ready", () => {
    const r = profileReadiness(person());
    expect(r.isReady).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.filledCount).toBe(REQUIRED_PROFILE_FIELDS.length);
  });

  it("does not require sharedContext or notes", () => {
    expect(isCampaignReady(person({ sharedContext: [], notes: "" }))).toBe(
      true,
    );
  });

  it.each<[string, Partial<Person>]>([
    ["role", { role: undefined }],
    ["organization", { organization: undefined }],
    ["originStory", { originStory: "" }],
    ["tags", { tags: [] }],
  ])("blocks a profile missing %s", (field, overrides) => {
    const r = profileReadiness(person(overrides));
    expect(r.isReady).toBe(false);
    expect(r.missing).toContain(field);
  });

  it("treats whitespace-only fields as empty", () => {
    const r = profileReadiness(person({ role: "   ", originStory: "\n " }));
    expect(r.missing).toEqual(["role", "originStory"]);
  });

  it("counts filled and missing to the same total", () => {
    const r = profileReadiness(person({ role: undefined, tags: [] }));
    expect(r.filledCount).toBe(4);
    expect(r.missing).toHaveLength(2);
    expect(r.filled.length + r.missing.length).toBe(r.totalCount);
  });

  it("reports missing fields in form order", () => {
    const r = profileReadiness({ name: "Dana" });
    expect(r.missing).toEqual([
      "role",
      "organization",
      "tier",
      "originStory",
      "tags",
    ]);
  });

  it("accepts unsaved form state", () => {
    expect(
      isCampaignReady({
        name: "Dana",
        role: "Director",
        organization: "Pearson",
        tier: "active",
        originStory: "Met at a conference.",
        tags: ["mentor"],
      }),
    ).toBe(true);
  });
});

describe("provenance tags", () => {
  it("does not let the importer's own tag satisfy the tags requirement", () => {
    const imported = person({ tags: ["linkedin-import"] });
    expect(profileReadiness(imported).missing).toEqual(["tags"]);
  });

  it("counts a real tag alongside the provenance stamp", () => {
    const sorted = person({
      tags: ["linkedin-import", "instructional-design"],
    });
    expect(isCampaignReady(sorted)).toBe(true);
  });

  it("ignores provenance tags case-insensitively", () => {
    expect(meaningfulTags(["LinkedIn-Import"])).toEqual([]);
  });

  it("drops blank tags", () => {
    expect(meaningfulTags(["  ", "mentor"])).toEqual(["mentor"]);
  });

  it("tolerates a missing tags array", () => {
    expect(meaningfulTags(undefined)).toEqual([]);
  });
});

describe("nearlyReady", () => {
  it("excludes people who are already ready", () => {
    const queue = nearlyReady([person({ name: "Ready Rita" })]);
    expect(queue).toEqual([]);
  });

  it("orders by fewest missing fields first", () => {
    const oneAway = person({ name: "One Away", tags: [] });
    const threeAway = person({
      name: "Three Away",
      role: undefined,
      organization: undefined,
      tags: [],
    });
    const queue = nearlyReady([threeAway, oneAway]);
    expect(queue.map((p) => p.name)).toEqual(["One Away", "Three Away"]);
  });

  it("breaks ties by name", () => {
    const a = person({ name: "Abel Stone", tags: [] });
    const z = person({ name: "Zoe Park", tags: [] });
    expect(nearlyReady([z, a]).map((p) => p.name)).toEqual([
      "Abel Stone",
      "Zoe Park",
    ]);
  });
});
