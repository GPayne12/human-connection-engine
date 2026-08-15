import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { TierBadge } from "../ui/Badge";
import { HealthDots } from "../ui/HealthDots";
import { ReadinessTag } from "../ui/ReadinessMeter";
import { computeHealthScore, profileReadiness } from "../../engine";
import type { Tier } from "../../types";

const TIER_ORDER: Tier[] = ["inner", "active", "extended", "dormant"];

type ReadyFilter = "all" | "yes" | "no";

function parseReadyFilter(raw: string | null): ReadyFilter {
  return raw === "yes" || raw === "no" ? raw : "all";
}

export function PeopleList() {
  const { people, interactionsByPersonId, rulesByTier, loading } = useApp();
  const [search, setSearch] = useState("");
  const [filterTier, setFilterTier] = useState<Tier | "all">("all");
  // In the URL so the campaign modal can hand off straight to the queue of
  // people it had to hold back.
  const [searchParams, setSearchParams] = useSearchParams();
  const filterReady = parseReadyFilter(searchParams.get("ready"));

  function setFilterReady(next: ReadyFilter) {
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("ready");
    else params.set("ready", next);
    setSearchParams(params, { replace: true });
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  }

  const readinessById = new Map(
    people.map((p) => [p.id, profileReadiness(p)] as const),
  );
  const readyCount = people.filter(
    (p) => readinessById.get(p.id)!.isReady,
  ).length;
  const unfinishedCount = people.length - readyCount;

  const filtered = people
    .filter((p) => {
      const isReady = readinessById.get(p.id)!.isReady;
      return (
        (filterTier === "all" || p.tier === filterTier) &&
        (filterReady === "all" ||
          (filterReady === "yes" ? isReady : !isReady)) &&
        p.name.toLowerCase().includes(search.toLowerCase())
      );
    })
    .sort((a, b) => {
      // Viewing the unfinished queue puts the nearest-to-done first — the
      // next profile to close is always the top row.
      if (filterReady === "no") {
        const gap =
          readinessById.get(a.id)!.missing.length -
          readinessById.get(b.id)!.missing.length;
        if (gap !== 0) return gap;
      }
      const tOrder = TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
      if (tOrder !== 0) return tOrder;
      return a.name.localeCompare(b.name);
    });

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            People
            <span className="ml-2 text-base font-normal text-slate-400">
              ({people.length})
            </span>
          </h1>
          {people.length > 0 && (
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                {readyCount} campaign-ready
              </span>
              {unfinishedCount > 0 && ` · ${unfinishedCount} unfinished`}
            </p>
          )}
        </div>
        <Link
          to="/people/new"
          className="flex min-h-11 shrink-0 items-center rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
        >
          <span className="sm:hidden">+ Add</span>
          <span className="hidden sm:inline">+ Add person</span>
        </Link>
      </div>

      {/* Search takes the full width on a phone; the two filters share the row
          below it rather than being squeezed onto one line with it. */}
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="min-h-11 w-full min-w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:w-auto sm:flex-1 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
        />
        <select
          value={filterTier}
          onChange={(e) => setFilterTier(e.target.value as Tier | "all")}
          className="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:flex-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        >
          <option value="all">All tiers</option>
          <option value="inner">Inner circle</option>
          <option value="active">Active</option>
          <option value="extended">Extended</option>
          <option value="dormant">Dormant</option>
        </select>
        <select
          value={filterReady}
          onChange={(e) => setFilterReady(e.target.value as ReadyFilter)}
          className="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:flex-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        >
          <option value="all">Any profile</option>
          <option value="yes">Campaign-ready</option>
          <option value="no">Unfinished</option>
        </select>
      </div>

      {filterReady === "no" && filtered.length > 0 && (
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          Closest to done first. Each one finished is one more person you can
          put on a board.
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400 dark:border-slate-600">
          {people.length === 0 ? (
            <Link
              to="/people/new"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              Add your first contact →
            </Link>
          ) : filterReady === "no" ? (
            "Every profile here is finished."
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
                className="flex min-h-14 items-center gap-2 px-4 py-3 sm:gap-4 dark:hover:bg-slate-700/50 hover:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-slate-900 dark:text-slate-100">
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
                <ReadinessTag readiness={readinessById.get(person.id)!} />
                {/* Dots are compact enough that health earns its place back in
                    the phone list, which the stretchy bar could not. The
                    numeric score is what gets dropped below `sm` — the dots
                    already carry the signal at a glance. */}
                <div className="shrink-0">
                  <span className="sm:hidden">
                    <HealthDots score={health} showScore={false} />
                  </span>
                  <span className="hidden sm:inline">
                    <HealthDots score={health} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
