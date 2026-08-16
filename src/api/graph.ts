// Stage 2 — HTTP client for the local graph service (server/).
//
// This is the ONLY file that talks to the network for the relationship
// graph (Law 1: fetch is confined to src/api/). db/index.ts calls these
// functions instead of touching Dexie directly — see server/src/server.js
// for the corresponding routes.
//
// Dates travel as ISO strings; callers are responsible for reviving them
// (src/db/dates.ts) since this layer only knows about the wire shape.

// Port the graph service listens on, for the development case only.
const GRAPH_PORT = 5199;

// Data routes live under /api; the server serves the built app at /.
//
// The production bundle is only ever served BY the graph service, so the API is
// always same-origin — whether that origin is loopback, the tailnet IP, or the
// MagicDNS name behind `tailscale serve`. Keying off the build mode instead of
// sniffing the port is what makes every one of those work without enumerating
// them, and same-origin means no CORS preflight on writes.
//
// VITE_HCE_SERVER_URL still overrides everything.
function defaultBaseUrl(): string {
  if (typeof window === "undefined")
    return `http://127.0.0.1:${GRAPH_PORT}/api`;

  const { protocol, hostname, origin } = window.location;

  if (!import.meta.env.DEV) return `${origin}/api`;

  // Vite dev server. On loopback the graph is a separate process on 5199; over
  // the tailnet it is the same host, on the port the service binds directly.
  const isLoopback =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1";

  if (isLoopback) return `http://127.0.0.1:${GRAPH_PORT}/api`;
  return `${protocol}//${hostname}:${GRAPH_PORT}/api`;
}

const BASE_URL =
  (import.meta.env.VITE_HCE_SERVER_URL as string | undefined) ??
  defaultBaseUrl();

export class GraphUnreachableError extends Error {
  constructor(cause: unknown) {
    super(
      `Can't reach the relationship graph service at ${BASE_URL}. Is it running?`,
    );
    this.name = "GraphUnreachableError";
    this.cause = cause;
  }
}

export class GraphServiceError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`Graph service responded ${status}: ${body}`);
    this.name = "GraphServiceError";
    this.status = status;
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T | undefined> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch (err) {
    throw new GraphUnreachableError(err);
  }

  if (res.status === 404) return undefined;
  if (!res.ok) throw new GraphServiceError(res.status, await res.text());
  if (res.status === 204) return undefined;
  return (await res.json()) as T;
}

export async function checkHealth(): Promise<boolean> {
  try {
    await request("/health");
    return true;
  } catch {
    return false;
  }
}

// ── Person ────────────────────────────────────────────────────────────────

export const getAllPeopleRaw = <T>() => request<T[]>("/people") as Promise<T[]>;
export const getPersonRaw = <T>(id: string) => request<T>(`/people/${id}`);
export const putPersonRaw = <T>(id: string, person: T) =>
  request<void>(`/people/${id}`, {
    method: "PUT",
    body: JSON.stringify(person),
  });
export const deletePersonRaw = (id: string) =>
  request<void>(`/people/${id}`, { method: "DELETE" });
export const bulkPutPeopleRaw = <T>(people: T[]) =>
  request<void>("/people/bulk", {
    method: "POST",
    body: JSON.stringify(people),
  });

// ── Interaction ───────────────────────────────────────────────────────────

export const getAllInteractionsRaw = <T>() =>
  request<T[]>("/interactions") as Promise<T[]>;
export const getInteractionsForPersonRaw = <T>(personId: string) =>
  request<T[]>(`/people/${personId}/interactions`) as Promise<T[]>;
export const postInteractionRaw = <T>(interaction: T) =>
  request<void>("/interactions", {
    method: "POST",
    body: JSON.stringify(interaction),
  });
export const deleteInteractionRaw = (id: string) =>
  request<void>(`/interactions/${id}`, { method: "DELETE" });
export const bulkPutInteractionsRaw = <T>(interactions: T[]) =>
  request<void>("/interactions/bulk", {
    method: "POST",
    body: JSON.stringify(interactions),
  });

// ── CadenceRule ───────────────────────────────────────────────────────────

export const getCadenceRulesRaw = <T>() =>
  request<T[]>("/cadence-rules") as Promise<T[]>;
export const putCadenceRuleRaw = <T>(tier: string, rule: T) =>
  request<void>(`/cadence-rules/${tier}`, {
    method: "PUT",
    body: JSON.stringify(rule),
  });
export const bulkPutCadenceRulesRaw = <T>(rules: T[]) =>
  request<void>("/cadence-rules/bulk", {
    method: "POST",
    body: JSON.stringify(rules),
  });

// ── Campaign ──────────────────────────────────────────────────────────────

export const getAllCampaignsRaw = <T>() =>
  request<T[]>("/campaigns") as Promise<T[]>;
export const putCampaignRaw = <T>(id: string, campaign: T) =>
  request<void>(`/campaigns/${id}`, {
    method: "PUT",
    body: JSON.stringify(campaign),
  });
export const deleteCampaignRaw = (id: string) =>
  request<void>(`/campaigns/${id}`, { method: "DELETE" });
export const bulkPutCampaignsRaw = <T>(campaigns: T[]) =>
  request<void>("/campaigns/bulk", {
    method: "POST",
    body: JSON.stringify(campaigns),
  });

// ── CampaignEntry ─────────────────────────────────────────────────────────

export const getAllCampaignEntriesRaw = <T>() =>
  request<T[]>("/campaign-entries") as Promise<T[]>;
export const getCampaignEntriesRaw = <T>(campaignId: string) =>
  request<T[]>(`/campaigns/${campaignId}/entries`) as Promise<T[]>;
export const putCampaignEntryRaw = <T>(id: string, entry: T) =>
  request<void>(`/campaign-entries/${id}`, {
    method: "PUT",
    body: JSON.stringify(entry),
  });
export const advanceCampaignEntryRaw = (
  id: string,
  toStage: string,
  note?: string,
) =>
  request<void>(`/campaign-entries/${id}/advance`, {
    method: "POST",
    body: JSON.stringify({ toStage, note }),
  });
export const deleteCampaignEntryRaw = (id: string) =>
  request<void>(`/campaign-entries/${id}`, { method: "DELETE" });
export const bulkPutCampaignEntriesRaw = <T>(entries: T[]) =>
  request<void>("/campaign-entries/bulk", {
    method: "POST",
    body: JSON.stringify(entries),
  });

// ── Snooze ────────────────────────────────────────────────────────────────

export const getAllSnoozesRaw = <T>() =>
  request<T[]>("/snoozes") as Promise<T[]>;
export const getSnoozeRaw = <T>(personId: string) =>
  request<T>(`/snoozes/${personId}`);
export const putSnoozeRaw = <T>(personId: string, snooze: T) =>
  request<void>(`/snoozes/${personId}`, {
    method: "PUT",
    body: JSON.stringify(snooze),
  });
export const clearSnoozeRaw = (personId: string) =>
  request<void>(`/snoozes/${personId}`, { method: "DELETE" });
export const bulkPutSnoozesRaw = <T>(snoozes: T[]) =>
  request<void>("/snoozes/bulk", {
    method: "POST",
    body: JSON.stringify(snoozes),
  });
