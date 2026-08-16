import { useMemo, useState } from "react";
import { upsertPerson } from "../../db";
import { newId } from "../../db/id";
import { profileReadiness } from "../../engine";
import { ReadinessPanel } from "../ui/ReadinessMeter";
import type { Person, Tier } from "../../types";

interface Props {
  initial?: Person;
  onDone: () => void;
}

const TIERS: Tier[] = ["inner", "active", "extended", "dormant"];
const TIER_LABELS: Record<Tier, string> = {
  inner: "Inner circle (contact every 2–3 wks)",
  active: "Active network (6–8 wks)",
  extended: "Extended (quarterly)",
  dormant: "Dormant (180+ days)",
};

function parseChips(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function PersonForm({ initial, onDone }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [organization, setOrganization] = useState(initial?.organization ?? "");
  const [tier, setTier] = useState<Tier>(initial?.tier ?? "active");
  const [originStory, setOriginStory] = useState(initial?.originStory ?? "");
  const [sharedContextRaw, setSharedContextRaw] = useState(
    initial?.sharedContext.join(", ") ?? "",
  );
  const [tagsRaw, setTagsRaw] = useState(initial?.tags.join(", ") ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The origin-story toll gate (DECISIONS.md 2026-08-12): dormant is the only
  // tier allowed to hold an unwritten origin story — bulk imports land there.
  // Promotion to any other tier requires writing the story first, in the
  // user's own words; it is never fabricated.
  const storyRequired = tier !== "dormant";

  // Live against unsaved state, so the panel below moves as the form is filled
  // — the gate is visible while it's being cleared, not only after saving.
  const readiness = useMemo(
    () =>
      profileReadiness({
        name,
        role,
        organization,
        tier,
        originStory,
        tags: parseChips(tagsRaw),
      }),
    [name, role, organization, tier, originStory, tagsRaw],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const now = new Date();
      await upsertPerson({
        id: initial?.id ?? newId(),
        name,
        role: role || undefined,
        organization: organization || undefined,
        tier,
        originStory,
        sharedContext: parseChips(sharedContextRaw),
        tags: parseChips(tagsRaw),
        notes,
        lastContactDate: initial?.lastContactDate,
        createdAt: initial?.createdAt ?? now,
        updatedAt: now,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Role
          </label>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Senior Engineer"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Organization
          </label>
          <input
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            placeholder="Acme Corp"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Relationship tier <span className="text-red-500">*</span>
        </label>
        <div className="space-y-1.5">
          {TIERS.map((t) => (
            <label
              key={t}
              className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                tier === t
                  ? "border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20"
                  : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
              }`}
            >
              <input
                type="radio"
                name="tier"
                value={t}
                checked={tier === t}
                onChange={() => setTier(t)}
                className="accent-blue-600"
              />
              {TIER_LABELS[t]}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Origin story{" "}
          {storyRequired && <span className="text-red-500">*</span>}
        </label>
        <textarea
          value={originStory}
          onChange={(e) => setOriginStory(e.target.value)}
          placeholder="How did you meet? What made this relationship matter?"
          rows={2}
          required={storyRequired}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
        />
        <p className="mt-1 text-xs text-slate-400">
          {storyRequired
            ? "Encrypted. Only you see this."
            : "Optional while dormant — required to promote to any other tier. Encrypted."}
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Shared context{" "}
          <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          value={sharedContextRaw}
          onChange={(e) => setSharedContextRaw(e.target.value)}
          placeholder="open source, climbing, Barcelona trip (comma-separated)"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Tags
        </label>
        <input
          value={tagsRaw}
          onChange={(e) => setTagsRaw(e.target.value)}
          placeholder="mentor, investor, job-search (comma-separated)"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
        />
        <p className="mt-1 text-xs text-slate-400">
          At least one of your own. <code>linkedin-import</code> is provenance,
          not a judgment — it doesn't count.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Notes <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Private notes (encrypted at rest)"
          rows={2}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
        />
      </div>

      <ReadinessPanel readiness={readiness} name={name} />

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300"
        >
          Couldn't save this person — no changes were written. {error}
        </p>
      )}

      <button
        type="submit"
        disabled={
          saving || !name.trim() || (storyRequired && !originStory.trim())
        }
        className="min-h-12 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : initial ? "Save changes" : "Add person"}
      </button>
    </form>
  );
}
