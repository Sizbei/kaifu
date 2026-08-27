/**
 * The privacy guarantee for the corpus graph, as a test.
 *
 * A card stuffed with sentinel PII goes through recordDecode against a
 * mocked driver, and every Cypher parameter is checked for leaks. If this
 * test fails, the README's "nothing personal is kept" claim is false.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionCard } from "@/lib/types";
import { GROUND_TRUTH } from "@/lib/groundtruth";

/* ---- driver mock: capture (cypher, params) of every session.run ---- */

type Call = { cypher: string; params: Record<string, unknown> };
const calls: Call[] = [];
const runMock = vi.fn(async (cypher: string, params: Record<string, unknown>) => {
  calls.push({ cypher, params });
  return { records: [] };
});
const closeMock = vi.fn(async () => undefined);

vi.mock("neo4j-driver", () => ({
  default: {
    driver: () => ({ session: () => ({ run: runMock, close: closeMock }), close: async () => undefined }),
    auth: { basic: () => ({}) },
  },
}));

/* ---- a card with PII sentinels in every free-text field ---- */

const PII = {
  name: "SENTINEL_TANAKA_HANAKO",
  address: "SENTINEL_1-2-3_KIKUKAWA",
  rawText: "SENTINEL_RAW_TRANSCRIPTION",
  summary: "SENTINEL_SUMMARY_TEXT",
  issuer: "SENTINEL_ISSUER_墨田区役所",
  action: "SENTINEL_ACTION_PAY",
  title: "SENTINEL_TITLE_JA",
  clause: "SENTINEL_CLAUSE_JA",
  whatThisIs: "SENTINEL_WHAT_THIS_IS",
} as const;

const entry = GROUND_TRUTH[0];

const card: ActionCard = {
  docType: "lease_clause",
  whatThisIs: PII.whatThisIs,
  titleJa: PII.title,
  issuer: PII.issuer,
  summary: `${PII.summary} ${PII.name} ${PII.address} ${PII.rawText}`,
  obligations: [
    {
      action: `${PII.action} ${PII.name}`,
      dueDate: { iso: "2026-09-30", raw: "令和8年9月30日", label: PII.name },
      amount: { yen: 108000, raw: "金108,000円", label: PII.address },
      conflict: { field: "amount", modelSaw: PII.name, documentSaid: PII.address },
    },
    { action: "Return the signed slip.", dueDate: null, amount: null, conflict: null },
  ],
  summaryOnly: false,
  findings: [
    {
      clauseJa: PII.clause,
      clausePlain: PII.name,
      guidelineSays: PII.address,
      citation: entry.citation,
      status: "differs",
    },
  ],
};

async function loadFresh() {
  vi.resetModules();
  return import("@/lib/graph");
}

describe("corpus graph privacy", () => {
  beforeEach(() => {
    calls.length = 0;
    runMock.mockClear();
    closeMock.mockClear();
    vi.stubEnv("NEO4J_URI", "bolt://mock:7687");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("never sends any free-text field to Neo4j", async () => {
    const { recordDecode } = await loadFresh();
    await recordDecode(card, { ward: "墨田区", issuedMonth: "2026-09", confidence: 0.9 });

    expect(calls).toHaveLength(1);
    const wire = JSON.stringify(calls[0].params);
    for (const sentinel of Object.values(PII)) expect(wire).not.toContain(sentinel);
    // Raw surface forms are quotes from the page; they must not travel either.
    expect(wire).not.toContain("令和8年");
    expect(wire).not.toContain("108,000");
  });

  it("writes only the whitelisted keys, with the expected shapes", async () => {
    const { recordDecode } = await loadFresh();
    await recordDecode(card, { ward: "墨田区", issuedMonth: "2026-09", confidence: 0.9, documentId: "t-1" });

    const p = calls[0].params;
    expect(Object.keys(p).sort()).toEqual(
      ["clauses", "confidence", "docType", "id", "issuedMonth", "obligations", "ward"].sort(),
    );
    expect(p.obligations).toEqual([
      { kind: "payment", amountYen: 108000, daysUntilDue: expect.any(Number) },
      { kind: "submit_form", amountYen: null, daysUntilDue: null },
    ]);
    expect(p.clauses).toEqual([{ clauseTypeId: entry.id, status: "differs" }]);
    expect(p).toMatchObject({ id: "t-1", docType: "lease_clause", ward: "墨田区", confidence: 0.9 });
  });

  it("drops a finding whose citation is not in the ground-truth corpus", async () => {
    const { anonymize } = await loadFresh();
    const forged = {
      ...card,
      findings: [{ ...card.findings[0], citation: { source: "x", section: "y", url: "z" } }],
    };
    expect(anonymize(forged, { documentId: "t" }).clauses).toEqual([]);
  });

  it("closes the session even when the query fails", async () => {
    runMock.mockRejectedValueOnce(new Error("boom"));
    const { recordDecode } = await loadFresh();
    await expect(recordDecode(card)).resolves.toBeUndefined();
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when NEO4J_URI is unset", async () => {
    vi.stubEnv("NEO4J_URI", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { recordDecode, clauseStats } = await loadFresh();
    await recordDecode(card);
    expect(await clauseStats(entry.id)).toBeNull();
    expect(runMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1); // logs once, not per call
    warn.mockRestore();
  });
});

describe("wardFromIssuer", () => {
  it("extracts the ward only for ward letters", async () => {
    const { wardFromIssuer } = await loadFresh();
    expect(wardFromIssuer("墨田区役所 税務課", "ward_tax_letter")).toBe("墨田区");
    expect(wardFromIssuer("日本年金機構 東京広域事務センター", "ward_tax_letter")).toBeUndefined();
    // A school name is identifying; never derive anything from it.
    expect(wardFromIssuer("墨田区立菊川小学校", "school_notice")).toBeUndefined();
  });
});
