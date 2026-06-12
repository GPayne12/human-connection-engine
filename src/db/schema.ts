import Dexie, { type EntityTable } from "dexie";
import type {
  CampaignEntry,
  CadenceRule,
  Campaign,
  Interaction,
  Person,
} from "../types";
import { DEFAULT_CADENCE_RULES, SCHEMA_VERSION } from "../types";

// StoredPerson replaces the two plaintext encrypted fields with their ciphertext form.
// The crypto module handles the conversion; consumers always work with plain Person.
export interface StoredPerson extends Omit<
  Person,
  "notes" | "originStory" | "lastContactDate"
> {
  notes: string; // JSON-serialized EncryptedField
  originStory: string; // JSON-serialized EncryptedField
  lastContactDate?: number; // stored as timestamp for Dexie indexing
}

export class HumanConnectionDB extends Dexie {
  people!: EntityTable<StoredPerson, "id">;
  interactions!: EntityTable<Interaction, "id">;
  cadenceRules!: EntityTable<CadenceRule, "tier">;
  campaigns!: EntityTable<Campaign, "id">;
  campaignEntries!: EntityTable<CampaignEntry, "id">;

  constructor() {
    super("human-connection-engine");

    // v1 — initial schema
    // Index syntax: '&' = unique, '*' = multi-entry array, '[a+b]' = compound
    this.version(SCHEMA_VERSION).stores({
      people: "&id, tier, name, lastContactDate",
      interactions: "&id, personId, date",
      cadenceRules: "&tier",
      campaigns: "&id",
      campaignEntries: "&id, campaignId, personId, [campaignId+personId]",
    });

    this.on("populate", () => this.cadenceRules.bulkAdd(DEFAULT_CADENCE_RULES));
  }
}

export const db = new HumanConnectionDB();
