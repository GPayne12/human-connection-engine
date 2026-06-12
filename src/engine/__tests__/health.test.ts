import { describe, expect, it } from "vitest";
import { computeHealthScore, daysBetween, lastContactDate } from "../health";
import type { CadenceRule, Interaction, Person } from "../../types";

const rule: CadenceRule = {
  tier: "inner",
  intervalMinDays: 14,
  intervalMaxDays: 21,
};

function makePerson(createdDaysAgo: number): Person {
  const createdAt = new Date(Date.now() - createdDaysAgo * 86400_000);
  return {
    id: "p1",
    name: "Alice",
    tier: "inner",
    originStory: "",
    sharedContext: [],
    tags: [],
    notes: "",
    createdAt,
    updatedAt: createdAt,
  };
}

function makeInteraction(daysAgo: number): Interaction {
  return {
    id: "i1",
    personId: "p1",
    type: "call",
    direction: "outbound",
    date: new Date(Date.now() - daysAgo * 86400_000),
    summary: "Caught up over coffee",
    warmthDelta: 1,
    createdAt: new Date(),
  };
}

describe("daysBetween", () => {
  it("returns 0 for same date", () => {
    const d = new Date();
    expect(daysBetween(d, d)).toBe(0);
  });

  it("returns 7 for a week apart", () => {
    const a = new Date("2025-01-01");
    const b = new Date("2025-01-08");
    expect(daysBetween(a, b)).toBe(7);
  });

  it("is symmetric", () => {
    const a = new Date("2025-03-01");
    const b = new Date("2025-03-15");
    expect(daysBetween(a, b)).toBe(daysBetween(b, a));
  });
});

describe("lastContactDate", () => {
  it("falls back to createdAt when no interactions", () => {
    const person = makePerson(5);
    const result = lastContactDate(person, []);
    expect(result).toEqual(person.createdAt);
  });

  it("returns the most recent interaction date", () => {
    const person = makePerson(30);
    const older = makeInteraction(10);
    const newer = makeInteraction(3);
    const result = lastContactDate(person, [older, newer]);
    expect(result).toEqual(new Date(newer.date));
  });
});

describe("computeHealthScore", () => {
  it("returns 100 when contacted today", () => {
    const person = makePerson(0);
    const score = computeHealthScore(person, [makeInteraction(0)], rule);
    expect(score).toBe(100);
  });

  it("is in healthy zone (70–100) before intervalMin", () => {
    const person = makePerson(30);
    // 7 days since contact, intervalMin=14 → halfway through healthy zone
    const score = computeHealthScore(person, [makeInteraction(7)], rule);
    expect(score).toBeGreaterThanOrEqual(70);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("is ~70 exactly at intervalMin", () => {
    const person = makePerson(30);
    const score = computeHealthScore(person, [makeInteraction(14)], rule);
    expect(score).toBe(70);
  });

  it("decays between 0 and 70 between intervalMin and intervalMax", () => {
    const person = makePerson(30);
    // 17 days — halfway between min(14) and max(21)
    const score = computeHealthScore(person, [makeInteraction(17)], rule);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(70);
  });

  it("returns 0 at or beyond intervalMax", () => {
    const person = makePerson(60);
    expect(computeHealthScore(person, [makeInteraction(21)], rule)).toBe(0);
    expect(computeHealthScore(person, [makeInteraction(40)], rule)).toBe(0);
  });

  it("uses createdAt when there are no interactions", () => {
    // Person created 20 days ago, past intervalMax(21)? No, 20 < 21.
    // Person created 25 days ago → score should be 0.
    const person = makePerson(25);
    const score = computeHealthScore(person, [], rule);
    expect(score).toBe(0);
  });

  it("score is monotonically non-increasing as days pass", () => {
    const person = makePerson(60);
    const contactDate = makeInteraction(0).date;
    const scores = [0, 5, 10, 14, 17, 21, 30].map((daysAgo) => {
      const now = new Date(
        new Date(contactDate).getTime() + daysAgo * 86400_000,
      );
      return computeHealthScore(person, [makeInteraction(daysAgo)], rule, now);
    });
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });
});
