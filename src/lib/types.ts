/**
 * KAIFŪ shared contract.
 *
 * Every module in the pipeline speaks these types and nothing else.
 * The seam that matters (from the product spec): the vision model never
 * generates Japanese prose, and Shisa never sees an image.
 */

import { z } from "zod";

/* ------------------------------------------------------------------ *
 * Document taxonomy — v0 recognises exactly three types.
 * `unknown` is not a failure; it routes to summary-only mode.
 * ------------------------------------------------------------------ */

export const DOC_TYPES = [
  "school_notice",
  "ward_tax_letter",
  "lease_clause",
  "unknown",
] as const;

export type DocType = (typeof DOC_TYPES)[number];

/* ------------------------------------------------------------------ *
 * Extraction primitives.
 *
 * Every date and amount carries provenance so the cross-check can
 * report *why* it disagrees, not just that it does.
 * ------------------------------------------------------------------ */

export const ExtractedDateSchema = z.object({
  /** ISO 8601 date, e.g. "2026-09-05". */
  iso: z.string(),
  /** Exactly as printed on the document, e.g. "令和8年9月5日". */
  raw: z.string(),
  /** What the date is for, in the document's own words. */
  label: z.string(),
});
export type ExtractedDate = z.infer<typeof ExtractedDateSchema>;

export const ExtractedAmountSchema = z.object({
  /** Integer yen. No decimals — JPY has no minor unit in practice. */
  yen: z.number().int(),
  /** Exactly as printed, e.g. "3,200円" or "¥3,200". */
  raw: z.string(),
  label: z.string(),
});
export type ExtractedAmount = z.infer<typeof ExtractedAmountSchema>;

/* ------------------------------------------------------------------ *
 * Obligations — the "what you must do, by when" of the product.
 * ------------------------------------------------------------------ */

export const ObligationSchema = z.object({
  /** Imperative, in the user's language. "Pay ¥3,200." */
  action: z.string(),
  dueDate: ExtractedDateSchema.nullable(),
  amount: ExtractedAmountSchema.nullable(),
  /**
   * Set when the deterministic pass and the model disagree about this
   * obligation's date or amount. A flagged obligation is shown to the
   * user WITH the conflict visible. It is never silently resolved:
   * a wrong deadline is worse than no answer.
   */
  conflict: z
    .object({
      field: z.enum(["dueDate", "amount"]),
      modelSaw: z.string(),
      documentSaid: z.string(),
    })
    .nullable()
    .default(null),
});
export type Obligation = z.infer<typeof ObligationSchema>;

/* ------------------------------------------------------------------ *
 * Stage 1 output: the vision model returns THIS and only this.
 * No prose, no Japanese generation, no advice.
 * ------------------------------------------------------------------ */

export const VisionResultSchema = z.object({
  docType: z.enum(DOC_TYPES),
  /** 0..1. Below CONFIDENCE_THRESHOLD we suppress obligations entirely. */
  confidence: z.number().min(0).max(1),
  /** The document's own title, transcribed, not translated. */
  titleJa: z.string(),
  /** Full transcription. The deterministic pass regexes over this. */
  rawText: z.string(),
  /** Issuing school / ward office / management company, if printed. */
  issuer: z.string().nullable(),
  dates: z.array(ExtractedDateSchema),
  amounts: z.array(ExtractedAmountSchema),
  obligations: z.array(ObligationSchema),
});
export type VisionResult = z.infer<typeof VisionResultSchema>;

/**
 * Below this, the classifier is not trusted to produce obligations and
 * the card degrades to a translated summary. Mitigates the crumpled,
 * handwritten-annotated school print — better silent than wrong.
 */
export const CONFIDENCE_THRESHOLD = 0.6;

/* ------------------------------------------------------------------ *
 * Stage 2 output: the action card the user actually reads.
 * ------------------------------------------------------------------ */

export interface ActionCard {
  docType: DocType;
  /** "School excursion notice" — in the user's language. */
  whatThisIs: string;
  titleJa: string;
  issuer: string | null;
  /** One or two sentences. Plain language, no jargon. */
  summary: string;
  obligations: Obligation[];
  /**
   * True when confidence fell below threshold. The UI must say so:
   * obligations are empty and the user gets a summary only.
   */
  summaryOnly: boolean;
  /** Populated only for lease_clause. Empty otherwise. */
  findings: JudgeFinding[];
}

/* ------------------------------------------------------------------ *
 * JUDGE — clause comparison against published government guidance.
 *
 * 弁護士法 Article 72 constrains this hard. A finding states what the
 * document says, what the public guideline says, and nothing more.
 * No recommendation, no "you should", no assessment of enforceability.
 * A finding without a citation is not a finding and must be dropped.
 * ------------------------------------------------------------------ */

export const JudgeFindingSchema = z.object({
  /** The clause text as printed, quoted. */
  clauseJa: z.string(),
  /** Plain-language restatement in the user's language. */
  clausePlain: z.string(),
  /** What the cited guideline says on this point. Neutral voice. */
  guidelineSays: z.string(),
  /** Never optional. No citation, no claim. */
  citation: z.object({
    source: z.string(),
    section: z.string(),
    url: z.string(),
  }),
  /** "differs" is the strongest word we use. Not "illegal", not "unfair". */
  status: z.enum(["matches", "differs", "not_addressed"]),
});
export type JudgeFinding = z.infer<typeof JudgeFindingSchema>;

/* ------------------------------------------------------------------ *
 * REPLY — the register engine.
 *
 * All four registers are generated concurrently and streamed together.
 * The slider selects between finished streams; it never triggers work.
 * ------------------------------------------------------------------ */

export const REGISTERS = [
  { id: "casual", ja: "カジュアル", en: "Casual", rank: 0 },
  { id: "polite", ja: "丁寧", en: "Polite (desu/masu)", rank: 1 },
  { id: "keigo", ja: "敬語", en: "Business keigo", rank: 2 },
  { id: "formal", ja: "最敬語", en: "Formal written", rank: 3 },
] as const;

export type RegisterId = (typeof REGISTERS)[number]["id"];

export interface RegisterRendering {
  register: RegisterId;
  /** The message. Japanese only — no commentary, no preamble. */
  textJa: string;
  /** One line: what changed at this level and why it fits the reader. */
  glossEn: string;
}

/* ------------------------------------------------------------------ *
 * Wire formats.
 * ------------------------------------------------------------------ */

export interface DecodeRequest {
  /** Base64 JPEG, no data: prefix. */
  imageBase64: string;
  /** BCP-47. v0 ships "en"; the field exists so v1 is not a rewrite. */
  outputLang: string;
}

export type DecodeResponse =
  | { ok: true; card: ActionCard }
  | { ok: false; error: string };

export interface ReplyRequest {
  /** What the user wants to say, in their own language. */
  intent: string;
  /** Who receives it — drives honorific choice. */
  recipient: string;
  /** Card context, so the reply can reference the document. */
  docType: DocType;
  documentSummary: string;
}

/** Server-sent event emitted by /api/reply. */
export type ReplyEvent =
  | { type: "delta"; register: RegisterId; text: string }
  | { type: "gloss"; register: RegisterId; glossEn: string }
  | { type: "done"; register: RegisterId }
  | { type: "error"; register: RegisterId; message: string };
