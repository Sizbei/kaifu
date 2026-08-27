/**
 * KAIFŪ embeddings — text in, unit-length vectors out.
 *
 * The interface is deliberately tiny so tests can substitute a fake and so
 * retrieval.ts never imports a vendor SDK directly. The only live
 * implementation is OpenAI `text-embedding-3-small`: 1536 dims, strong on
 * Japanese, cheap enough to embed every clause a user scans.
 *
 * Nothing here generates prose. Embeddings are numbers; the seam from the
 * product spec (Shisa is the only Japanese writer) is untouched.
 */

import OpenAI from "openai";

export const EMBEDDING_MODEL = "text-embedding-3-small";
/** Native width of text-embedding-3-small. Collections are created at this size. */
export const EMBEDDING_DIMS = 1536;

export type Vector = readonly number[];

export interface Embedder {
  /** One vector per input, in input order. Batches so indexing is one call. */
  embed(texts: readonly string[]): Promise<readonly Vector[]>;
}

/**
 * Live OpenAI embedder. Returns null rather than throwing when the key is
 * absent so the caller can decide to fall back — the demo must not die
 * because a sidecar credential is missing.
 */
export function openAiEmbedder(
  apiKey: string | undefined = process.env.OPENAI_API_KEY,
): Embedder | null {
  if (!apiKey) return null;
  const client = new OpenAI({ apiKey, timeout: 45_000, maxRetries: 1 });
  return {
    async embed(texts) {
      if (texts.length === 0) return [];
      const res = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: [...texts],
      });
      // The API documents input-order results but marks each with an index;
      // sort by it so a reordered response can never mis-assign a vector.
      return [...res.data]
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
    },
  };
}
