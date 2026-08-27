/**
 * KAIFŪ retrieval — vector search over the MLIT ground-truth corpus.
 *
 * Why vectors: real leases paraphrase. 「畳の日焼け」「壁クロスの変色」 is a
 * 経年変化 clause even though neither string is a curated hint. Embeddings
 * catch that; substring hints do not.
 *
 * What retrieval is allowed to decide: only the *candidate set* handed to
 * the model. It never produces a citation. judge.ts still verifies every
 * citation against GROUND_TRUTH by exact match, and any point id that is
 * not in the corpus is discarded there — the payload is a lookup key, not
 * a source of truth.
 *
 * Two collections:
 *   kaifu_groundtruth — six MLIT entries, vector text = guidanceJa + hints.
 *   kaifu_clauses     — fixture lease clauses; the seed of the "is this
 *                       clause normal?" benchmark (similarClauses).
 */

import { createHash } from "node:crypto";
import { QdrantClient } from "@qdrant/js-client-rest";
import { EMBEDDING_DIMS, type Embedder, type Vector } from "@/lib/embed";

export const GROUND_TRUTH_COLLECTION = "kaifu_groundtruth";
export const CLAUSES_COLLECTION = "kaifu_clauses";

/**
 * Cosine floor for a hit to count. text-embedding-3-small puts unrelated
 * Japanese legal prose (a parking clause vs. a deposit rule) around
 * 0.20–0.35 and on-topic pairs above ~0.45, so 0.40 leaves margin on both
 * sides. Chosen from the model's published behaviour, not tuned live —
 * there was no API key on the build machine. Re-check with
 * `pnpm index:groundtruth` once a key exists and adjust here only.
 */
export const SCORE_THRESHOLD = 0.4;

/* ------------------------------------------------------------------ *
 * Store — the part of Qdrant we use, narrow enough to fake in tests.
 * ------------------------------------------------------------------ */

export type Payload = Readonly<Record<string, string>>;

export interface Point {
  /** Stable string key (entry id / fixture id). Hashed to a UUID for Qdrant. */
  readonly key: string;
  readonly vector: Vector;
  readonly payload: Payload;
}

export interface Hit {
  readonly key: string;
  readonly score: number;
  readonly payload: Payload;
}

export interface VectorStore {
  ensureCollection(name: string): Promise<void>;
  upsert(name: string, points: readonly Point[]): Promise<void>;
  search(name: string, vector: Vector, limit: number, threshold: number): Promise<readonly Hit[]>;
}

/**
 * Qdrant accepts only unsigned ints or UUIDs as point ids. Deriving a UUID
 * from the string key keeps re-indexing idempotent: same key, same point.
 */
export function pointId(key: string): string {
  const h = createHash("sha1").update(key).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const KEY_FIELD = "key";

function readPayload(raw: unknown): Payload {
  if (typeof raw !== "object" || raw === null) return {};
  return Object.fromEntries(
    Object.entries(raw).filter((kv): kv is [string, string] => typeof kv[1] === "string"),
  );
}

export function qdrantStore(url: string, apiKey?: string): VectorStore {
  const client = new QdrantClient({ url, apiKey: apiKey || undefined, timeout: 5_000 });
  return {
    async ensureCollection(name) {
      const { exists } = await client.collectionExists(name);
      if (exists) return;
      await client.createCollection(name, {
        vectors: { size: EMBEDDING_DIMS, distance: "Cosine" },
      });
    },
    async upsert(name, points) {
      if (points.length === 0) return;
      await client.upsert(name, {
        wait: true,
        points: points.map((p) => ({
          id: pointId(p.key),
          vector: [...p.vector],
          payload: { ...p.payload, [KEY_FIELD]: p.key },
        })),
      });
    },
    async search(name, vector, limit, threshold) {
      const { points } = await client.query(name, {
        query: [...vector],
        limit,
        score_threshold: threshold,
        with_payload: true,
      });
      return points.flatMap((p) => {
        const payload = readPayload(p.payload);
        const key = payload[KEY_FIELD];
        return key ? [{ key, score: p.score, payload }] : [];
      });
    },
  };
}

/* ------------------------------------------------------------------ *
 * Retriever — what judge.ts consumes.
 * ------------------------------------------------------------------ */

export interface Retriever {
  /** Ground-truth entry keys, best first, above SCORE_THRESHOLD. */
  retrieve(clauseText: string, limit: number): Promise<readonly Hit[]>;
  /** Nearest known lease clauses — the "is this clause normal?" seed. */
  similarClauses(clauseText: string, limit: number): Promise<readonly Hit[]>;
}

export function createRetriever(embedder: Embedder, store: VectorStore): Retriever {
  const searchIn = async (collection: string, text: string, limit: number) => {
    const [vector] = await embedder.embed([text]);
    if (!vector) return [];
    return store.search(collection, vector, limit, SCORE_THRESHOLD);
  };
  return {
    retrieve: (text, limit) => searchIn(GROUND_TRUTH_COLLECTION, text, limit),
    similarClauses: (text, limit) => searchIn(CLAUSES_COLLECTION, text, limit),
  };
}

/**
 * Wire the live retriever from the environment, or null when either
 * sidecar is unconfigured. Null is the signal judge.ts uses to stay on
 * hint routing; unreachable-Qdrant is discovered at call time and handled
 * the same way.
 */
export function retrieverFromEnv(
  embedder: Embedder | null,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Retriever | null {
  const url = env.QDRANT_URL;
  if (!url || !embedder) return null;
  return createRetriever(embedder, qdrantStore(url, env.QDRANT_API_KEY));
}
