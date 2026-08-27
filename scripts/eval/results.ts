/**
 * Result shapes shared by the runner and the report, plus the per-run
 * statistics the tuning loop steers by.
 */

import { REGISTERS, type RegisterId } from "@/lib/types";

import {
  MIN_FORMALITY_GAIN,
  NEAR_IDENTICAL_THRESHOLD,
  type Analysis,
  type Flag,
  type PairResult,
} from "./analysis";
import type { Scenario } from "./scenarios";

export const REGISTER_KEYS: readonly RegisterId[] = REGISTERS.map((r) => r.id);
export const ADJACENT_PAIRS: readonly (readonly [RegisterId, RegisterId])[] = [
  ["casual", "polite"],
  ["polite", "keigo"],
  ["keigo", "formal"],
];

export const jaOf = (id: RegisterId): string => REGISTERS.find((r) => r.id === id)?.ja ?? id;
export const enOf = (id: RegisterId): string => REGISTERS.find((r) => r.id === id)?.en ?? id;

export interface RegisterResult {
  readonly text: string;
  readonly gloss: string;
  readonly analysis: Analysis;
  readonly flags: readonly Flag[];
}

export interface ScenarioOk {
  readonly ok: true;
  readonly scenario: Scenario;
  readonly registers: Readonly<Record<RegisterId, RegisterResult>>;
  readonly pairs: readonly PairResult[];
  readonly allFlags: readonly Flag[];
  readonly errorCount: number;
  readonly warnCount: number;
  readonly durationMs: number;
}

export interface ScenarioFailed {
  readonly ok: false;
  readonly scenario: Scenario;
  readonly error: string;
  readonly durationMs: number;
}

export type ScenarioResult = ScenarioOk | ScenarioFailed;

export const isOk = (r: ScenarioResult): r is ScenarioOk => r.ok;
export const isFailed = (r: ScenarioResult): r is ScenarioFailed => !r.ok;

export interface PairStat {
  readonly lower: RegisterId;
  readonly upper: RegisterId;
  readonly meanSim: number;
  readonly meanGain: number;
  readonly collapses: number;
  readonly flat: number;
  readonly n: number;
}

export interface RunStats {
  readonly total: number;
  readonly okCount: number;
  readonly clean: number;
  readonly passRate: number;
  /** Scenarios whose カジュアル rendering is plain form (no POLITE_IN_CASUAL). */
  readonly casualPlain: number;
  /** Scenarios whose 敬語 rendering carries at least one 尊敬語 marker. */
  readonly keigoSonkeigo: number;
  readonly formalSonkeigo: number;
  readonly nearIdentical: number;
  readonly registerErrors: Readonly<Record<RegisterId, number>>;
  readonly codeCounts: ReadonlyMap<string, number>;
  readonly pairStats: readonly PairStat[];
  readonly failed: readonly ScenarioFailed[];
  readonly worstScenario: ScenarioOk | null;
}

export interface Run {
  readonly index: number;
  readonly results: readonly ScenarioResult[];
  readonly stats: RunStats;
}

export function computeStats(results: readonly ScenarioResult[]): RunStats {
  const ok = results.filter(isOk);
  const failed = results.filter(isFailed);
  const clean = ok.filter((r) => r.errorCount === 0).length;

  const registerErrors: Record<RegisterId, number> = { casual: 0, polite: 0, keigo: 0, formal: 0 };
  const codeCounts = new Map<string, number>();
  for (const r of ok) {
    for (const f of r.allFlags) {
      codeCounts.set(f.code, (codeCounts.get(f.code) ?? 0) + 1);
      if (f.severity === "error" && (REGISTER_KEYS as readonly string[]).includes(f.register)) {
        registerErrors[f.register as RegisterId] += 1;
      }
    }
  }

  const lacks = (r: ScenarioOk, key: RegisterId, code: string): boolean =>
    !r.registers[key].flags.some((f) => f.code === code);

  const pairStats = ADJACENT_PAIRS.map(([lower, upper]): PairStat => {
    const rows = ok.flatMap((r) => r.pairs.filter((p) => p.lower === lower && p.upper === upper));
    const n = rows.length || 1;
    return {
      lower, upper,
      meanSim: rows.reduce((s, p) => s + p.similarity, 0) / n,
      meanGain: rows.reduce((s, p) => s + p.formalityGain, 0) / n,
      collapses: rows.filter((p) => p.similarity >= NEAR_IDENTICAL_THRESHOLD).length,
      flat: rows.filter((p) => p.formalityGain < MIN_FORMALITY_GAIN).length,
      n: rows.length,
    };
  });

  return {
    total: results.length,
    okCount: ok.length,
    clean,
    passRate: results.length ? (clean / results.length) * 100 : 0,
    casualPlain: ok.filter((r) => lacks(r, "casual", "POLITE_IN_CASUAL")).length,
    keigoSonkeigo: ok.filter((r) => lacks(r, "keigo", "NO_SONKEIGO")).length,
    formalSonkeigo: ok.filter((r) => lacks(r, "formal", "NO_SONKEIGO")).length,
    nearIdentical: codeCounts.get("NEAR_IDENTICAL") ?? 0,
    registerErrors,
    codeCounts,
    pairStats,
    failed,
    worstScenario: ok.length ? ok.reduce((a, b) => (b.errorCount > a.errorCount ? b : a)) : null,
  };
}
