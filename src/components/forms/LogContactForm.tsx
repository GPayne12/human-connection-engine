import { useState } from "react";
import { addInteraction } from "../../db";
import { trackContactEvent } from "../../metrics";
import type {
  InteractionDirection,
  InteractionType,
  Person,
} from "../../types";

interface Props {
  person: Person;
  onDone: () => void;
}

export function LogContactForm({ person, onDone }: Props) {
  const [type, setType] = useState<InteractionType>("call");
  const [direction, setDirection] = useState<InteractionDirection>("outbound");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState("");
  const [warmthDelta, setWarmthDelta] = useState(0);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const interactionDate = new Date(date);
    await addInteraction({
      id: crypto.randomUUID(),
      personId: person.id,
      type,
      direction,
      date: interactionDate,
      summary,
      warmthDelta,
      createdAt: new Date(),
    });
    trackContactEvent({
      personId: person.id,
      type,
      timestamp: interactionDate,
    });
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Type
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as InteractionType)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          >
            <option value="call">Call</option>
            <option value="meeting">Meeting</option>
            <option value="message">Message</option>
            <option value="email">Email</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Direction
          </label>
          <select
            value={direction}
            onChange={(e) =>
              setDirection(e.target.value as InteractionDirection)
            }
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          >
            <option value="outbound">I reached out</option>
            <option value="inbound">They reached out</option>
            <option value="mutual">Mutual</option>
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Date
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Summary
        </label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="What did you talk about? What's the context to carry forward?"
          rows={3}
          required
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Warmth
        </label>
        <div className="flex gap-2">
          {([-2, -1, 0, 1, 2] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setWarmthDelta(v)}
              className={`min-h-11 flex-1 rounded-lg border py-1.5 text-sm transition-colors ${
                warmthDelta === v
                  ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-600 dark:text-slate-400"
              }`}
            >
              {v === -2
                ? "−−"
                : v === -1
                  ? "−"
                  : v === 0
                    ? "○"
                    : v === 1
                      ? "+"
                      : "++"}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Did this contact deepen or cool the relationship?
        </p>
      </div>

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={saving || !summary.trim()}
          className="min-h-12 flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Log contact"}
        </button>
      </div>
    </form>
  );
}
