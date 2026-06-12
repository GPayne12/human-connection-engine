import type {
  Interaction,
  ReciprocityBalance,
  ReciprocityPeriod,
  ReciprocitySignal,
} from "../types";

const PERIOD_DAYS: Record<ReciprocityPeriod, number> = {
  month: 30,
  quarter: 91,
  year: 365,
};

const MS_PER_HOUR = 1000 * 60 * 60;

function cutoffDate(period: ReciprocityPeriod, now: Date): Date {
  return new Date(now.getTime() - PERIOD_DAYS[period] * 24 * MS_PER_HOUR);
}

function classifyBalance(
  outbound: number,
  inbound: number,
): ReciprocityBalance {
  const total = outbound + inbound;
  if (total === 0) return "balanced";
  const ratio = outbound / total;
  if (ratio > 0.6) return "giving";
  if (ratio < 0.4) return "receiving";
  return "balanced";
}

/**
 * Estimates average response latency in hours from the interaction log.
 *
 * Heuristic: for each inbound interaction, look for the next outbound
 * within 7 days. The gap is treated as a response latency. This is an
 * approximation — we cannot know whether the outbound was actually a reply.
 */
function estimateResponseLatency(interactions: Interaction[]): number | null {
  const sorted = [...interactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const latencies: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].direction !== "inbound") continue;
    const inboundTime = new Date(sorted[i].date).getTime();
    for (let j = i + 1; j < sorted.length; j++) {
      const candidate = sorted[j];
      const gap = new Date(candidate.date).getTime() - inboundTime;
      if (gap > 7 * 24 * MS_PER_HOUR) break;
      if (candidate.direction === "outbound") {
        latencies.push(gap / MS_PER_HOUR);
        break;
      }
    }
  }

  if (latencies.length === 0) return null;
  return Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length);
}

/**
 * Computes a ReciprocitySignal for a person over the given period.
 * Pure function — takes interactions as input, returns a signal object.
 * "mutual" interactions are counted as both outbound and inbound.
 */
export function computeReciprocity(
  personId: string,
  interactions: Interaction[],
  period: ReciprocityPeriod,
  now: Date = new Date(),
): ReciprocitySignal {
  const cutoff = cutoffDate(period, now);
  const inWindow = interactions.filter((i) => new Date(i.date) >= cutoff);

  let outboundCount = 0;
  let inboundCount = 0;

  for (const i of inWindow) {
    if (i.direction === "outbound" || i.direction === "mutual") outboundCount++;
    if (i.direction === "inbound" || i.direction === "mutual") inboundCount++;
  }

  return {
    personId,
    period,
    outboundCount,
    inboundCount,
    avgResponseLatencyHours: estimateResponseLatency(inWindow),
    balance: classifyBalance(outboundCount, inboundCount),
  };
}
