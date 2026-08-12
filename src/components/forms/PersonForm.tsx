import { useState } from "react";
import { upsertPerson } from "../../db";
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
  const [pronouns, setPronouns] = useState(initial?.pronouns ?? "");
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

  // The origin-story toll gate (DECISIONS.md 2026-08-12): dormant is the only
  // tier allowed to hold an unwritten origin story — bulk imports land there.
  // Promotion to any other tier requires writing the story first, in the
  // user's own words; it is never fabricated.
  const storyRequired = tier !== "dormant";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const now = new Date();
    await upsertPerson({
      id: initial?.id ?? crypto.randomUUID(),
      name,
      pronouns: pronouns || undefined,
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
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
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
            Pronouns
          </label>
          <input
            value={pronouns}
            onChange={(e) => setPronouns(e.target.value)}
            placeholder="they/them"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
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
        <div className="col-span-2">
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
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
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
          Shared context
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
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Private notes (encrypted at rest)"
          rows={2}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
        />
      </div>

      <button
        type="submit"
        disabled={
          saving || !name.trim() || (storyRequired && !originStory.trim())
        }
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : initial ? "Save changes" : "Add person"}
      </button>
    </form>
  );
}
