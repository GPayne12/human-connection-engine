import { useState } from "react";
import { snoozePerson } from "../../db";
import { useApp } from "../../context/AppContext";
import { HealthBar } from "../ui/HealthBar";
import { TierBadge } from "../ui/Badge";
import { Modal } from "../ui/Modal";
import { LogContactForm } from "../forms/LogContactForm";
import { Link } from "react-router-dom";
import type { DueItem } from "../../types";

const SNOOZE_OPTIONS = [
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
];

function daysLabel(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "yesterday";
  return `${n}d ago`;
}

function overdueLine(item: DueItem): string {
  if (item.daysOverdue <= 0) return "Due now";
  return `${item.daysOverdue}d overdue`;
}

function DueCard({
  item,
  onRefresh,
}: {
  item: DueItem;
  onRefresh: () => void;
}) {
  const [logging, setLogging] = useState(false);
  const [snoozing, setSnoozing] = useState(false);

  async function handleSnooze(days: number) {
    const until = new Date();
    until.setDate(until.getDate() + days);
    await snoozePerson(item.person.id, until);
    setSnoozing(false);
    onRefresh();
  }

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              to={`/people/${item.person.id}`}
              className="font-semibold text-slate-900 hover:text-blue-600 dark:text-slate-100 dark:hover:text-blue-400"
            >
              {item.person.name}
            </Link>
            {item.person.role && (
              <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                {item.person.role}
                {item.person.organization && ` · ${item.person.organization}`}
              </p>
            )}
          </div>
          <TierBadge tier={item.person.tier} />
        </div>

        <HealthBar score={item.healthScore} />

        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-medium text-red-500 dark:text-red-400">
            {overdueLine(item)}
          </span>
          <span>·</span>
          <span>Last contact {daysLabel(item.daysSinceContact)}</span>
        </div>

        {item.lastInteraction && (
          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm italic text-slate-600 dark:bg-slate-700/50 dark:text-slate-300">
            "{item.lastInteraction.summary}"
          </p>
        )}

        {item.person.sharedContext.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {item.person.sharedContext.map((ctx) => (
              <span
                key={ctx}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-400"
              >
                {ctx}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setLogging(true)}
            className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Log contact
          </button>
          <div className="relative">
            <button
              onClick={() => setSnoozing((v) => !v)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              Snooze
            </button>
            {snoozing && (
              <div className="absolute right-0 top-10 z-10 w-40 rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                {SNOOZE_OPTIONS.map((opt) => (
                  <button
                    key={opt.days}
                    onClick={() => handleSnooze(opt.days)}
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {logging && (
        <Modal
          title={`Log contact with ${item.person.name}`}
          onClose={() => setLogging(false)}
        >
          <LogContactForm
            person={item.person}
            onDone={() => {
              setLogging(false);
              onRefresh();
            }}
          />
        </Modal>
      )}
    </>
  );
}

export function TodayView() {
  const { dueList, loading, refresh } = useApp();

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Today
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {dueList.length === 0
              ? "You're all caught up."
              : `${dueList.length} relationship${dueList.length !== 1 ? "s" : ""} due for contact`}
          </p>
        </div>
        <Link
          to="/people/new"
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          + Add person
        </Link>
      </div>

      {dueList.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {dueList.map((item) => (
            <DueCard key={item.person.id} item={item} onRefresh={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  const { people } = useApp();
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-600">
      {people.length === 0 ? (
        <>
          <p className="font-medium text-slate-700 dark:text-slate-300">
            No relationships yet
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Add your first contact to start tracking your cadence.
          </p>
          <Link
            to="/people/new"
            className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add first person
          </Link>
        </>
      ) : (
        <>
          <p className="text-2xl">✓</p>
          <p className="mt-2 font-medium text-slate-700 dark:text-slate-300">
            All caught up
          </p>
          <p className="mt-1 text-sm text-slate-500">
            No relationships due for contact right now.
          </p>
        </>
      )}
    </div>
  );
}
