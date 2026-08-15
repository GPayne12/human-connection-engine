import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deletePerson } from "../../db";
import { useApp } from "../../context/AppContext";
import {
  computeHealthScore,
  computeReciprocity,
  daysBetween,
  lastContactDate,
  profileReadiness,
} from "../../engine";
import { HealthDots } from "../ui/HealthDots";
import { ReadinessPanel } from "../ui/ReadinessMeter";
import { TierBadge } from "../ui/Badge";
import { Modal } from "../ui/Modal";
import { LogContactForm } from "../forms/LogContactForm";
import { PersonForm } from "../forms/PersonForm";
import type { Interaction } from "../../types";

const TYPE_ICONS: Record<string, string> = {
  call: "📞",
  meeting: "☕",
  message: "💬",
  email: "✉️",
  other: "•",
};

function InteractionRow({ interaction }: { interaction: Interaction }) {
  const dir =
    interaction.direction === "outbound"
      ? "→"
      : interaction.direction === "inbound"
        ? "←"
        : "↔";
  const date = new Date(interaction.date);
  return (
    <div className="flex gap-3 py-3">
      <div className="mt-0.5 shrink-0 text-base">
        {TYPE_ICONS[interaction.type] ?? "•"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-slate-400">{dir}</span>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {interaction.summary}
          </p>
        </div>
        <p className="mt-0.5 text-xs text-slate-400">
          {date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
          {interaction.warmthDelta !== 0 && (
            <span
              className={`ml-2 ${interaction.warmthDelta > 0 ? "text-emerald-500" : "text-red-400"}`}
            >
              {interaction.warmthDelta > 0 ? "+" : ""}
              {interaction.warmthDelta}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

export function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    people,
    interactionsByPersonId,
    rulesByTier,
    campaignEntries,
    campaigns,
    refresh,
  } = useApp();

  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Handle "new" route for adding a person
  if (id === "new") {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <div className="mb-4 flex items-center gap-2">
          <Link
            to="/people"
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            ← People
          </Link>
        </div>
        <h1 className="mb-6 text-2xl font-bold text-slate-900 dark:text-slate-100">
          Add person
        </h1>
        <PersonForm
          onDone={() => {
            refresh();
            navigate("/people");
          }}
        />
      </div>
    );
  }

  const person = people.find((p) => p.id === id);
  if (!person) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 text-slate-400">
        <p>Person not found.</p>
        <Link to="/people" className="text-sm text-blue-500 hover:underline">
          Back to people
        </Link>
      </div>
    );
  }

  const interactions = (interactionsByPersonId.get(person.id) ?? [])
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const rule = rulesByTier.get(person.tier);
  const health = rule ? computeHealthScore(person, interactions, rule) : 100;
  const reciprocity = computeReciprocity(person.id, interactions, "quarter");
  const daysSince = daysBetween(
    lastContactDate(person, interactions),
    new Date(),
  );
  const activeCampaignEntries = campaignEntries.filter(
    (e) => e.personId === person.id,
  );
  const readiness = profileReadiness(person);

  async function handleDelete() {
    await deletePerson(person!.id);
    refresh();
    navigate("/people");
  }

  return (
    <>
      <div className="mx-auto max-w-xl px-4 py-6">
        {/* Back */}
        <Link
          to="/people"
          className="mb-4 inline-block text-sm text-slate-500 hover:text-slate-700"
        >
          ← People
        </Link>

        {/* Header */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {person.name}
            </h1>
            {(person.role || person.organization) && (
              <p className="text-slate-500 dark:text-slate-400">
                {[person.role, person.organization].filter(Boolean).join(" · ")}
              </p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <TierBadge tier={person.tier} />
              {readiness.isReady && (
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  ✓ Campaign-ready
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => setEditing(true)}
              className="min-h-11 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 sm:flex-none dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              Edit
            </button>
            <button
              onClick={() => setLogging(true)}
              className="min-h-11 flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 sm:flex-none"
            >
              Log contact
            </button>
          </div>
        </div>

        {/* Readiness — only while there's something left to finish. A finished
            profile gets the chip in the header and nothing more. */}
        {!readiness.isReady && (
          <div className="mb-4">
            <ReadinessPanel readiness={readiness} name={person.name} />
            <button
              onClick={() => setEditing(true)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Finish {person.name.split(" ")[0]}'s profile
            </button>
          </div>
        )}

        {/* Health + stats */}
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-3 flex justify-between text-sm text-slate-500">
            <span>Relationship health</span>
            <span>
              Last contact: {daysSince === 0 ? "today" : `${daysSince}d ago`}
            </span>
          </div>
          <HealthDots score={health} />
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                {interactions.length}
              </p>
              <p className="text-xs text-slate-400">interactions</p>
            </div>
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                {reciprocity.outboundCount}↑ {reciprocity.inboundCount}↓
              </p>
              <p className="text-xs text-slate-400">this quarter</p>
            </div>
            <div>
              <p
                className={`font-semibold ${
                  reciprocity.balance === "giving"
                    ? "text-blue-600"
                    : reciprocity.balance === "receiving"
                      ? "text-amber-600"
                      : "text-emerald-600"
                }`}
              >
                {reciprocity.balance}
              </p>
              <p className="text-xs text-slate-400">reciprocity</p>
            </div>
          </div>
        </div>

        {/* Origin story */}
        <section className="mb-4">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Origin story
          </h2>
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {person.originStory || (
              <span className="italic text-slate-400">Not recorded yet.</span>
            )}
          </p>
        </section>

        {/* Shared context */}
        {person.sharedContext.length > 0 && (
          <section className="mb-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Shared context
            </h2>
            <div className="flex flex-wrap gap-2">
              {person.sharedContext.map((ctx) => (
                <span
                  key={ctx}
                  className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                >
                  {ctx}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Notes */}
        {person.notes && (
          <section className="mb-4">
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Notes{" "}
              <span className="font-normal normal-case text-slate-300">
                (encrypted)
              </span>
            </h2>
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {person.notes}
            </p>
          </section>
        )}

        {/* Active campaigns */}
        {activeCampaignEntries.length > 0 && (
          <section className="mb-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Campaigns
            </h2>
            <div className="space-y-1.5">
              {activeCampaignEntries.map((entry) => {
                const campaign = campaigns.find(
                  (c) => c.id === entry.campaignId,
                );
                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
                  >
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {campaign?.name ?? "Unknown campaign"}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                      {entry.currentStage}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Interaction timeline */}
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Interaction history
          </h2>
          {interactions.length === 0 ? (
            <p className="text-sm text-slate-400">
              No interactions logged yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-4 dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
              {interactions.map((i) => (
                <InteractionRow key={i.id} interaction={i} />
              ))}
            </div>
          )}
        </section>

        {/* Danger zone */}
        <div className="border-t border-slate-100 pt-4 dark:border-slate-700">
          {confirmDelete ? (
            <div className="rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
              <p className="mb-3 text-sm text-red-700 dark:text-red-300">
                Delete {person.name} and all their interactions? This cannot be
                undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
                >
                  Yes, delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-sm text-slate-400 hover:text-red-500"
            >
              Delete this person
            </button>
          )}
        </div>
      </div>

      {logging && (
        <Modal
          title={`Log contact with ${person.name}`}
          onClose={() => setLogging(false)}
        >
          <LogContactForm
            person={person}
            onDone={() => {
              setLogging(false);
              refresh();
            }}
          />
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit ${person.name}`} onClose={() => setEditing(false)}>
          <div className="max-h-[70vh] overflow-y-auto">
            <PersonForm
              initial={person}
              onDone={() => {
                setEditing(false);
                refresh();
              }}
            />
          </div>
        </Modal>
      )}
    </>
  );
}
