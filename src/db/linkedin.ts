// Layer 5 — LinkedIn Connections.csv importer (PLAN.md: "LinkedIn export CSV
// importer (maps to Person schema)").
//
// Input is LinkedIn's OFFICIAL data export (Settings → Data privacy → Get a
// copy of your data → Connections), not anything scraped. The file sometimes
// opens with a "Notes:" preamble block before the real header row, so the
// parser locates the header by content rather than assuming row position.
//
// Mapping is deliberately conservative: originStory and notes are left for
// George to write — originStory is "irreplaceable — AI cannot regenerate
// this" (schema), and fabricating placeholder content is against standing
// rules. Only real data from the file is carried: name, role, organization,
// and a provenance line (profile URL / email / connected-on date) in notes.

import type { Person, Tier } from "../types";

export interface LinkedInConnection {
  firstName: string;
  lastName: string;
  url: string;
  email: string;
  company: string;
  position: string;
  connectedOn: string;
}

export interface LinkedInImportPlan {
  people: Person[];
  skippedExisting: string[]; // names already in the graph
  ignoredEmptyRows: number; // private-mode connections export as blank rows
}

export class InvalidLinkedInCsvError extends Error {
  constructor(reason: string) {
    super(`Not a LinkedIn connections export: ${reason}`);
    this.name = "InvalidLinkedInCsvError";
  }
}

// Minimal RFC 4180 parser — quoted fields, escaped quotes, CRLF. No
// dependency; LinkedIn company names and positions routinely contain commas.
export function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && raw[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const HEADER_FIRST_CELL = "First Name";

export function parseLinkedInCsv(raw: string): LinkedInConnection[] {
  const rows = parseCsv(raw);

  // The header row is located by content because LinkedIn sometimes prepends
  // a "Notes:" preamble block of variable length.
  const headerIndex = rows.findIndex((r) => r[0]?.trim() === HEADER_FIRST_CELL);
  if (headerIndex === -1) {
    throw new InvalidLinkedInCsvError(
      `no "${HEADER_FIRST_CELL}" header row found.`,
    );
  }

  const header = rows[headerIndex].map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const idx = {
    firstName: col("First Name"),
    lastName: col("Last Name"),
    url: col("URL"),
    email: col("Email Address"),
    company: col("Company"),
    position: col("Position"),
    connectedOn: col("Connected On"),
  };

  return rows.slice(headerIndex + 1).map((r) => ({
    firstName: (r[idx.firstName] ?? "").trim(),
    lastName: (r[idx.lastName] ?? "").trim(),
    url: idx.url === -1 ? "" : (r[idx.url] ?? "").trim(),
    email: idx.email === -1 ? "" : (r[idx.email] ?? "").trim(),
    company: idx.company === -1 ? "" : (r[idx.company] ?? "").trim(),
    position: idx.position === -1 ? "" : (r[idx.position] ?? "").trim(),
    connectedOn:
      idx.connectedOn === -1 ? "" : (r[idx.connectedOn] ?? "").trim(),
  }));
}

// Only genuine provenance from the export — never fabricated content.
function provenanceNote(c: LinkedInConnection): string {
  const lines = [
    c.url && `LinkedIn: ${c.url}`,
    c.email && `Email: ${c.email}`,
    c.connectedOn && `Connected on LinkedIn: ${c.connectedOn}`,
  ].filter(Boolean);
  return lines.join("\n");
}

export function planLinkedInImport(
  connections: LinkedInConnection[],
  tier: Tier,
  existingNames: Iterable<string>,
  now: Date = new Date(),
): LinkedInImportPlan {
  const existing = new Set(
    Array.from(existingNames, (n) => n.trim().toLowerCase()),
  );
  const people: Person[] = [];
  const skippedExisting: string[] = [];
  let ignoredEmptyRows = 0;
  const seenInFile = new Set<string>();

  for (const c of connections) {
    const name = `${c.firstName} ${c.lastName}`.trim();
    if (!name) {
      ignoredEmptyRows++;
      continue;
    }
    const key = name.toLowerCase();
    if (existing.has(key)) {
      skippedExisting.push(name);
      continue;
    }
    if (seenInFile.has(key)) continue;
    seenInFile.add(key);

    people.push({
      id: crypto.randomUUID(),
      name,
      role: c.position || undefined,
      organization: c.company || undefined,
      tier,
      originStory: "",
      sharedContext: [],
      tags: ["linkedin-import"],
      notes: provenanceNote(c),
      createdAt: now,
      updatedAt: now,
    });
  }

  return { people, skippedExisting, ignoredEmptyRows };
}
