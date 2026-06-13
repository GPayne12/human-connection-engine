import type { Tier } from "../../types";

const TIER_STYLES: Record<Tier, string> = {
  inner:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  active: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  extended: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  dormant: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const TIER_LABELS: Record<Tier, string> = {
  inner: "Inner circle",
  active: "Active network",
  extended: "Extended",
  dormant: "Dormant",
};

export function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TIER_STYLES[tier]}`}
    >
      {TIER_LABELS[tier]}
    </span>
  );
}
