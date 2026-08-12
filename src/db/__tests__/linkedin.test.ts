import { describe, expect, it } from "vitest";
import {
  InvalidLinkedInCsvError,
  parseCsv,
  parseLinkedInCsv,
  planLinkedInImport,
} from "../linkedin";

const HEADER =
  "First Name,Last Name,URL,Email Address,Company,Position,Connected On";

const PREAMBLE = `Notes:,,,,,,
"When exporting your connection data, you may notice that some of the email addresses are missing.",,,,,,
,,,,,,
`;

describe("parseCsv", () => {
  it("splits simple rows", () => {
    expect(parseCsv("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("handles quoted fields containing commas", () => {
    expect(parseCsv('a,"Deloitte, LLP",c')).toEqual([
      ["a", "Deloitte, LLP", "c"],
    ]);
  });

  it("handles escaped quotes inside quoted fields", () => {
    expect(parseCsv('"say ""hi""",b')).toEqual([['say "hi"', "b"]]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("handles quoted fields spanning newlines", () => {
    expect(parseCsv('"line1\nline2",b')).toEqual([["line1\nline2", "b"]]);
  });
});

describe("parseLinkedInCsv", () => {
  it("parses a file with the Notes: preamble", () => {
    const raw = `${PREAMBLE}${HEADER}\nAda,Lovelace,https://linkedin.com/in/ada,ada@example.com,Analytical Engines,Countess of Computing,12 Mar 2019\n`;
    const rows = parseLinkedInCsv(raw);
    expect(rows).toHaveLength(1);
    expect(rows[0].firstName).toBe("Ada");
    expect(rows[0].company).toBe("Analytical Engines");
    expect(rows[0].connectedOn).toBe("12 Mar 2019");
  });

  it("parses a file without a preamble", () => {
    const raw = `${HEADER}\nGrace,Hopper,,,US Navy,Rear Admiral,01 Jan 2020\n`;
    const rows = parseLinkedInCsv(raw);
    expect(rows).toHaveLength(1);
    expect(rows[0].lastName).toBe("Hopper");
    expect(rows[0].email).toBe("");
  });

  it("throws on a file with no LinkedIn header", () => {
    expect(() => parseLinkedInCsv("name,phone\nAda,555-1234")).toThrow(
      InvalidLinkedInCsvError,
    );
  });
});

describe("planLinkedInImport", () => {
  const NOW = new Date("2026-08-12T00:00:00Z");
  const conn = (first: string, last: string, company = "", position = "") => ({
    firstName: first,
    lastName: last,
    url: "",
    email: "",
    company,
    position,
    connectedOn: "",
  });

  it("maps connections to Person with the chosen tier", () => {
    const plan = planLinkedInImport(
      [conn("Ada", "Lovelace", "Analytical Engines", "Countess")],
      "dormant",
      [],
      NOW,
    );
    expect(plan.people).toHaveLength(1);
    const p = plan.people[0];
    expect(p.name).toBe("Ada Lovelace");
    expect(p.tier).toBe("dormant");
    expect(p.organization).toBe("Analytical Engines");
    expect(p.role).toBe("Countess");
    expect(p.tags).toEqual(["linkedin-import"]);
    expect(p.originStory).toBe("");
    expect(p.createdAt).toEqual(NOW);
  });

  it("carries only real provenance into notes", () => {
    const plan = planLinkedInImport(
      [
        {
          firstName: "Ada",
          lastName: "Lovelace",
          url: "https://linkedin.com/in/ada",
          email: "ada@example.com",
          company: "",
          position: "",
          connectedOn: "12 Mar 2019",
        },
      ],
      "dormant",
      [],
      NOW,
    );
    expect(plan.people[0].notes).toBe(
      "LinkedIn: https://linkedin.com/in/ada\nEmail: ada@example.com\nConnected on LinkedIn: 12 Mar 2019",
    );
  });

  it("skips people already in the graph, case-insensitively", () => {
    const plan = planLinkedInImport(
      [conn("Megan", "Torrance")],
      "dormant",
      ["megan torrance"],
      NOW,
    );
    expect(plan.people).toHaveLength(0);
    expect(plan.skippedExisting).toEqual(["Megan Torrance"]);
  });

  it("ignores blank rows from private-mode connections", () => {
    const plan = planLinkedInImport([conn("", "")], "dormant", [], NOW);
    expect(plan.people).toHaveLength(0);
    expect(plan.ignoredEmptyRows).toBe(1);
  });

  it("dedupes repeated names within the same file", () => {
    const plan = planLinkedInImport(
      [conn("Ada", "Lovelace"), conn("ada", "lovelace")],
      "dormant",
      [],
      NOW,
    );
    expect(plan.people).toHaveLength(1);
  });
});
