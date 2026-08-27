#!/usr/bin/env -S npx tsx
/**
 * KAIFŪ register evaluation harness.
 *
 * Generates the same reply at four Japanese politeness registers for a suite of
 * realistic scenarios, scores register separation with deterministic Japanese
 * linguistic checks, and emits docs/register-eval.md as a mark-up sheet for a
 * native-speaker reviewer.
 *
 * It drives the REAL register engine — `streamRegisters` in src/lib/shisa.ts,
 * which reads its prompts from src/lib/prompts — so the numbers describe what
 * the app ships: one completion per register, the app's temperature, the
 * gloss split and the meta-commentary stripping included. Run with
 * `pnpm eval:registers [--runs N]`. Scenarios run one at a time, so exactly
 * four requests are ever in flight.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { streamRegisters } from "@/lib/shisa";
import type { RegisterId, ReplyEvent, ReplyRequest } from "@/lib/types";

import { analyse, diceSimilarity, flagPair, flagRegister, type PairResult } from "./eval/analysis";
import { buildReport, printRunSummary } from "./eval/report";
import {
  ADJACENT_PAIRS,
  REGISTER_KEYS,
  computeStats,
  type RegisterResult,
  type Run,
  type ScenarioResult,
} from "./eval/results";
import { SCENARIOS, type Scenario } from "./eval/scenarios";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = resolve(ROOT, "docs/register-eval.md");
const MAX_ATTEMPTS = 3;
const SCENARIO_TIMEOUT_MS = 240_000;

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/** Fill process.env from .env.local without overriding anything already set. */
function loadEnvLocal(): void {
  const path = resolve(ROOT, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

interface Config {
  readonly model: string;
  readonly host: string;
  readonly runs: number;
}

function readConfig(): Config {
  loadEnvLocal();
  const baseUrl = process.env.SHISA_BASE_URL;
  const model = process.env.SHISA_MODEL;
  const missing = [
    !baseUrl && "SHISA_BASE_URL",
    !process.env.SHISA_API_KEY && "SHISA_API_KEY",
    !model && "SHISA_MODEL",
  ].filter((k): k is string => typeof k === "string");

  if (missing.length > 0 || !baseUrl || !model) {
    console.error(
      `\nMissing required environment variable(s): ${missing.join(", ")}\n\n` +
        `Set them in ${resolve(ROOT, ".env.local")} (see .env.example).\n` +
        `This harness only evaluates the Japan-hosted Shisa endpoint. There is no\n` +
        `fallback provider: KAIFŪ guarantees Japan-hosted inference for Japanese\n` +
        `generation, so a run against any other gateway would be meaningless.\n`,
    );
    process.exit(1);
  }

  const runsArg = process.argv.indexOf("--runs");
  const runs = runsArg === -1 ? 1 : Math.max(1, Number.parseInt(process.argv[runsArg + 1] ?? "1", 10) || 1);
  return { model, host: new URL(baseUrl).host, runs };
}

// ---------------------------------------------------------------------------
// Generation — through the app's own register engine.
// ---------------------------------------------------------------------------

interface Generated {
  readonly texts: Readonly<Record<RegisterId, string>>;
  readonly glosses: Readonly<Record<RegisterId, string>>;
  readonly errors: readonly string[];
}

const emptyByRegister = (): Record<RegisterId, string> => ({ casual: "", polite: "", keigo: "", formal: "" });

async function generateOnce(scenario: Scenario): Promise<Generated> {
  const req: ReplyRequest = {
    intent: scenario.intent,
    recipient: scenario.recipient,
    docType: scenario.docType,
    documentSummary: scenario.document,
  };
  const texts = emptyByRegister();
  const glosses = emptyByRegister();
  const errors: string[] = [];
  const onEvent = (e: ReplyEvent): void => {
    if (e.type === "delta") texts[e.register] += e.text;
    else if (e.type === "gloss") glosses[e.register] = e.glossEn;
    else if (e.type === "error") errors.push(`${e.register}: ${e.message}`);
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCENARIO_TIMEOUT_MS);
  try {
    await streamRegisters(req, onEvent, controller.signal);
  } finally {
    clearTimeout(timer);
  }
  if (controller.signal.aborted) errors.push("scenario timed out");
  return { texts, glosses, errors };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Whole-scenario retry: a register that errored (after the client's own 429 retries) is transport noise, not register data. */
async function generate(scenario: Scenario): Promise<Generated> {
  let last: Generated | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    last = await generateOnce(scenario);
    if (last.errors.length === 0) return last;
    if (attempt < MAX_ATTEMPTS) await sleep(/429|rate/i.test(last.errors.join(" ")) ? 6000 * attempt : 1500 * attempt);
  }
  if (!last) throw new Error("unreachable: no attempt ran");
  return last;
}

// ---------------------------------------------------------------------------
// Scenario run
// ---------------------------------------------------------------------------

async function runScenario(scenario: Scenario): Promise<ScenarioResult> {
  const started = Date.now();
  try {
    const gen = await generate(scenario);
    if (gen.errors.length > 0) {
      return { ok: false, scenario, error: gen.errors.join("; "), durationMs: Date.now() - started };
    }

    const build = (key: RegisterId): RegisterResult => {
      const text = gen.texts[key].trim();
      const analysis = analyse(text, scenario.latinAllowed);
      return { text, gloss: gen.glosses[key], analysis, flags: flagRegister(key, analysis) };
    };
    const registers: Record<RegisterId, RegisterResult> = {
      casual: build("casual"), polite: build("polite"), keigo: build("keigo"), formal: build("formal"),
    };

    const pairs = ADJACENT_PAIRS.map(([lower, upper]): PairResult => {
      const similarity = diceSimilarity(registers[lower].text, registers[upper].text);
      const lo = registers[lower].analysis;
      const hi = registers[upper].analysis;
      return {
        lower, upper, similarity,
        formalityGain: hi.formality - lo.formality,
        charDelta: hi.chars - lo.chars,
        flags: flagPair(lower, upper, lo, hi, similarity),
      };
    });

    const allFlags = [...REGISTER_KEYS.flatMap((k) => registers[k].flags), ...pairs.flatMap((p) => p.flags)];
    return {
      ok: true, scenario, registers, pairs, allFlags,
      errorCount: allFlags.filter((f) => f.severity === "error").length,
      warnCount: allFlags.filter((f) => f.severity === "warn").length,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return { ok: false, scenario, error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - started };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const config = readConfig();
  const startedAt = new Date();
  console.log(`Register eval — ${SCENARIOS.length} scenarios × ${REGISTER_KEYS.length} registers × ${config.runs} run(s)`);
  console.log(`Model: ${config.model} @ ${config.host}\n`);

  const runs: Run[] = [];
  for (let index = 1; index <= config.runs; index += 1) {
    if (config.runs > 1) console.log(`--- run ${index}/${config.runs} ---`);
    const results: ScenarioResult[] = [];
    for (const scenario of SCENARIOS) {
      const r = await runScenario(scenario);
      const mark = r.ok ? (r.errorCount === 0 ? "PASS" : `FAIL(${r.errorCount})`) : "ERROR";
      console.log(`  ${mark.padEnd(8)} ${scenario.id} (${(r.durationMs / 1000).toFixed(1)}s)`);
      if (!r.ok) console.log(`           ${r.error}`);
      results.push(r);
    }
    const run: Run = { index, results, stats: computeStats(results) };
    printRunSummary(run);
    runs.push(run);
    // Written after every run, so an interrupted multi-run still leaves a report.
    writeFileSync(OUT_PATH, buildReport(runs, config, startedAt), "utf8");
  }

  console.log(`\nReport written to ${OUT_PATH}`);
}

main().catch((err: unknown) => {
  console.error("\nEval run aborted:", err instanceof Error ? err.message : err);
  process.exit(1);
});
