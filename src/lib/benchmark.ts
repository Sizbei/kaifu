/**
 * Client-side view of the corpus benchmark that /api/decode returns in the
 * `X-Kaifu-Benchmark` header (ActionCard is frozen, so it cannot ride on the
 * card). Pure: parsing and wording only, no I/O.
 */

import { findEntryByCitation, type Citation } from "@/lib/groundtruth";

export const BENCHMARK_HEADER = "X-Kaifu-Benchmark";

/** Mirrors ClauseStats in graph.ts without importing the Neo4j module client-side. */
export interface BenchmarkStats {
  total: number;
  containing: number;
  differs: number;
  matches: number;
}

/** Keyed by ground-truth id. */
export type BenchmarkMap = Readonly<Record<string, BenchmarkStats>>;

/** Below this many leases the line is labelled "Early corpus" so 5 documents are not read as a statistic. */
export const EARLY_CORPUS_BELOW = 20;

function isStats(v: unknown): v is BenchmarkStats {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (["total", "containing", "differs", "matches"] as const).every(
    (k) => typeof s[k] === "number" && Number.isFinite(s[k]),
  );
}

/** Null on a missing or malformed header; a bad sidecar must never break the card. */
export function parseBenchmarkHeader(raw: string | null): BenchmarkMap | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const entries = Object.entries(parsed).filter((kv): kv is [string, BenchmarkStats] => isStats(kv[1]));
    return entries.length ? Object.fromEntries(entries) : null;
  } catch {
    return null;
  }
}

export function benchmarkForCitation(
  benchmark: BenchmarkMap | null | undefined,
  citation: Citation,
): BenchmarkStats | null {
  if (!benchmark) return null;
  const id = findEntryByCitation(citation)?.id;
  return id ? (benchmark[id] ?? null) : null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * One neutral, numeric sentence. "Differs" is the strongest word on the card
 * and stays so here; nothing is called common, unusual, fair or unfair.
 */
export function benchmarkLine(s: BenchmarkStats): string {
  const prefix = s.total < EARLY_CORPUS_BELOW ? "Early corpus — in" : "In";
  const contain = `${prefix} the KAIFŪ corpus, ${s.containing} of ${plural(s.total, "lease")} contain a clause on this point`;
  if (s.containing === 0) return `${contain}.`;
  return `${contain}; ${s.differs} differ${s.differs === 1 ? "s" : ""} from the guideline and ${s.matches} match${s.matches === 1 ? "es" : ""} it.`;
}
