// The visible face of the campaign-readiness gate. Six pips, one per required
// field, and a plain statement of what is still missing.
//
// Law 2 guardrail: this is a progress indicator for a real gate that ends, not
// a score to farm. It counts fields on a profile, never sessions or activity,
// it cannot go down on its own, and once a person is ready it stops.

import type { ProfileReadiness } from "../../engine";
import { PROFILE_FIELD_LABELS } from "../../engine";

export function ReadinessPips({ readiness }: { readiness: ProfileReadiness }) {
  return (
    <div
      className="flex items-center gap-1"
      title={
        readiness.isReady
          ? "Campaign-ready"
          : `Still needed: ${readiness.missing.map((f) => PROFILE_FIELD_LABELS[f]).join(", ")}`
      }
    >
      {Array.from({ length: readiness.totalCount }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 w-4 rounded-full transition-colors ${
            i < readiness.filledCount
              ? readiness.isReady
                ? "bg-emerald-500"
                : "bg-blue-500"
              : "bg-slate-200 dark:bg-slate-600"
          }`}
        />
      ))}
    </div>
  );
}

/** Compact right-aligned marker for list rows. */
export function ReadinessTag({ readiness }: { readiness: ProfileReadiness }) {
  if (readiness.isReady) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        ✓ Ready
      </span>
    );
  }
  const left = readiness.missing.length;
  return (
    <span className="shrink-0 whitespace-nowrap text-xs text-slate-400">
      {left} field{left === 1 ? "" : "s"} left
    </span>
  );
}

/**
 * The full panel: pips, count, and the named fields still outstanding. Used in
 * the person form (live, against unsaved state) and on the person page.
 */
export function ReadinessPanel({
  readiness,
  name,
}: {
  readiness: ProfileReadiness;
  name?: string;
}) {
  const who = name?.trim() || "This person";

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        readiness.isReady
          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20"
          : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`text-sm font-medium ${
            readiness.isReady
              ? "text-emerald-800 dark:text-emerald-300"
              : "text-slate-700 dark:text-slate-300"
          }`}
        >
          {readiness.isReady ? "Campaign-ready" : "Profile"}
        </span>
        <div className="flex items-center gap-2">
          <ReadinessPips readiness={readiness} />
          <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {readiness.filledCount}/{readiness.totalCount}
          </span>
        </div>
      </div>

      {readiness.isReady ? (
        <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
          {who} can be placed on a campaign board.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Campaign boards need all six. Still open:
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {readiness.missing.map((field) => (
              <span
                key={field}
                className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-600"
              >
                {PROFILE_FIELD_LABELS[field]}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
