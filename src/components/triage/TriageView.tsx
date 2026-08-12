import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../../context/AppContext";
import { bulkImportPeople } from "../../db";
import {
  parseLinkedInCsv,
  planLinkedInImport,
  type LinkedInConnection,
} from "../../db/linkedin";
import type { Tier } from "../../types";

// Past this many pixels of drag, releasing commits the decision.
const COMMIT_DISTANCE = 110;

type Decision = "keep" | "pass";

function fullName(c: LinkedInConnection): string {
  return `${c.firstName} ${c.lastName}`.trim();
}

export function TriageView() {
  const { people, refresh } = useApp();

  const [candidates, setCandidates] = useState<LinkedInConnection[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [tier, setTier] = useState<Tier>("dormant");
  const [fileName, setFileName] = useState<string | null>(null);
  const [skippedExisting, setSkippedExisting] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [flyOut, setFlyOut] = useState<Decision | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const index = decisions.length;
  const current = candidates[index];
  const next = candidates[index + 1];
  const keptCount = decisions.filter((d) => d === "keep").length;
  const done = candidates.length > 0 && index >= candidates.length;

  const keptConnections = useMemo(
    () => candidates.filter((_, i) => decisions[i] === "keep"),
    [candidates, decisions],
  );

  function loadFile(file: File) {
    setError(null);
    setImportResult(null);
    file
      .text()
      .then((raw) => {
        const parsed = parseLinkedInCsv(raw);
        // Filter here purely so you never swipe on someone already in the
        // graph. The importer re-checks on write, so this is only about not
        // wasting your attention.
        const existing = new Set(
          people.map((p) => p.name.trim().toLowerCase()),
        );
        const fresh = parsed.filter(
          (c) => fullName(c) && !existing.has(fullName(c).toLowerCase()),
        );
        setSkippedExisting(parsed.length - fresh.length);
        setCandidates(fresh);
        setDecisions([]);
        setFileName(file.name);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Could not read that file."),
      );
  }

  const decide = useCallback((decision: Decision) => {
    setFlyOut(decision);
    // Let the card clear the screen before the next one takes its place.
    window.setTimeout(() => {
      setDecisions((prev) => [...prev, decision]);
      setDrag(null);
      setFlyOut(null);
    }, 180);
  }, []);

  const undo = useCallback(() => {
    setDecisions((prev) => prev.slice(0, -1));
    setDrag(null);
    setFlyOut(null);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (flyOut) return;
      if (e.key === "ArrowRight" && current) decide("keep");
      else if (e.key === "ArrowLeft" && current) decide("pass");
      else if ((e.key === "Backspace" || e.key === "u") && index > 0) {
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, decide, undo, index, flyOut]);

  function onPointerDown(e: React.PointerEvent) {
    if (flyOut) return;
    dragStart.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragStart.current) return;
    setDrag({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  }

  function onPointerUp() {
    if (!dragStart.current) return;
    dragStart.current = null;
    if (drag && Math.abs(drag.x) > COMMIT_DISTANCE) {
      decide(drag.x > 0 ? "keep" : "pass");
    } else {
      setDrag(null);
    }
  }

  async function handleImport() {
    setImporting(true);
    setError(null);
    try {
      const plan = planLinkedInImport(
        keptConnections,
        tier,
        people.map((p) => p.name),
      );
      await bulkImportPeople(plan.people);
      await refresh();
      setImportResult(
        `Imported ${plan.people.length} ${plan.people.length === 1 ? "person" : "people"} as ${tier}.`,
      );
      setCandidates([]);
      setDecisions([]);
      setFileName(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  // ── Empty: no file loaded ──────────────────────────────────────────────
  if (candidates.length === 0 && !done) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <h1 className="mb-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
          Triage
        </h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          Swipe through a list of candidates and keep only the ones worth
          tracking. Nothing reaches the graph until you press import.
        </p>

        {importResult && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
            {importResult}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            Takes a LinkedIn-format CSV — either the official export, or the one{" "}
            <code className="text-xs">tools/screen-ocr</code> produces from a
            screen recording.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) loadFile(file);
            }}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700 dark:text-slate-400 dark:file:bg-slate-100 dark:file:text-slate-900"
          />
        </div>
      </div>
    );
  }

  // ── Done: everything decided ───────────────────────────────────────────
  if (done) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <h1 className="mb-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
          Triage
        </h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          {fileName} · {candidates.length} reviewed
        </p>

        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-800">
          <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">
            {keptCount}
          </p>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            kept, {candidates.length - keptCount} passed
          </p>

          {keptCount > 0 ? (
            <>
              <div className="mb-3 flex items-center justify-center gap-2">
                <label className="text-sm text-slate-600 dark:text-slate-400">
                  Import as
                </label>
                <select
                  value={tier}
                  onChange={(e) => setTier(e.target.value as Tier)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                >
                  <option value="dormant">Dormant (recommended)</option>
                  <option value="extended">Extended</option>
                  <option value="active">Active</option>
                  <option value="inner">Inner circle</option>
                </select>
              </div>
              <button
                onClick={handleImport}
                disabled={importing}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {importing ? "Importing…" : `Import ${keptCount} to the graph`}
              </button>
            </>
          ) : (
            <p className="text-sm text-slate-400">
              Nothing kept — nothing to import.
            </p>
          )}

          <button
            onClick={undo}
            className="mt-3 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            ← back to the last card
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </div>
        )}
      </div>
    );
  }

  // ── Swiping ────────────────────────────────────────────────────────────
  const dx = flyOut ? (flyOut === "keep" ? 600 : -600) : (drag?.x ?? 0);
  const dy = flyOut ? 0 : (drag?.y ?? 0);
  const intent = Math.abs(dx) > 40 ? (dx > 0 ? "keep" : "pass") : null;

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Triage
        </h1>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {index + 1} of {candidates.length} · {keptCount} kept
        </span>
      </div>

      <div className="mb-4 h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className="h-full bg-slate-900 transition-all dark:bg-slate-100"
          style={{ width: `${(index / candidates.length) * 100}%` }}
        />
      </div>

      {skippedExisting > 0 && index === 0 && (
        <p className="mb-3 text-xs text-slate-400">
          {skippedExisting} already in your graph, hidden.
        </p>
      )}

      <div className="relative h-64 select-none">
        {next && (
          <div className="absolute inset-0 scale-95 rounded-2xl border border-slate-200 bg-white opacity-60 dark:border-slate-700 dark:bg-slate-800" />
        )}

        {current && (
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
              transform: `translate(${dx}px, ${dy}px) rotate(${dx * 0.04}deg)`,
              transition: flyOut || !drag ? "transform 180ms ease-out" : "none",
            }}
            className="absolute inset-0 flex cursor-grab flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 text-center shadow-lg active:cursor-grabbing dark:border-slate-700 dark:bg-slate-800"
          >
            <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              {fullName(current)}
            </p>
            {current.position && (
              <p className="mt-2 text-slate-500 dark:text-slate-400">
                {current.position}
              </p>
            )}

            {intent && (
              <div
                className={`absolute inset-0 flex items-center justify-center rounded-2xl text-xl font-bold ${
                  intent === "keep"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-red-500/10 text-red-500 dark:text-red-400"
                }`}
              >
                <span className="rounded-lg border-2 border-current px-4 py-1">
                  {intent === "keep" ? "KEEP" : "PASS"}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={() => decide("pass")}
          className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
        >
          ← Pass
        </button>
        <button
          onClick={() => decide("keep")}
          className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Keep →
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
        <span>Arrow keys work. Drag the card too.</span>
        {index > 0 && (
          <button
            onClick={undo}
            className="hover:text-slate-600 dark:hover:text-slate-300"
          >
            Undo (u)
          </button>
        )}
      </div>

      {keptCount > 0 && (
        <button
          onClick={handleImport}
          disabled={importing}
          className="mt-6 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
        >
          {importing ? "Importing…" : `Stop here and import ${keptCount}`}
        </button>
      )}
    </div>
  );
}
