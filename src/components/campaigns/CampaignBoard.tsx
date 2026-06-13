import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  advanceCampaignEntryStage,
  deleteCampaignEntry,
  upsertCampaign,
  upsertCampaignEntry,
} from "../../db";
import {
  advanceCampaignStage,
  InvalidStageTransitionError,
} from "../../engine";
import { useApp } from "../../context/AppContext";
import { TierBadge } from "../ui/Badge";
import { Modal } from "../ui/Modal";
import type { CampaignStage, Person } from "../../types";

const STAGES: CampaignStage[] = [
  "research",
  "warmup",
  "ask",
  "nurture",
  "closed",
  "recycled",
];
const STAGE_LABELS: Record<CampaignStage, string> = {
  research: "Research",
  warmup: "Warm-up",
  ask: "Ask",
  nurture: "Nurture",
  closed: "Closed",
  recycled: "Recycled",
};
const STAGE_COLORS: Record<CampaignStage, string> = {
  research: "bg-slate-100 dark:bg-slate-800",
  warmup: "bg-blue-50 dark:bg-blue-900/20",
  ask: "bg-purple-50 dark:bg-purple-900/20",
  nurture: "bg-amber-50 dark:bg-amber-900/20",
  closed: "bg-emerald-50 dark:bg-emerald-900/20",
  recycled: "bg-slate-50 dark:bg-slate-800/50",
};

function NewCampaignModal({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await upsertCampaign({
      id: crypto.randomUUID(),
      name,
      goal,
      notes: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Campaign name <span className="text-red-500">*</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Job search — Spring 2026"
          required
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Goal
        </label>
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Land a senior IC role at a climate-tech company"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        />
      </div>
      <button
        type="submit"
        disabled={saving || !name.trim()}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "Creating…" : "Create campaign"}
      </button>
    </form>
  );
}

function AddPersonModal({
  campaignId,
  people,
  existingPersonIds,
  onDone,
}: {
  campaignId: string;
  people: Person[];
  existingPersonIds: Set<string>;
  onDone: () => void;
}) {
  const [personId, setPersonId] = useState("");
  const [saving, setSaving] = useState(false);

  const available = people.filter((p) => !existingPersonIds.has(p.id));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!personId) return;
    setSaving(true);
    await upsertCampaignEntry({
      id: crypto.randomUUID(),
      campaignId,
      personId,
      currentStage: "research",
      stageHistory: [],
      updatedAt: new Date(),
    });
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Person
        </label>
        {available.length === 0 ? (
          <p className="text-sm text-slate-400">
            All contacts are already in this campaign.{" "}
            <Link to="/people/new" className="text-blue-500 hover:underline">
              Add a new person?
            </Link>
          </p>
        ) : (
          <select
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          >
            <option value="">Select…</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.organization ? ` · ${p.organization}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>
      {available.length > 0 && (
        <button
          type="submit"
          disabled={saving || !personId}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add to campaign"}
        </button>
      )}
    </form>
  );
}

export function CampaignBoard() {
  const { campaigns, campaignEntries, people, loading, refresh } = useApp();
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [addingPerson, setAddingPerson] = useState(false);
  const draggedEntryId = useRef<string | null>(null);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  }

  const activeCampaign =
    campaigns.find((c) => c.id === activeCampaignId) ?? campaigns[0] ?? null;

  const boardEntries = activeCampaign
    ? campaignEntries.filter((e) => e.campaignId === activeCampaign.id)
    : [];

  const existingPersonIds = new Set(boardEntries.map((e) => e.personId));

  async function handleDrop(toStage: CampaignStage, entryId: string) {
    const entry = boardEntries.find((e) => e.id === entryId);
    if (!entry || entry.currentStage === toStage) return;
    try {
      const updated = advanceCampaignStage(entry, toStage);
      await advanceCampaignEntryStage(updated.id, updated.currentStage);
      refresh();
    } catch (err) {
      if (err instanceof InvalidStageTransitionError) {
        alert(err.message);
      }
    }
  }

  async function handleRemoveEntry(entryId: string) {
    await deleteCampaignEntry(entryId);
    refresh();
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Campaigns
          </h1>
          {campaigns.length > 0 && (
            <select
              value={activeCampaign?.id ?? ""}
              onChange={(e) => setActiveCampaignId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex-1" />
          {activeCampaign && (
            <button
              onClick={() => setAddingPerson(true)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              + Add person
            </button>
          )}
          <button
            onClick={() => setCreatingCampaign(true)}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
          >
            New campaign
          </button>
        </div>
      </div>

      {/* Board */}
      {!activeCampaign ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="font-medium text-slate-700 dark:text-slate-300">
              No campaigns yet
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Create a campaign to start tracking outreach lifecycle.
            </p>
            <button
              onClick={() => setCreatingCampaign(true)}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Create first campaign
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 gap-2 overflow-x-auto p-4">
          {STAGES.map((stage) => {
            const stageEntries = boardEntries.filter(
              (e) => e.currentStage === stage,
            );
            return (
              <div
                key={stage}
                className={`flex w-44 shrink-0 flex-col rounded-xl p-2 ${STAGE_COLORS[stage]}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = draggedEntryId.current;
                  if (id) handleDrop(stage, id);
                }}
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {STAGE_LABELS[stage]}
                  </span>
                  <span className="text-xs text-slate-400">
                    {stageEntries.length}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  {stageEntries.map((entry) => {
                    const person = people.find((p) => p.id === entry.personId);
                    if (!person) return null;
                    return (
                      <CampaignCard
                        key={entry.id}
                        person={person}
                        onDragStart={() => {
                          draggedEntryId.current = entry.id;
                        }}
                        onRemove={() => handleRemoveEntry(entry.id)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creatingCampaign && (
        <Modal title="New campaign" onClose={() => setCreatingCampaign(false)}>
          <NewCampaignModal
            onDone={() => {
              setCreatingCampaign(false);
              refresh();
            }}
          />
        </Modal>
      )}

      {addingPerson && activeCampaign && (
        <Modal
          title={`Add person to "${activeCampaign.name}"`}
          onClose={() => setAddingPerson(false)}
        >
          <AddPersonModal
            campaignId={activeCampaign.id}
            people={people}
            existingPersonIds={existingPersonIds}
            onDone={() => {
              setAddingPerson(false);
              refresh();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function CampaignCard({
  person,
  onDragStart,
  onRemove,
}: {
  person: Person;
  onDragStart: () => void;
  onRemove: () => void;
}) {
  const [showRemove, setShowRemove] = useState(false);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onMouseEnter={() => setShowRemove(true)}
      onMouseLeave={() => setShowRemove(false)}
      className="relative cursor-grab rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm active:cursor-grabbing dark:border-slate-600 dark:bg-slate-800"
    >
      <Link
        to={`/people/${person.id}`}
        className="block text-sm font-medium text-slate-800 hover:text-blue-600 dark:text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {person.name}
      </Link>
      <div className="mt-1">
        <TierBadge tier={person.tier} />
      </div>
      {showRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute right-1.5 top-1.5 rounded p-0.5 text-xs text-slate-300 hover:text-red-400"
        >
          ✕
        </button>
      )}
    </div>
  );
}
