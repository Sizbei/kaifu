/**
 * Index the MLIT ground-truth corpus (and the fixture lease clauses) into
 * Qdrant. Idempotent: point ids are derived from entry ids, so running it
 * twice overwrites rather than duplicates.
 *
 *   pnpm index:groundtruth
 *
 * Needs OPENAI_API_KEY and QDRANT_URL (from the environment or .env.local).
 * The payload carries the entry id and citation for debugging only —
 * judge.ts resolves ids back through GROUND_TRUTH and ignores anything
 * the corpus does not know.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openAiEmbedder } from "@/lib/embed";
import { GROUND_TRUTH } from "@/lib/groundtruth";
import {
  CLAUSES_COLLECTION,
  GROUND_TRUTH_COLLECTION,
  qdrantStore,
  type Point,
  type VectorStore,
} from "@/lib/retrieval";
import { leaseClauseFixtures } from "@/fixtures/lease-clauses";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

/**
 * Vector text = the Japanese guidance plus every hint. The hints pull the
 * embedding toward the clause vocabulary a lease actually uses, so a
 * paraphrased clause lands near the entry even when the guidance prose is
 * abstract.
 */
function groundTruthText(e: (typeof GROUND_TRUTH)[number]): string {
  return `${e.topic}\n${e.guidanceJa}\n${e.hints.join("、")}`;
}

async function indexCollection(
  store: VectorStore,
  name: string,
  keys: readonly string[],
  texts: readonly string[],
  payloads: readonly Point["payload"][],
  embed: (t: readonly string[]) => Promise<readonly (readonly number[])[]>,
): Promise<void> {
  await store.ensureCollection(name);
  const vectors = await embed(texts);
  const points = keys.map((key, i) => ({ key, vector: vectors[i], payload: payloads[i] }));
  await store.upsert(name, points);
  console.log(`${name}: upserted ${points.length} points`);
}

async function main(): Promise<void> {
  loadEnvLocal();
  const embedder = openAiEmbedder();
  const url = process.env.QDRANT_URL;
  if (!embedder) throw new Error("OPENAI_API_KEY is not set");
  if (!url) throw new Error("QDRANT_URL is not set");
  const store = qdrantStore(url, process.env.QDRANT_API_KEY);
  const embed = (t: readonly string[]) => embedder.embed(t);

  await indexCollection(
    store,
    GROUND_TRUTH_COLLECTION,
    GROUND_TRUTH.map((e) => e.id),
    GROUND_TRUTH.map(groundTruthText),
    GROUND_TRUTH.map((e) => ({
      id: e.id,
      topic: e.topic,
      citationSource: e.citation.source,
      citationSection: e.citation.section,
      citationUrl: e.citation.url,
    })),
    embed,
  );

  // Benchmark seed: every fixture clause, tagged so a nearest-neighbour hit
  // can say "this looks like the 敷金 clause in our reference lease".
  await indexCollection(
    store,
    CLAUSES_COLLECTION,
    leaseClauseFixtures.map((f) => f.id),
    leaseClauseFixtures.map((f) => f.rawText),
    leaseClauseFixtures.map((f) => ({ docType: f.docType, clauseTopic: f.titleJa })),
    embed,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
