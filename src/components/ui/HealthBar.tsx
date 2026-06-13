function colorClass(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 35) return "bg-amber-400";
  return "bg-red-500";
}

export function HealthBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-1.5 rounded-full transition-all ${colorClass(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="w-7 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
        {score}
      </span>
    </div>
  );
}
