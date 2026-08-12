import type {
  CadenceRule,
  DueItem,
  Interaction,
  Person,
  Snooze,
  Tier,
} from "../types";
import { computeHealthScore, daysBetween, lastContactDate } from "./health";

function isSnoozeActive(snooze: Snooze | undefined, now: Date): boolean {
  return snooze !== undefined && new Date(snooze.until) > now;
}

function mostRecentInteraction(
  interactions: Interaction[],
): Interaction | undefined {
  if (interactions.length === 0) return undefined;
  return interactions.reduce(
    (latest, i) => (new Date(i.date) > new Date(latest.date) ? i : latest),
    interactions[0],
  );
}

/**
 * Returns true when a person should appear on the Today view.
 * "Due" means daysSinceLastContact >= intervalMin AND no active snooze.
 */
export function isDueForContact(
  person: Person,
  interactions: Interaction[],
  rule: CadenceRule,
  snooze?: Snooze,
  now: Date = new Date(),
): boolean {
  if (isSnoozeActive(snooze, now)) return false;
  const daysSince = daysBetween(lastContactDate(person, interactions), now);
  return daysSince >= rule.intervalMinDays;
}

/**
 * Builds the Today view list: all people due for contact, sorted by urgency
 * (most overdue first, then by tier weight for ties).
 *
 * Snoozed people are excluded; their DueItem is not emitted.
 */
export function getDueList(
  people: Person[],
  interactionsByPersonId: Map<string, Interaction[]>,
  rulesByTier: Map<Tier, CadenceRule>,
  snoozesByPersonId: Map<string, Snooze>,
  now: Date = new Date(),
): DueItem[] {
  const items: DueItem[] = [];

  for (const person of people) {
    const interactions = interactionsByPersonId.get(person.id) ?? [];
    const rule = rulesByTier.get(person.tier);
    if (!rule) continue;

    const snooze = snoozesByPersonId.get(person.id);
    if (!isDueForContact(person, interactions, rule, snooze, now)) continue;

    const contactDate = lastContactDate(person, interactions);
    const daysSinceContact = daysBetween(contactDate, now);
    const daysOverdue = daysSinceContact - rule.intervalMinDays;

    items.push({
      person,
      rule,
      healthScore: computeHealthScore(person, interactions, rule, now),
      daysSinceContact,
      daysOverdue,
      lastInteraction: mostRecentInteraction(interactions),
    });
  }

  // Sort: most overdue first; break ties by tier weight (inner > active > extended > dormant)
  const tierWeight: Record<Tier, number> = {
    inner: 4,
    active: 3,
    extended: 2,
    dormant: 1,
  };
  items.sort((a, b) => {
    if (b.daysOverdue !== a.daysOverdue) return b.daysOverdue - a.daysOverdue;
    return tierWeight[b.person.tier] - tierWeight[a.person.tier];
  });

  return items;
}

/**
 * Returns the timestamp at which a snoozed person will re-appear on the due list.
 * Returns undefined if no active snooze.
 */
export function snoozeExpiresAt(
  snooze: Snooze | undefined,
  now: Date = new Date(),
): Date | undefined {
  if (!isSnoozeActive(snooze, now)) return undefined;
  return new Date(snooze!.until);
}

/**
 * Days until the next person comes due, or undefined with no people.
 * Feeds the Today view's empty state so "nothing due" can say when that
 * changes instead of implying the work is done. A snoozed person's re-entry
 * is whichever is later: their cadence due date or their snooze expiry.
 */
export function daysUntilNextDue(
  people: Person[],
  interactionsByPersonId: Map<string, Interaction[]>,
  rulesByTier: Map<Tier, CadenceRule>,
  snoozesByPersonId: Map<string, Snooze>,
  now: Date = new Date(),
): number | undefined {
  let min: number | undefined;
  for (const person of people) {
    const rule = rulesByTier.get(person.tier);
    if (!rule) continue;
    const interactions = interactionsByPersonId.get(person.id) ?? [];
    const daysSince = daysBetween(lastContactDate(person, interactions), now);
    let dueIn = Math.max(0, rule.intervalMinDays - daysSince);

    const expiry = snoozeExpiresAt(snoozesByPersonId.get(person.id), now);
    if (expiry) {
      const snoozeDays = Math.ceil(
        (expiry.getTime() - now.getTime()) / 86400_000,
      );
      dueIn = Math.max(dueIn, snoozeDays);
    }

    if (min === undefined || dueIn < min) min = dueIn;
  }
  return min;
}

export { isSnoozeActive };
export type { DueItem };
