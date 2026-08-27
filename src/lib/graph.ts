/**
 * KAIFŪ corpus graph — the v0 seed of the clause-benchmark flywheel.
 *
 * Neo4j holds an ANONYMIZED subgraph of decoded documents so the product
 * can answer "is this clause / amount typical?" against volume. The
 * README promises that nothing personal is kept, and this module is where
 * that promise is enforced structurally: `anonymize()` is the only path
 * into the database, and it produces a record built from categorical and
 * numeric facts only. No rawText, no summary, no issuer, no action text,
 * no image ever reaches a Cypher parameter — `graph.test.ts` asserts it.
 *
 * Two more rules:
 *   - Opt-in only. The route calls `recordDecode` only when the caller
 *     sent `contribute: true`. This module never decides that.
 *   - Never fatal. If NEO4J_URI is unset or the server is down, every
 *     function is a no-op that logs once. A sidecar must not kill a decode.
 */

import neo4j, { type Driver } from "neo4j-driver";
import { randomUUID } from "node:crypto";
import { GROUND_TRUTH, findEntryByCitation } from "@/lib/groundtruth";
import type { ActionCard, DocType, JudgeFinding, Obligation } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * Categorical vocabulary. Small on purpose: a kind is a bucket for
 * statistics, not a description of the obligation.
 * ------------------------------------------------------------------ */

export const OBLIGATION_KINDS = ["payment", "submit_form", "bring_items", "attend", "notify"] as const;
export type ObligationKind = (typeof OBLIGATION_KINDS)[number];

/** Anonymized obligation: bucket + numbers. Never the action string. */
export interface ObligationFact {
  kind: ObligationKind;
  amountYen: number | null;
  daysUntilDue: number | null;
}

/** Anonymized clause finding: which guideline entry, and how the clause sat against it. */
export interface ClauseFact {
  clauseTypeId: string;
  status: JudgeFinding["status"];
}

/** Everything that is written for one document. This shape IS the privacy contract. */
export interface DecodeRecord {
  id: string;
  docType: DocType;
  ward: string | null;
  issuedMonth: string | null;
  confidence: number;
  obligations: readonly ObligationFact[];
  clauses: readonly ClauseFact[];
}

export interface RecordOptions {
  /** Issuing ward, e.g. "墨田区". Only meaningful for ward letters — it is the issuer, not the user. */
  ward?: string;
  /** "YYYY-MM". Coarse on purpose; a day would narrow the document too far. */
  issuedMonth?: string;
  /** Vision confidence 0..1. Defaults to 1 for curated fixtures. */
  confidence?: number;
  /** Stable id for idempotent seeding. Real decodes get a random UUID. */
  documentId?: string;
}

/* ------------------------------------------------------------------ *
 * Pure anonymization. Exported so tests can pin the exact output.
 * ------------------------------------------------------------------ */

const KIND_PATTERNS: readonly (readonly [ObligationKind, RegExp])[] = [
  ["submit_form", /\b(return|submit|fill in|hand in|file)\b|slip|form/i],
  ["bring_items", /\b(bring|pack|wear)\b/i],
  ["attend", /\b(attend|come to|be at|visit)\b/i],
  ["payment", /\b(pay|keep|deposit|expect)\b|¥/i],
];

/**
 * Bucket an obligation. The action string is READ here and then dropped;
 * only the bucket survives. An amount is the strongest signal, so it wins
 * over wording ("send ¥1,200 in the envelope" is a payment, not a form).
 */
export function classifyObligation(o: Obligation): ObligationKind {
  if (o.amount) return "payment";
  const hit = KIND_PATTERNS.find(([, re]) => re.test(o.action));
  return hit ? hit[0] : "notify";
}

/** Whole days from `now` to the due date; negative when already past. */
function daysUntil(iso: string, now: Date): number | null {
  const due = Date.parse(iso);
  return Number.isNaN(due) ? null : Math.round((due - now.getTime()) / 86_400_000);
}

/**
 * The ward is a categorical about the ISSUER of a ward letter ("墨田区役所
 * 税務課" → "墨田区"). For any other document type the issuer is a school
 * or a company, which is too identifying, so we return null.
 */
export function wardFromIssuer(issuer: string | null, docType: DocType): string | undefined {
  if (docType !== "ward_tax_letter" || !issuer) return undefined;
  const m = /^(\S{1,4}?区)/.exec(issuer);
  return m ? m[1] : undefined;
}

/**
 * Build the record that will be written. Findings are mapped to ground-truth
 * ids by exact citation match — the same rule judge.ts uses — so a finding
 * that does not point at the corpus is dropped rather than stored as text.
 */
export function anonymize(card: ActionCard, opts: RecordOptions = {}, now: Date = new Date()): DecodeRecord {
  return {
    id: opts.documentId ?? randomUUID(),
    docType: card.docType,
    ward: opts.ward ?? null,
    issuedMonth: opts.issuedMonth ?? null,
    confidence: opts.confidence ?? 1,
    obligations: card.obligations.map((o) => ({
      kind: classifyObligation(o),
      amountYen: o.amount?.yen ?? null,
      daysUntilDue: o.dueDate ? daysUntil(o.dueDate.iso, now) : null,
    })),
    clauses: card.findings.flatMap((f) => {
      const entry = findEntryByCitation(f.citation);
      return entry ? [{ clauseTypeId: entry.id, status: f.status }] : [];
    }),
  };
}

/* ------------------------------------------------------------------ *
 * Driver singleton + graceful degradation.
 * ------------------------------------------------------------------ */

let driver: Driver | null | undefined;
let warned = false;

function warnOnce(msg: string): void {
  if (!warned) console.warn(`[graph] ${msg} — corpus graph disabled for this process.`);
  warned = true;
}

function getDriver(): Driver | null {
  if (driver !== undefined) return driver;
  const uri = process.env.NEO4J_URI;
  if (!uri) {
    warnOnce("NEO4J_URI is not set");
    driver = null;
    return driver;
  }
  driver = neo4j.driver(uri, neo4j.auth.basic(process.env.NEO4J_USER ?? "neo4j", process.env.NEO4J_PASSWORD ?? ""), {
    // Yen and counts are far inside Number's safe range; native numbers keep call sites plain.
    disableLosslessIntegers: true,
    // An unreachable sidecar must not eat the decode route's 60 s budget.
    connectionTimeout: 5_000,
    connectionAcquisitionTimeout: 5_000,
  });
  return driver;
}

type Params = Record<string, unknown>;

/** Run one query. Any driver failure degrades to `null` and a single log line. */
async function run(cypher: string, params: Params): Promise<Record<string, unknown>[] | null> {
  const d = getDriver();
  if (!d) return null;
  const session = d.session();
  try {
    const result = await session.run(cypher, params);
    return result.records.map((r) => r.toObject());
  } catch (err) {
    warnOnce(`Neo4j unreachable (${err instanceof Error ? err.message : String(err)})`);
    return null;
  } finally {
    await session.close();
  }
}

/** For scripts: release the pool so the process can exit. */
export async function closeGraph(): Promise<void> {
  const d = driver;
  driver = undefined;
  await d?.close();
}

/* ------------------------------------------------------------------ *
 * Writes.
 * ------------------------------------------------------------------ */

const MERGE_CLAUSE_TYPES = `
UNWIND $entries AS e
MERGE (c:ClauseType {id: e.id})
MERGE (g:Guideline {source: e.source, section: e.section, url: e.url})
MERGE (c)-[:GOVERNED_BY]->(g)`;

/** Idempotent: the six MLIT entries become ClauseType→Guideline pairs. Public, so the seed can call it. */
export async function mergeClauseTypes(): Promise<void> {
  await run(MERGE_CLAUSE_TYPES, {
    entries: GROUND_TRUTH.map((e) => ({ id: e.id, ...e.citation })),
  });
}

const WRITE_DOCUMENT = `
MERGE (d:Document {id: $id})
SET d.docType = $docType, d.ward = $ward, d.issuedMonth = $issuedMonth, d.confidence = $confidence
// Re-seeding the same id must not accumulate obligations or stale clause links.
CALL { WITH d OPTIONAL MATCH (d)-[:HAS_OBLIGATION]->(old:Obligation) DETACH DELETE old }
CALL { WITH d OPTIONAL MATCH (d)-[stale:CONTAINS_CLAUSE]->() DELETE stale }
// Subqueries, not bare UNWIND: an empty list must not zero out the rows for the next step.
CALL {
  WITH d UNWIND $obligations AS o
  // JS numbers arrive as Float; yen and days are integers in the graph.
  CREATE (d)-[:HAS_OBLIGATION]->(:Obligation {kind: o.kind, amountYen: toInteger(o.amountYen), daysUntilDue: toInteger(o.daysUntilDue)})
}
CALL {
  WITH d UNWIND $clauses AS cl
  MATCH (c:ClauseType {id: cl.clauseTypeId})
  MERGE (d)-[r:CONTAINS_CLAUSE]->(c) SET r.status = cl.status
}
RETURN d.id AS id`;

/**
 * Write one decoded document's anonymized subgraph. Call ONLY after the
 * user opted in. Never throws; a failure is logged and the decode proceeds.
 */
export async function recordDecode(card: ActionCard, opts: RecordOptions = {}): Promise<void> {
  const rec = anonymize(card, opts);
  await run(WRITE_DOCUMENT, { ...rec });
}

/* ------------------------------------------------------------------ *
 * Reads — the "is this normal?" queries.
 * ------------------------------------------------------------------ */

export interface ClauseStats {
  /** Leases in the corpus. */
  total: number;
  /** Leases that contain this clause type at all. */
  containing: number;
  differs: number;
  matches: number;
}

const CLAUSE_STATS = `
MATCH (c:ClauseType {id: $id})
OPTIONAL MATCH (d:Document {docType: 'lease_clause'})-[r:CONTAINS_CLAUSE]->(c)
WITH count(d) AS containing,
     sum(CASE r.status WHEN 'differs' THEN 1 ELSE 0 END) AS differs,
     sum(CASE r.status WHEN 'matches' THEN 1 ELSE 0 END) AS matches
MATCH (lease:Document {docType: 'lease_clause'})
RETURN count(lease) AS total, containing, differs, matches`;

export async function clauseStats(clauseTypeId: string): Promise<ClauseStats | null> {
  const rows = await run(CLAUSE_STATS, { id: clauseTypeId });
  const row = rows?.[0];
  if (!row) return null;
  return {
    total: Number(row.total),
    containing: Number(row.containing),
    differs: Number(row.differs),
    matches: Number(row.matches),
  };
}

export interface AmountStats {
  n: number;
  median: number;
  p25: number;
  p75: number;
}

const AMOUNT_STATS = `
MATCH (d:Document {docType: $docType})-[:HAS_OBLIGATION]->(o:Obligation {kind: $kind})
WHERE o.amountYen IS NOT NULL
RETURN count(o) AS n,
       percentileDisc(o.amountYen, 0.5) AS median,
       percentileDisc(o.amountYen, 0.25) AS p25,
       percentileDisc(o.amountYen, 0.75) AS p75`;

export async function amountStats(kind: ObligationKind, docType: DocType): Promise<AmountStats | null> {
  const rows = await run(AMOUNT_STATS, { kind, docType });
  const row = rows?.[0];
  if (!row || Number(row.n) === 0) return null;
  return { n: Number(row.n), median: Number(row.median), p25: Number(row.p25), p75: Number(row.p75) };
}
