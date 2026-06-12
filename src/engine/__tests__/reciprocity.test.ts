import { describe, expect, it } from "vitest";
import { computeReciprocity } from "../reciprocity";
import type { Interaction } from "../../types";

const NOW = new Date("2025-06-01T12:00:00Z");

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 86400_000);
}

function i(
  id: string,
  direction: Interaction["direction"],
  daysAgoN: number,
): Interaction {
  return {
    id,
    personId: "p1",
    type: "call",
    direction,
    date: daysAgo(daysAgoN),
    summary: "",
    warmthDelta: 0,
    createdAt: NOW,
  };
}

describe("computeReciprocity", () => {
  it("returns balanced with no interactions", () => {
    const sig = computeReciprocity("p1", [], "month", NOW);
    expect(sig.balance).toBe("balanced");
    expect(sig.outboundCount).toBe(0);
    expect(sig.inboundCount).toBe(0);
    expect(sig.avgResponseLatencyHours).toBeNull();
  });

  it("classifies all-outbound as giving", () => {
    const interactions = [
      i("a", "outbound", 5),
      i("b", "outbound", 10),
      i("c", "outbound", 15),
    ];
    const sig = computeReciprocity("p1", interactions, "month", NOW);
    expect(sig.balance).toBe("giving");
    expect(sig.outboundCount).toBe(3);
    expect(sig.inboundCount).toBe(0);
  });

  it("classifies all-inbound as receiving", () => {
    const interactions = [i("a", "inbound", 5), i("b", "inbound", 10)];
    const sig = computeReciprocity("p1", interactions, "month", NOW);
    expect(sig.balance).toBe("receiving");
  });

  it("classifies 50/50 split as balanced", () => {
    const interactions = [i("a", "outbound", 5), i("b", "inbound", 10)];
    const sig = computeReciprocity("p1", interactions, "month", NOW);
    expect(sig.balance).toBe("balanced");
  });

  it("counts mutual interactions as both outbound and inbound", () => {
    const interactions = [i("a", "mutual", 5)];
    const sig = computeReciprocity("p1", interactions, "month", NOW);
    expect(sig.outboundCount).toBe(1);
    expect(sig.inboundCount).toBe(1);
  });

  it("filters out interactions outside the period window", () => {
    const interactions = [
      i("old", "outbound", 45), // outside month window
      i("new", "inbound", 5), // inside
    ];
    const sig = computeReciprocity("p1", interactions, "month", NOW);
    // Only the inbound survives filtering
    expect(sig.outboundCount).toBe(0);
    expect(sig.inboundCount).toBe(1);
    expect(sig.balance).toBe("receiving");
  });

  it("includes all interactions within the quarter window", () => {
    const interactions = [
      i("a", "outbound", 45), // outside month, inside quarter
      i("b", "inbound", 5),
    ];
    const sig = computeReciprocity("p1", interactions, "quarter", NOW);
    expect(sig.outboundCount).toBe(1);
    expect(sig.inboundCount).toBe(1);
  });

  it("estimates response latency when outbound follows inbound within 7 days", () => {
    const interactions = [
      i("in", "inbound", 10), // inbound 10 days ago
      i("out", "outbound", 9), // outbound 1 day later = 24h latency
    ];
    const sig = computeReciprocity("p1", interactions, "month", NOW);
    expect(sig.avgResponseLatencyHours).not.toBeNull();
    expect(sig.avgResponseLatencyHours).toBeGreaterThan(0);
  });

  it("returns null latency when no outbound follows an inbound within 7 days", () => {
    const interactions = [
      i("in", "inbound", 10),
      i("out", "outbound", 2), // 8 days later — outside the 7-day window
    ];
    const sig = computeReciprocity("p1", interactions, "month", NOW);
    expect(sig.avgResponseLatencyHours).toBeNull();
  });

  it("attaches correct personId and period to the signal", () => {
    const sig = computeReciprocity("alice", [], "year", NOW);
    expect(sig.personId).toBe("alice");
    expect(sig.period).toBe("year");
  });
});
