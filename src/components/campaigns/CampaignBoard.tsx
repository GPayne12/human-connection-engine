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
  daysInCurrentStage,
  isCampaignReady,
  isTerminalStage,
  nearlyReady,
  profileReadiness,
  InvalidStageTransitionError,
} from "../../engine";
import { useApp } from "../../context/AppContext";
import { TierBadge } from "../ui/Badge";
import { Modal } from "../ui/Modal";
import type { CampaignEntry, CampaignStage, Person } from "../../types";

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

// Only campaign-ready people appear here (DECISIONS.md 2026-08-13). The list
// is the gate: a half-known contact isn't offered and then rejected, they
// simply aren't on the menu until the profile is finished. What's blocked is
// stated plainly underneath, with the shortest route to unblocking it.
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
  const eligible = available.filter(isCampaignReady);
  const waiting = nearlyReady(available);
  const oneFieldAway = waiting.filter(
    (p) => profileReadiness(p).missing.length === 1,
  ).length;

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

  const blockedNote = waiting.length > 0 && (
    <p className="text-xs text-slate-500 dark:text-slate-400">
      {waiting.length} {waiting.length === 1 ? "contact is" : "contacts are"}{" "}
      held back by an unfinished profile
      {oneFieldAway > 0 && ` — ${oneFieldAway} of them one field away`}.{" "}
      <Link
        to="/people?ready=no"
        className="text-blue-500 hover:underline dark:text-blue-400"
      >
        Finish a profile →
      </Link>
    </p>
  );

  if (eligible.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {available.length === 0
            ? "Everyone in the graph is already in this campaign."
            : "No one is campaign-ready yet."}
        </p>
        {available.length > 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            A board placement needs a whole person: name, role, org,
            relationship, origin story, and at least one tag of your own.
          </p>
        )}
        {blockedNote}
        <Link
          to="/people/new"
          className="inline-block text-sm text-blue-500 hover:underline dark:text-blue-400"
        >
          Add a new person →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Person{" "}
          <span className="font-normal text-slate-400">
            ({eligible.length} campaign-ready)
          </span>
        </label>
        <select
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          required
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        >
          <option value="">Select…</option>
          {eligible.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.organization ? ` · ${p.organization}` : ""}
            </option>
          ))}
        </select>
      </div>

      {blockedNote}

      <button
        type="submit"
        disabled={saving || !personId}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "Adding…" : "Add to campaign"}
      </button>
    </form>
  );
}

export function CampaignBoard() {
  const { campaigns, campaignEntries, people, dueList, loading, refresh } =
    useApp();
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
  // The board learns about due-ness: a card whose person is on today's due
  // list carries a marker, so campaign work and cadence stop being two
  // disjoint loops at the exact pixel where decisions get made.
  const duePersonIds = new Set(dueList.map((d) => d.person.id));

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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 sm:gap-3">
          <h1 className="w-full text-lg font-bold text-slate-900 sm:w-auto dark:text-slate-100">
            Campaigns
          </h1>
          {campaigns.length > 0 && (
            <select
              value={activeCampaign?.id ?? ""}
              onChange={(e) => setActiveCampaignId(e.target.value)}
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm sm:min-h-0 sm:flex-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <div className="hidden flex-1 sm:block" />
          {activeCampaign && (
            <button
              onClick={() => setAddingPerson(true)}
              className="min-h-11 shrink-0 whitespace-nowrap rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 sm:min-h-0 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              <span className="sm:hidden">+ Person</span>
              <span className="hidden sm:inline">+ Add person</span>
            </button>
          )}
          <button
            onClick={() => setCreatingCampaign(true)}
            className="min-h-11 shrink-0 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 sm:min-h-0 dark:bg-slate-100 dark:text-slate-900"
          >
            <span className="sm:hidden">+ Campaign</span>
            <span className="hidden sm:inline">New campaign</span>
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
        <div className="flex flex-1 snap-x snap-mandatory gap-2 overflow-x-auto p-4 sm:snap-none">
          {STAGES.map((stage) => {
            const stageEntries = boardEntries.filter(
              (e) => e.currentStage === stage,
            );
            return (
              <div
                key={stage}
                // An empty stage still has to be swiped past on a phone, so it
                // collapses to a narrow marker instead of costing a full screen.
                className={`flex shrink-0 snap-start flex-col rounded-xl p-2 sm:w-44 sm:max-w-none ${
                  stageEntries.length === 0 ? "w-28" : "w-[78vw] max-w-72"
                } ${STAGE_COLORS[stage]}`}
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
                        entry={entry}
                        isDue={duePersonIds.has(person.id)}
                        onDragStart={() => {
                          draggedEntryId.current = entry.id;
                        }}
                        onMoveToStage={(to) => handleDrop(to, entry.id)}
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

// A campaign entry sitting in one stage this long without moving is worth
// flagging — roughly the inner-tier cadence window, on the theory that an
// active campaign shouldn't sit still longer than you'd let a close contact go.
const STALE_AFTER_DAYS = 14;

function CampaignCard({
  person,
  entry,
  isDue,
  onDragStart,
  onMoveToStage,
  onRemove,
}: {
  person: Person;
  entry: CampaignEntry;
  isDue: boolean;
  onDragStart: () => void;
  onMoveToStage: (stage: CampaignStage) => void;
  onRemove: () => void;
}) {
  const daysInStage = daysInCurrentStage(entry);
  const stale =
    !isTerminalStage(entry.currentStage) && daysInStage >= STALE_AFTER_DAYS;
  const showDue = isDue && !isTerminalStage(entry.currentStage);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="group relative cursor-grab rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm active:cursor-grabbing dark:border-slate-600 dark:bg-slate-800"
    >
      <Link
        to={`/people/${person.id}`}
        className="block pr-6 text-sm font-medium text-slate-800 hover:text-blue-600 dark:text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {person.name}
      </Link>
      <div className="mt-1 flex items-center gap-1.5">
        <TierBadge tier={person.tier} />
        <span
          className={`text-xs ${stale ? "font-medium text-amber-600 dark:text-amber-400" : "text-slate-400"}`}
          title={`Entered this stage ${daysInStage} day${daysInStage === 1 ? "" : "s"} ago`}
        >
          {daysInStage}d
        </span>
        {showDue && (
          <span
            className="text-xs font-medium text-red-500 dark:text-red-400"
            title="Due for contact on the Today view"
          >
            ● due
          </span>
        )}
      </div>
      {/* Touch devices never fire HTML5 drag events, so on phones the board
          would be read-only. A native select is the moving mechanism there —
          iOS renders it as a wheel picker, and it routes through the same
          transition validation the drop handler uses. Desktop keeps dragging. */}
      <select
        aria-label={`Move ${person.name} to another stage`}
        value={entry.currentStage}
        onChange={(e) => onMoveToStage(e.target.value as CampaignStage)}
        className="mt-2 min-h-9 w-full rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs text-slate-600 sm:hidden dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
      >
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </select>

      {/* Visible by default on touch (no hover to reveal it), hover-gated on
          pointer devices so the board stays clean. */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label={`Remove ${person.name} from this campaign`}
        className="absolute right-1 top-1 flex size-7 items-center justify-center rounded text-xs text-slate-300 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}
