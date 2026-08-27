/**
 * Stage 1: OCR, classification and field extraction.
 *
 * This module owns one half of KAIFŪ's central seam. The vision model looks
 * at pixels and reports what is on them, in structured JSON. It never writes
 * anything a user reads, never translates, and never generates Japanese —
 * a separate Japan-hosted model (Shisa) does all of that. The seam is the
 * product's core claim, so the prompt (vision-schema.ts) forbids the crossing
 * explicitly and src/lib/vision.test.ts guards the wording.
 *
 * Two providers sit behind `analyzeDocument`:
 *   - `openai`        — Responses API with strict structured outputs (below).
 *   - `shisa-gateway` — Qwen multimodal models via the Shisa gateway
 *                       (vision-gateway.ts). Not the Japan-hosted shisa-ai/*
 *                       models; see docs/ARCHITECTURE.md §1.
 */

import OpenAI from "openai";

import { VisionResultSchema, type VisionResult } from "@/lib/types";
import { analyzeViaGateway } from "@/lib/vision-gateway";
import {
  VISION_FORMAT,
  VISION_SYSTEM_PROMPT,
  VisionConfigError,
  VisionResponseError,
  VisionSchemaError,
} from "@/lib/vision-schema";

export {
  VISION_FORMAT,
  VISION_SYSTEM_PROMPT,
  VisionConfigError,
  VisionError,
  VisionResponseError,
  VisionSchemaError,
} from "@/lib/vision-schema";

/**
 * Re-exported so callers gating on confidence import it from the module that
 * produced the confidence. Deliberately NOT applied here: this stage reports
 * what it saw, and suppression is a presentation decision made downstream
 * where the summary-only fallback lives.
 */
export { CONFIDENCE_THRESHOLD } from "@/lib/types";

/**
 * GPT-5.6 — the current flagship vision model, and this is the only stage
 * where accuracy is unrecoverable: a character missed here is missed by every
 * downstream stage, because extract.ts regexes over `rawText` and Shisa never
 * sees the image. Overridable via OPENAI_VISION_MODEL or `opts.model`.
 */
const DEFAULT_MODEL = "gpt-5.5";

/** Generous: a dense A4 notice transcribed verbatim is the long case. */
const MAX_OUTPUT_TOKENS = 16000;

export interface AnalyzeOptions {
  model?: string;
}

/* ------------------------------------------------------------------ *
 * Provider selection.
 * ------------------------------------------------------------------ */

export const VISION_PROVIDERS = ["openai", "shisa-gateway"] as const;
export type VisionProvider = (typeof VISION_PROVIDERS)[number];

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Explicit VISION_PROVIDER wins. Otherwise: the gateway when only a Shisa
 * key is present, OpenAI in every other case (including "both keys set",
 * so an existing deployment does not silently change provider).
 */
export function resolveVisionProvider(env: Env = process.env): VisionProvider {
  const explicit = env.VISION_PROVIDER?.trim();
  if (explicit) {
    if ((VISION_PROVIDERS as readonly string[]).includes(explicit)) {
      return explicit as VisionProvider;
    }
    throw new VisionConfigError(
      `VISION_PROVIDER="${explicit}" is not recognised. Use one of: ${VISION_PROVIDERS.join(", ")}.`,
    );
  }
  if (env.SHISA_API_KEY?.trim() && !env.OPENAI_API_KEY?.trim()) return "shisa-gateway";
  return "openai";
}

/**
 * Sends one document image to the vision model and returns the structured
 * reading of it. Throws rather than degrading: an unreadable result is the
 * caller's decision to make, and a silently emptied VisionResult would be
 * indistinguishable from a blank page.
 */
export async function analyzeDocument(
  imageBase64: string,
  opts: AnalyzeOptions = {},
): Promise<VisionResult> {
  if (resolveVisionProvider() === "shisa-gateway") {
    return analyzeViaGateway(imageBase64, opts);
  }
  return analyzeViaOpenAI(imageBase64, opts);
}

async function analyzeViaOpenAI(
  imageBase64: string,
  opts: AnalyzeOptions,
): Promise<VisionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new VisionConfigError(
      "OPENAI_API_KEY is not set. Export it in the server environment (e.g. .env.local) before calling analyzeDocument.",
    );
  }

  // Bounded so the route answers inside its own 60 s budget rather than a platform 504.
  const client = new OpenAI({ apiKey, timeout: 45_000, maxRetries: 1 });

  const response = await client.responses.create({
    model: opts.model ?? process.env.OPENAI_VISION_MODEL ?? DEFAULT_MODEL,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    instructions: VISION_SYSTEM_PROMPT,
    // Forced: the seam holds only if a free-text answer is not reachable.
    text: { format: VISION_FORMAT },
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_image",
            image_url: `data:image/jpeg;base64,${imageBase64}`,
            // Furigana and handwritten corrections vanish at the default tiling.
            detail: "high",
          },
          { type: "input_text", text: "Record this document." },
        ],
      },
    ],
  });

  const message = response.output.find(
    (item): item is OpenAI.Responses.ResponseOutputMessage => item.type === "message",
  );
  const content = message?.content[0];

  if (!content || content.type !== "output_text") {
    const detail =
      content?.type === "refusal"
        ? `refusal: ${content.refusal}`
        : `status: ${response.status}, reason: ${response.incomplete_details?.reason ?? "none"}`;
    throw new VisionResponseError(`The model returned no ${VISION_FORMAT.name} JSON (${detail}).`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content.text);
  } catch (cause) {
    throw new VisionResponseError("The model's output_text is not valid JSON.", { cause });
  }

  try {
    return VisionResultSchema.parse(parsed);
  } catch (cause) {
    throw new VisionSchemaError(
      "The vision model returned JSON that does not satisfy VisionResultSchema.",
      { cause },
    );
  }
}
