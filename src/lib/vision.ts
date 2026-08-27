/**
 * Stage 1: OCR, classification and field extraction.
 *
 * This module owns one half of KAIFŪ's central seam. The vision model looks
 * at pixels and reports what is on them, in structured JSON. It never writes
 * anything a user reads, never translates, and never generates Japanese —
 * a separate Japan-hosted model (Shisa) does all of that. The seam is the
 * product's core claim, so the prompt below forbids the crossing explicitly
 * and src/lib/vision.test.ts guards the wording.
 */

import OpenAI from "openai";

import { describeTaxonomyForPrompt } from "@/lib/doctypes";
import { VisionResultSchema, type VisionResult } from "@/lib/types";

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

/* ------------------------------------------------------------------ *
 * Typed errors. Each one names a distinct failure the caller can act
 * on: fix the deployment, retry, or surface "we could not read this".
 * ------------------------------------------------------------------ */

export class VisionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The process is misconfigured. Retrying will not help. */
export class VisionConfigError extends VisionError {}

/** The model answered, but not with the structured output we forced. */
export class VisionResponseError extends VisionError {}

/** The model emitted JSON that violates the shared contract. */
export class VisionSchemaError extends VisionError {}

/* ------------------------------------------------------------------ *
 * Structured output.
 *
 * A hand-authored JSON Schema rather than a conversion of
 * VisionResultSchema, for two reasons: field descriptions put the
 * "exactly as printed" rule at the point the model fills the field,
 * and `conflict` is deliberately absent — conflicts are computed by
 * cross-checking against extract.ts, so the model must not be able to
 * assert one. With `strict: true` and `additionalProperties: false`
 * the API rejects any key outside this schema, so the model cannot
 * smuggle one in. Zod's `.default(null)` fills it in on parse.
 * ------------------------------------------------------------------ */

const DATE_SCHEMA = {
  type: "object",
  properties: {
    iso: {
      type: "string",
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      description: "ISO 8601 date, YYYY-MM-DD, e.g. 2026-09-05. Zero-padded; never a range or a partial.",
    },
    raw: {
      type: "string",
      description:
        "The date exactly as printed, e.g. 令和8年9月5日. Never normalised.",
    },
    label: { type: "string", description: "What the date is for, in the document's own words." },
  },
  required: ["iso", "raw", "label"],
  additionalProperties: false,
} as const;

const AMOUNT_SCHEMA = {
  type: "object",
  properties: {
    yen: { type: "integer", description: "Integer yen. No decimals, no separators." },
    raw: {
      type: "string",
      description: "The amount exactly as printed, e.g. 3,200円 or ¥3,200. Never normalised.",
    },
    label: { type: "string", description: "What the amount is for, in the document's own words." },
  },
  required: ["yen", "raw", "label"],
  additionalProperties: false,
} as const;

const nullable = (schema: unknown) => ({ anyOf: [schema, { type: "null" }] });

export const VISION_FORMAT: OpenAI.Responses.ResponseFormatTextJSONSchemaConfig = {
  type: "json_schema",
  name: "record_document",
  description:
    "Record what is visible on the document. This is the only way to answer. Every field is a report of what is printed on the page — never an interpretation of it.",
  strict: true,
  schema: {
    type: "object",
    properties: {
      docType: {
        type: "string",
        enum: ["school_notice", "ward_tax_letter", "lease_clause", "unknown"],
        description: "Exactly one type. Use unknown when the document does not clearly fit.",
      },
      confidence: {
        type: "number",
        description:
          "0..1. Your honest confidence in the transcription and classification together. Low for crumpled, blurry, partially occluded, or heavily handwritten scans.",
      },
      titleJa: {
        type: "string",
        description: "The document's own title, transcribed. Not translated. Empty string if none.",
      },
      rawText: {
        type: "string",
        description:
          "Complete verbatim transcription of every visible Japanese character, including handwritten annotations, stamps and marginalia. Preserve line breaks. Never summarise, abridge, or reorder.",
      },
      issuer: nullable({
        type: "string",
        description: "Issuing school, ward office or management company, as printed. Null if absent.",
      }),
      dates: { type: "array", items: DATE_SCHEMA, description: "Every date on the document." },
      amounts: { type: "array", items: AMOUNT_SCHEMA, description: "Every amount of money on the document." },
      obligations: {
        type: "array",
        description:
          "What the document requires of the reader. Empty when the document requires nothing, or when you are not confident enough to say.",
        items: {
          type: "object",
          properties: {
            action: {
              type: "string",
              description: "Imperative, in English. What must be done, e.g. 'Pay ¥3,200.'",
            },
            dueDate: nullable(DATE_SCHEMA),
            amount: nullable(AMOUNT_SCHEMA),
          },
          required: ["action", "dueDate", "amount"],
          additionalProperties: false,
        },
      },
    },
    required: [
      "docType",
      "confidence",
      "titleJa",
      "rawText",
      "issuer",
      "dates",
      "amounts",
      "obligations",
    ],
    additionalProperties: false,
  },
};

export const VISION_SYSTEM_PROMPT = `You are the OCR and extraction stage of a two-stage pipeline for Japanese household documents. A separate model writes everything the reader ever sees. Your only job is to report what is on the image.

Answer with a single record_document JSON object. Return JSON only. Do not write prose. Do not translate. Do not advise. Do not editorialise. Do not add commentary of any kind, before, after, or inside the JSON. Do not generate Japanese — you may only transcribe the Japanese that is already printed on the page. Never tell the reader what to do about the document; another stage does that.

TRANSCRIPTION
Put every visible Japanese character into rawText, verbatim. Include handwritten annotations, hand-corrected figures, stamps, red pen, and anything written in the margins — a handwritten change to a printed date is usually the part that matters. Preserve line breaks and reading order. Never summarise, never abridge, never paraphrase, never "clean up" the text. A later deterministic pass searches rawText for dates and amounts, so anything you leave out is lost for good.

CLASSIFICATION
Choose exactly one type:
${describeTaxonomyForPrompt()}

CONFIDENCE
Report confidence honestly, as a single number for the transcription and classification together. Crumpled paper, motion blur, glare, a page photographed at an angle, text running off the edge, or heavy handwriting all mean low confidence. Guessing well is worse than admitting uncertainty: a low score degrades the output gracefully, a wrong one does not.

DATES AND AMOUNTS
For every date and every amount, give both forms. Put the surface form exactly as printed into raw — 令和8年9月5日 stays 令和8年9月5日, 3,200円 stays 3,200円 — and the normalised form (ISO date, integer yen) alongside it. Do not normalise raw. Do not correct raw. If you cannot resolve a Japanese era year to a calendar year, do not include the date rather than inventing one.

OBLIGATIONS
List only obligations the document itself states. If the document asks nothing of the reader, or you cannot read it well enough to be sure, return an empty list.`;

export interface AnalyzeOptions {
  model?: string;
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
