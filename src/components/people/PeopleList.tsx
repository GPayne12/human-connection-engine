import { useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { TierBadge } from "../ui/Badge";
import { HealthBar } from "../ui/HealthBar";
import { computeHealthScore } from "../../engine";
import type { Tier } from "../../types";

const TIER_ORDER: Tier[] = ["inner", "active", "extended", "dormant"];

export function PeopleList() {
  const { people, interactionsByPersonId, rulesByTier, loading } = useApp();
  const [search, setSearch] = useState("");
  const [filterTier, setFilterTier] = useState<Tier | "all">("all");

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  }

  const filtered = people
    .filter(
      (p) =>
        (filterTier === "all" || p.tier === filterTier) &&
        p.name.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      const tOrder = TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
      if (tOrder !== 0) return tOrder;
      return a.name.localeCompare(b.name);
    });

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          People
          <span className="ml-2 text-base font-normal text-slate-400">
            ({people.length})
          </span>
        </h1>
        <Link
          to="/people/new"
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
        >
          + Add person
        </Link>
      </div>

      <div className="mb-4 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
        />
        <select
          value={filterTier}
          onChange={(e) => setFilterTier(e.target.value as Tier | "all")}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        >
          <option value="all">All tiers</option>
          <option value="inner">Inner circle</option>
          <option value="active">Active</option>
          <option value="extended">Extended</option>
          <option value="dormant">Dormant</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400 dark:border-slate-600">
          {people.length === 0 ? (
            <Link
              to="/people/new"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              Add your first contact →
            </Link>
          ) : (
            "No matches"
          )}
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
          {filtered.map((person) => {
            const interactions = interactionsByPersonId.get(person.id) ?? [];
            const rule = rulesByTier.get(person.tier);
            const health = rule
              ? computeHealthScore(person, interactions, rule)
              : 100;
            return (
              <Link
                key={person.id}
                to={`/people/${person.id}`}
                className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {person.name}
                    </span>
                    <TierBadge tier={person.tier} />
                  </div>
                  {(person.role || person.organization) && (
                    <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                      {[person.role, person.organization]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
                <div className="w-24 shrink-0">
                  <HealthBar score={health} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
