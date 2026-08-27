/**
 * Vision contract shared by every provider: the typed errors, the strict
 * JSON schema and the system prompt. Provider modules (vision.ts for the
 * OpenAI Responses API, vision-gateway.ts for the Shisa gateway) import
 * from here so neither depends on the other.
 */

import type OpenAI from "openai";

import { describeTaxonomyForPrompt } from "@/lib/doctypes";

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
