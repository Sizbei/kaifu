import { describe, expect, it } from "vitest";
import type { Embedder, Vector } from "@/lib/embed";
import {
  CLAUSES_COLLECTION,
  GROUND_TRUTH_COLLECTION,
  SCORE_THRESHOLD,
  createRetriever,
  pointId,
  retrieverFromEnv,
  type Hit,
  type Point,
  type VectorStore,
} from "@/lib/retrieval";

/* ------------------------------------------------------------------ *
 * Fakes
 * ------------------------------------------------------------------ */

/** Embeds each text as a one-hot-ish vector keyed by its length — enough to be distinct. */
const fakeEmbedder: Embedder = {
  async embed(texts) {
    return texts.map((t) => [t.length, 1]);
  },
};

interface Call {
  readonly collection: string;
  readonly vector: Vector;
  readonly limit: number;
  readonly threshold: number;
}

function fakeStore(hits: readonly Hit[]): { store: VectorStore; calls: Call[] } {
  const calls: Call[] = [];
  const store: VectorStore = {
    async ensureCollection() {},
    async upsert() {},
    async search(collection, vector, limit, threshold) {
      calls.push({ collection, vector, limit, threshold });
      return hits;
    },
  };
  return { store, calls };
}

/* ------------------------------------------------------------------ *
 * pointId
 * ------------------------------------------------------------------ */

describe("pointId", () => {
  it("is a UUID-shaped string", () => {
    expect(pointId("genjo-kaifuku-definition")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("is deterministic, so re-indexing overwrites rather than duplicates", () => {
    expect(pointId("shikikin-return")).toBe(pointId("shikikin-return"));
    expect(pointId("shikikin-return")).not.toBe(pointId("koshinryo-not-in-model-lease"));
  });
});

/* ------------------------------------------------------------------ *
 * createRetriever
 * ------------------------------------------------------------------ */

describe("createRetriever", () => {
  const hits: readonly Hit[] = [
    { key: "genjo-kaifuku-wear-examples", score: 0.71, payload: {} },
    { key: "genjo-kaifuku-definition", score: 0.62, payload: {} },
  ];

  it("embeds the clause and searches the ground-truth collection with the threshold", async () => {
    const { store, calls } = fakeStore(hits);
    const out = await createRetriever(fakeEmbedder, store).retrieve("畳の日焼け", 3);
    expect(out).toEqual(hits);
    expect(calls).toEqual([
      {
        collection: GROUND_TRUTH_COLLECTION,
        vector: [5, 1],
        limit: 3,
        threshold: SCORE_THRESHOLD,
      },
    ]);
  });

  it("searches the clause collection for similarClauses", async () => {
    const { store, calls } = fakeStore([]);
    await createRetriever(fakeEmbedder, store).similarClauses("駐車場", 5);
    expect(calls[0]?.collection).toBe(CLAUSES_COLLECTION);
  });

  it("returns nothing when the embedder yields no vector", async () => {
    const empty: Embedder = { async embed() { return []; } };
    const { store, calls } = fakeStore(hits);
    expect(await createRetriever(empty, store).retrieve("x", 3)).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("propagates a store failure so the caller can fall back", async () => {
    const failing: VectorStore = {
      async ensureCollection() {},
      async upsert() {},
      async search() { throw new Error("ECONNREFUSED"); },
    };
    await expect(createRetriever(fakeEmbedder, failing).retrieve("x", 3)).rejects.toThrow(
      /ECONNREFUSED/,
    );
  });
});

/* ------------------------------------------------------------------ *
 * retrieverFromEnv — the degrade-gracefully contract
 * ------------------------------------------------------------------ */

describe("retrieverFromEnv", () => {
  it("is null without QDRANT_URL", () => {
    expect(retrieverFromEnv(fakeEmbedder, {})).toBeNull();
  });

  it("is null without an embedder (no OPENAI_API_KEY)", () => {
    expect(retrieverFromEnv(null, { QDRANT_URL: "http://localhost:6333" })).toBeNull();
  });

  it("builds a retriever when both are present", () => {
    expect(retrieverFromEnv(fakeEmbedder, { QDRANT_URL: "http://localhost:6333" })).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Type-level smoke: Point/Payload shapes used by the index script.
 * ------------------------------------------------------------------ */

describe("Point", () => {
  it("carries a string payload only", () => {
    const p: Point = { key: "k", vector: [0, 1], payload: { citation: "x" } };
    expect(Object.values(p.payload).every((v) => typeof v === "string")).toBe(true);
  });
});
