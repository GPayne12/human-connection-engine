// Relationship health as four quarter-dots rather than a continuous bar.
//
// A bar invites reading a precision the score does not have — health is a
// decaying estimate off cadence, not a measurement. Four dots say "roughly
// three quarters healthy" and stop there, and they cost ~44px instead of a
// stretchy bar, which is what lets health stay on the People list on a phone.

const DOTS = 4;

function colorClass(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 35) return "bg-amber-400";
  return "bg-red-500";
}

// Round rather than floor: 98 should read as four dots, not three. A score
// that has genuinely hit zero shows four empty dots, which is the point.
function filledDots(score: number): number {
  return Math.max(0, Math.min(DOTS, Math.round(score / (100 / DOTS))));
}

export function HealthDots({
  score,
  showScore = true,
}: {
  score: number;
  showScore?: boolean;
}) {
  const filled = filledDots(score);
  const on = colorClass(score);

  return (
    <div
      className="flex items-center gap-2"
      title={`Relationship health ${score} of 100`}
      role="img"
      aria-label={`Relationship health ${score} out of 100`}
    >
      <div className="flex shrink-0 gap-1" aria-hidden="true">
        {Array.from({ length: DOTS }, (_, i) => (
          <span
            key={i}
            className={`size-2 rounded-full ${
              i < filled ? on : "bg-slate-200 dark:bg-slate-700"
            }`}
          />
        ))}
      </div>
      {showScore && (
        <span className="w-7 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
          {score}
        </span>
      )}
    </div>
  );
}
