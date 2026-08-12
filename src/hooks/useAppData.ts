import { useCallback, useEffect, useState } from "react";
import {
  getAllCampaignEntries,
  getAllCampaigns,
  getAllInteractions,
  getAllPeople,
  getAllSnoozes,
  getCadenceRules,
  GraphUnreachableError,
} from "../db";
import { getDueList } from "../engine";
import type {
  CadenceRule,
  Campaign,
  CampaignEntry,
  DueItem,
  Interaction,
  Person,
  Snooze,
  Tier,
} from "../types";

export interface AppData {
  people: Person[];
  interactionsByPersonId: Map<string, Interaction[]>;
  rulesByTier: Map<Tier, CadenceRule>;
  snoozesByPersonId: Map<string, Snooze>;
  campaigns: Campaign[];
  campaignEntries: CampaignEntry[];
  dueList: DueItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface LoadedState {
  people: Person[];
  interactionsByPersonId: Map<string, Interaction[]>;
  rulesByTier: Map<Tier, CadenceRule>;
  snoozesByPersonId: Map<string, Snooze>;
  campaigns: Campaign[];
  campaignEntries: CampaignEntry[];
  dueList: DueItem[];
}

const EMPTY: LoadedState = {
  people: [],
  interactionsByPersonId: new Map(),
  rulesByTier: new Map(),
  snoozesByPersonId: new Map(),
  campaigns: [],
  campaignEntries: [],
  dueList: [],
};

export function useAppData(): AppData {
  const [state, setData] = useState<LoadedState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);

    try {
      const [
        allPeople,
        allInteractions,
        allRules,
        allSnoozes,
        allCampaigns,
        allEntries,
      ] = await Promise.all([
        getAllPeople(),
        getAllInteractions(),
        getCadenceRules(),
        getAllSnoozes(),
        getAllCampaigns(),
        getAllCampaignEntries(),
      ]);

      const byPersonId = new Map<string, Interaction[]>();
      for (const interaction of allInteractions) {
        const list = byPersonId.get(interaction.personId) ?? [];
        list.push(interaction);
        byPersonId.set(interaction.personId, list);
      }

      const byTier = new Map<Tier, CadenceRule>(
        allRules.map((r) => [r.tier, r]),
      );
      const bySnoozeId = new Map<string, Snooze>(
        allSnoozes.map((s) => [s.personId, s]),
      );
      const due = getDueList(allPeople, byPersonId, byTier, bySnoozeId);

      // Single setState call — avoids cascading renders flagged by react-hooks/set-state-in-effect
      setData({
        people: allPeople,
        interactionsByPersonId: byPersonId,
        rulesByTier: byTier,
        snoozesByPersonId: bySnoozeId,
        campaigns: allCampaigns,
        campaignEntries: allEntries,
        dueList: due,
      });
      setError(null);
    } catch (err) {
      // Stage 2 introduced a failure mode Dexie never had: the graph now
      // lives behind a network call that can fail (service down, off the
      // tailnet). Keep whatever was last loaded on screen and surface the
      // failure rather than blanking the app.
      setError(
        err instanceof GraphUnreachableError
          ? err.message
          : "Failed to load the relationship graph.",
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { ...state, loading, error, refresh };
}
