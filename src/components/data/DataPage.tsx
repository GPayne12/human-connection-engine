import { useRef, useState } from "react";
import { useApp } from "../../context/AppContext";
import {
  exportGraph,
  importGraph,
  parseExport,
  serializeExport,
  type ExportFile,
} from "../../db/export";
import { parseLinkedInCsv, planLinkedInImport } from "../../db/linkedin";
import { bulkImportPeople } from "../../db";
import type { Tier } from "../../types";

function downloadFile(contents: string, filename: string): void {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function summarize(file: ExportFile): string {
  return `${file.people.length} people, ${file.interactions.length} interactions, ${file.campaigns.length} campaigns, ${file.campaignEntries.length} campaign entries`;
}

export function DataPage() {
  const { people, refresh } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const linkedInInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importingLinkedIn, setImportingLinkedIn] = useState(false);
  const [linkedInTier, setLinkedInTier] = useState<Tier>("dormant");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setError(null);
    setMessage(null);
    try {
      const file = await exportGraph();
      const date = new Date().toISOString().slice(0, 10);
      downloadFile(serializeExport(file), `hce-export-${date}.json`);
      setMessage(`Exported ${summarize(file)}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  async function handleImportFile(inputFile: File) {
    setImporting(true);
    setError(null);
    setMessage(null);
    try {
      const raw = await inputFile.text();
      const file = parseExport(raw);
      await importGraph(file);
      await refresh();
      setMessage(`Imported ${summarize(file)}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleLinkedInFile(inputFile: File) {
    setImportingLinkedIn(true);
    setError(null);
    setMessage(null);
    try {
      const raw = await inputFile.text();
      const connections = parseLinkedInCsv(raw);
      const plan = planLinkedInImport(
        connections,
        linkedInTier,
        people.map((p) => p.name),
      );
      await bulkImportPeople(plan.people);
      await refresh();
      const parts = [
        `Imported ${plan.people.length} connection${plan.people.length === 1 ? "" : "s"} as ${linkedInTier}`,
      ];
      if (plan.skippedExisting.length > 0)
        parts.push(
          `skipped ${plan.skippedExisting.length} already in the graph`,
        );
      if (plan.ignoredEmptyRows > 0)
        parts.push(
          `ignored ${plan.ignoredEmptyRows} blank row${plan.ignoredEmptyRows === 1 ? "" : "s"}`,
        );
      setMessage(`${parts.join(", ")}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "LinkedIn import failed.");
    } finally {
      setImportingLinkedIn(false);
      if (linkedInInputRef.current) linkedInInputRef.current.value = "";
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold text-slate-900 dark:text-slate-100">
        Data
      </h1>

      {message && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </div>
      )}

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Export
        </h2>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          Downloads the full graph as a JSON file. Notes and origin stories are
          decrypted for the file, then re-encrypted on import with whichever
          browser reads it back in.
        </p>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {exporting ? "Exporting…" : "Export JSON"}
        </button>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Import
        </h2>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          Restores from a JSON export. Records are matched by ID: existing
          records with the same ID are overwritten, new ones are added, and
          nothing already in the graph is deleted.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          disabled={importing}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImportFile(file);
          }}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700 disabled:opacity-50 dark:text-slate-400 dark:file:bg-slate-100 dark:file:text-slate-900"
        />
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Import LinkedIn connections
        </h2>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          Takes the Connections.csv from LinkedIn's official data export
          (Settings → Data privacy → Get a copy of your data). Names already in
          the graph are skipped, never overwritten. Origin stories stay empty —
          those are yours to write as people enter campaigns.
        </p>
        <div className="mb-3 flex items-center gap-2">
          <label className="text-sm text-slate-600 dark:text-slate-400">
            Import everyone as
          </label>
          <select
            value={linkedInTier}
            onChange={(e) => setLinkedInTier(e.target.value as Tier)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          >
            <option value="dormant">Dormant (recommended for bulk)</option>
            <option value="extended">Extended</option>
            <option value="active">Active</option>
            <option value="inner">Inner circle</option>
          </select>
        </div>
        <input
          ref={linkedInInputRef}
          type="file"
          accept=".csv,text/csv"
          disabled={importingLinkedIn}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleLinkedInFile(file);
          }}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700 disabled:opacity-50 dark:text-slate-400 dark:file:bg-slate-100 dark:file:text-slate-900"
        />
      </section>
    </div>
  );
}
