import { db, type StoredPerson } from "./schema";
import { encryptField, decryptField } from "./crypto";
import type {
  Person,
  Interaction,
  CadenceRule,
  Campaign,
  CampaignEntry,
  CampaignStage,
  StageHistoryEntry,
} from "../types";

export { db };

// ── Person ────────────────────────────────────────────────────────────────────

async function toStored(person: Person): Promise<StoredPerson> {
  const [encNotes, encOrigin] = await Promise.all([
    encryptField(person.notes),
    encryptField(person.originStory),
  ]);
  return {
    ...person,
    notes: JSON.stringify(encNotes),
    originStory: JSON.stringify(encOrigin),
    lastContactDate: person.lastContactDate?.getTime(),
  };
}

async function fromStored(stored: StoredPerson): Promise<Person> {
  const [notes, originStory] = await Promise.all([
    decryptField(JSON.parse(stored.notes)),
    decryptField(JSON.parse(stored.originStory)),
  ]);
  return {
    ...stored,
    notes,
    originStory,
    lastContactDate: stored.lastContactDate
      ? new Date(stored.lastContactDate)
      : undefined,
  };
}

export async function upsertPerson(person: Person): Promise<void> {
  const stored = await toStored({ ...person, updatedAt: new Date() });
  await db.people.put(stored);
}

export async function getPerson(id: string): Promise<Person | undefined> {
  const stored = await db.people.get(id);
  return stored ? fromStored(stored) : undefined;
}

export async function getAllPeople(): Promise<Person[]> {
  const stored = await db.people.toArray();
  return Promise.all(stored.map(fromStored));
}

export async function deletePerson(id: string): Promise<void> {
  await db.transaction(
    "rw",
    [db.people, db.interactions, db.campaignEntries],
    async () => {
      await Promise.all([
        db.people.delete(id),
        db.interactions.where("personId").equals(id).delete(),
        db.campaignEntries.where("personId").equals(id).delete(),
      ]);
    },
  );
}

// ── Interaction ───────────────────────────────────────────────────────────────

export async function addInteraction(interaction: Interaction): Promise<void> {
  await db.transaction("rw", [db.interactions, db.people], async () => {
    await db.interactions.add(interaction);
    // Keep lastContactDate denormalized on Person for fast engine queries
    await db.people
      .where("id")
      .equals(interaction.personId)
      .modify((p: StoredPerson) => {
        const ts = new Date(interaction.date).getTime();
        if (!p.lastContactDate || ts > p.lastContactDate) {
          p.lastContactDate = ts;
        }
      });
  });
}

export async function getInteractionsForPerson(
  personId: string,
): Promise<Interaction[]> {
  return db.interactions.where("personId").equals(personId).sortBy("date");
}

// ── CadenceRule ───────────────────────────────────────────────────────────────

export async function getCadenceRules(): Promise<CadenceRule[]> {
  return db.cadenceRules.toArray();
}

export async function upsertCadenceRule(rule: CadenceRule): Promise<void> {
  await db.cadenceRules.put(rule);
}

// ── Campaign ──────────────────────────────────────────────────────────────────

export async function upsertCampaign(campaign: Campaign): Promise<void> {
  await db.campaigns.put({ ...campaign, updatedAt: new Date() });
}

export async function getAllCampaigns(): Promise<Campaign[]> {
  return db.campaigns.toArray();
}

// ── CampaignEntry ─────────────────────────────────────────────────────────────

export async function upsertCampaignEntry(entry: CampaignEntry): Promise<void> {
  await db.campaignEntries.put({ ...entry, updatedAt: new Date() });
}

export async function getCampaignEntries(
  campaignId: string,
): Promise<CampaignEntry[]> {
  return db.campaignEntries.where("campaignId").equals(campaignId).toArray();
}

export async function advanceCampaignEntryStage(
  entryId: string,
  toStage: CampaignStage,
  note?: string,
): Promise<void> {
  await db.campaignEntries
    .where("id")
    .equals(entryId)
    .modify((entry: CampaignEntry) => {
      const historyEntry: StageHistoryEntry = {
        stage: entry.currentStage,
        enteredAt: entry.updatedAt,
        note,
      };
      entry.stageHistory = [...entry.stageHistory, historyEntry];
      entry.currentStage = toStage;
      entry.updatedAt = new Date();
    });
}
