import type { CadenceRule, Interaction, Person } from "../types";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Returns days elapsed between two dates, rounded to one decimal.
 * Exported for testing.
 */
export function daysBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(b.getTime() - a.getTime()) / MS_PER_DAY);
}

/**
 * Returns the date of the most recent interaction, or the person's createdAt
 * if no interactions exist yet.
 */
export function lastContactDate(
  person: Person,
  interactions: Interaction[],
): Date {
  if (interactions.length === 0) return person.createdAt;
  return interactions.reduce(
    (latest, i) => (new Date(i.date) > latest ? new Date(i.date) : latest),
    new Date(interactions[0].date),
  );
}

/**
 * Computes a 0–100 relationship health score based on time elapsed since the
 * last contact relative to the cadence rule's max interval.
 *
 * Decay is two-phase:
 *   - 0 → intervalMin days:  100 → 70  (healthy zone, gentle slope)
 *   - intervalMin → intervalMax: 70 → 0  (due-approaching, steeper slope)
 *
 * This gives the user visual signal before they hit the hard due threshold,
 * rather than snapping from 100 to 0 at intervalMin.
 */
export function computeHealthScore(
  person: Person,
  interactions: Interaction[],
  rule: CadenceRule,
  now: Date = new Date(),
): number {
  const daysSince = daysBetween(lastContactDate(person, interactions), now);
  const { intervalMinDays, intervalMaxDays } = rule;

  if (daysSince <= 0) return 100;

  if (daysSince <= intervalMinDays) {
    // Healthy zone: 100 → 70
    const progress = daysSince / intervalMinDays;
    return Math.round(100 - progress * 30);
  }

  // Due-approaching zone: 70 → 0
  const overdueFraction =
    (daysSince - intervalMinDays) / (intervalMaxDays - intervalMinDays);
  return Math.max(0, Math.round(70 - overdueFraction * 70));
}
