import { describe, expect, it } from "vitest";
import {
  daysUntilNextDue,
  getDueList,
  isDueForContact,
  isSnoozeActive,
} from "../due";
import type {
  CadenceRule,
  Interaction,
  Person,
  Snooze,
  Tier,
} from "../../types";

const innerRule: CadenceRule = {
  tier: "inner",
  intervalMinDays: 14,
  intervalMaxDays: 21,
};
const activeRule: CadenceRule = {
  tier: "active",
  intervalMinDays: 42,
  intervalMaxDays: 56,
};

const NOW = new Date("2025-06-01T12:00:00Z");

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 86400_000);
}

function person(id: string, tier: Tier = "inner"): Person {
  const createdAt = daysAgo(60);
  return {
    id,
    name: id,
    tier,
    originStory: "",
    sharedContext: [],
    tags: [],
    notes: "",
    createdAt,
    updatedAt: createdAt,
  };
}

function interaction(personId: string, daysAgoN: number): Interaction {
  return {
    id: `i-${personId}-${daysAgoN}`,
    personId,
    type: "call",
    direction: "outbound",
    date: daysAgo(daysAgoN),
    summary: `Touch base at day -${daysAgoN}`,
    warmthDelta: 0,
    createdAt: NOW,
  };
}

describe("isSnoozeActive", () => {
  it("returns false when no snooze", () => {
    expect(isSnoozeActive(undefined, NOW)).toBe(false);
  });

  it("returns true when snooze is in the future", () => {
    const snooze: Snooze = {
      personId: "p1",
      until: new Date(NOW.getTime() + 86400_000),
    };
    expect(isSnoozeActive(snooze, NOW)).toBe(true);
  });

  it("returns false when snooze has expired", () => {
    const snooze: Snooze = {
      personId: "p1",
      until: new Date(NOW.getTime() - 1),
    };
    expect(isSnoozeActive(snooze, NOW)).toBe(false);
  });
});

describe("isDueForContact", () => {
  it("returns false when under intervalMin", () => {
    const p = person("p1");
    const interactions = [interaction("p1", 5)]; // 5 days ago, min is 14
    expect(isDueForContact(p, interactions, innerRule, undefined, NOW)).toBe(
      false,
    );
  });

  it("returns true at exactly intervalMin", () => {
    const p = person("p1");
    const interactions = [interaction("p1", 14)];
    expect(isDueForContact(p, interactions, innerRule, undefined, NOW)).toBe(
      true,
    );
  });

  it("returns true when overdue", () => {
    const p = person("p1");
    const interactions = [interaction("p1", 25)];
    expect(isDueForContact(p, interactions, innerRule, undefined, NOW)).toBe(
      true,
    );
  });

  it("returns false when snooze is active, even if overdue", () => {
    const p = person("p1");
    const interactions = [interaction("p1", 25)];
    const snooze: Snooze = {
      personId: "p1",
      until: new Date(NOW.getTime() + 86400_000),
    };
    expect(isDueForContact(p, interactions, innerRule, snooze, NOW)).toBe(
      false,
    );
  });

  it("returns true when snooze has expired and person is overdue", () => {
    const p = person("p1");
    const interactions = [interaction("p1", 20)];
    const snooze: Snooze = {
      personId: "p1",
      until: new Date(NOW.getTime() - 1),
    };
    expect(isDueForContact(p, interactions, innerRule, snooze, NOW)).toBe(true);
  });

  it("returns true for a person with no interactions past intervalMin from createdAt", () => {
    const old = new Date(NOW.getTime() - 30 * 86400_000);
    const p: Person = { ...person("p1"), createdAt: old, updatedAt: old };
    expect(isDueForContact(p, [], innerRule, undefined, NOW)).toBe(true);
  });
});

describe("getDueList", () => {
  const rules: Map<Tier, CadenceRule> = new Map([
    ["inner", innerRule],
    ["active", activeRule],
  ]);

  it("returns empty list when nobody is due", () => {
    const p = person("p1");
    const byId = new Map([["p1", [interaction("p1", 3)]]]);
    const result = getDueList([p], byId, rules, new Map(), NOW);
    expect(result).toHaveLength(0);
  });

  it("includes people who are due and excludes those who are not", () => {
    const due = person("due");
    const notDue = person("notDue");
    const byId = new Map([
      ["due", [interaction("due", 20)]],
      ["notDue", [interaction("notDue", 5)]],
    ]);
    const result = getDueList([due, notDue], byId, rules, new Map(), NOW);
    expect(result).toHaveLength(1);
    expect(result[0].person.id).toBe("due");
  });

  it("sorts most overdue first", () => {
    const p1 = person("p1");
    const p2 = person("p2");
    // p2 is more overdue (25 days vs 15 days, min=14)
    const byId = new Map([
      ["p1", [interaction("p1", 15)]],
      ["p2", [interaction("p2", 25)]],
    ]);
    const result = getDueList([p1, p2], byId, rules, new Map(), NOW);
    expect(result[0].person.id).toBe("p2");
    expect(result[1].person.id).toBe("p1");
  });

  it("excludes snoozed people", () => {
    const p = person("p1");
    const byId = new Map([["p1", [interaction("p1", 20)]]]);
    const snoozes = new Map([["p1", { personId: "p1", until: daysAgo(-3) }]]);
    const result = getDueList([p], byId, rules, snoozes, NOW);
    expect(result).toHaveLength(0);
  });

  it("includes warm-reentry context from last interaction", () => {
    const p = person("p1");
    const i = interaction("p1", 20);
    i.summary = "Discussed the Barcelona trip";
    const byId = new Map([["p1", [i]]]);
    const result = getDueList([p], byId, rules, new Map(), NOW);
    expect(result[0].lastInteraction?.summary).toBe(
      "Discussed the Barcelona trip",
    );
  });

  it("breaks ties by tier weight (inner before active)", () => {
    // Both overdue by same days, different tiers
    const innerPerson = person("inner", "inner");
    const activePerson = person("active", "active");
    const byId = new Map([
      ["inner", [interaction("inner", 16)]], // 2 days overdue (min 14)
      ["active", [interaction("active", 44)]], // 2 days overdue (min 42)
    ]);
    const result = getDueList(
      [activePerson, innerPerson],
      byId,
      rules,
      new Map(),
      NOW,
    );
    expect(result[0].person.id).toBe("inner");
  });
});

describe("daysUntilNextDue", () => {
  const rules: Map<Tier, CadenceRule> = new Map([
    ["inner", innerRule],
    ["active", activeRule],
  ]);

  it("returns undefined with no people", () => {
    expect(daysUntilNextDue([], new Map(), rules, new Map(), NOW)).toBe(
      undefined,
    );
  });

  it("counts days remaining until the cadence interval is reached", () => {
    const p = person("p1"); // inner, min 14
    const byId = new Map([["p1", [interaction("p1", 4)]]]);
    expect(daysUntilNextDue([p], byId, rules, new Map(), NOW)).toBe(10);
  });

  it("returns 0 for someone already due", () => {
    const p = person("p1");
    const byId = new Map([["p1", [interaction("p1", 20)]]]);
    expect(daysUntilNextDue([p], byId, rules, new Map(), NOW)).toBe(0);
  });

  it("returns the soonest across several people", () => {
    const a = person("a", "inner"); // min 14, contacted 4d ago -> 10
    const b = person("b", "active"); // min 42, contacted 40d ago -> 2
    const byId = new Map([
      ["a", [interaction("a", 4)]],
      ["b", [interaction("b", 40)]],
    ]);
    expect(daysUntilNextDue([a, b], byId, rules, new Map(), NOW)).toBe(2);
  });

  it("defers to snooze expiry when it falls after the cadence date", () => {
    const p = person("p1"); // already due by cadence
    const byId = new Map([["p1", [interaction("p1", 20)]]]);
    const snoozes = new Map<string, Snooze>([
      [
        "p1",
        { personId: "p1", until: new Date(NOW.getTime() + 5 * 86400_000) },
      ],
    ]);
    expect(daysUntilNextDue([p], byId, rules, snoozes, NOW)).toBe(5);
  });

  it("ignores an expired snooze", () => {
    const p = person("p1");
    const byId = new Map([["p1", [interaction("p1", 20)]]]);
    const snoozes = new Map<string, Snooze>([
      ["p1", { personId: "p1", until: new Date(NOW.getTime() - 86400_000) }],
    ]);
    expect(daysUntilNextDue([p], byId, rules, snoozes, NOW)).toBe(0);
  });

  it("skips people whose tier has no rule", () => {
    const p = person("p1", "dormant"); // no dormant rule in this map
    expect(daysUntilNextDue([p], new Map(), rules, new Map(), NOW)).toBe(
      undefined,
    );
  });
});
