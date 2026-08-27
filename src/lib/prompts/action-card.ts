/**
 * Action card prompts.
 *
 * Stage 1 already extracted every date and amount. This call exists purely
 * to put those facts into the user's language — it is a describer, not an
 * extractor, and the prompt says so three times because the model will
 * otherwise helpfully "correct" a date it half-recognises.
 */

import type { Obligation, VisionResult } from "@/lib/types";

import { LEGAL_BOUNDARY, NO_INVENTION } from "./shared";

export function actionCardSystemPrompt(outputLang: string): string {
  return `You explain a Japanese document to a foreign resident of Japan, in ${outputLang}.

Everything factual has ALREADY been extracted for you and is given below.
Your only job is to describe it in plain ${outputLang}.

${NO_INVENTION}
Specifically: do not add a deadline that is not listed, do not convert or
recalculate an amount, do not adjust a Japanese-era date, do not guess at a
policy the document does not state, and do not repeat a date or amount that
is not in the DATES or AMOUNTS lists.

${LEGAL_BOUNDARY}

Return ONE JSON object and nothing else — no markdown fence, no commentary:
{"whatThisIs": "...", "summary": "..."}

whatThisIs: a short noun phrase naming the document type as a person would
say it, e.g. "School excursion notice", "Residence tax payment slip". Under
60 characters. Not a sentence.

summary: one or two plain sentences saying what this document is about and
what it wants from the reader. No jargon, no Japanese terms without a gloss,
no advice, no urgency language the document itself does not carry. Do not
list the deadlines — the card shows those separately.`;
}

export function actionCardUserPrompt(
  vision: VisionResult,
  obligations: readonly Obligation[],
): string {
  const dates = vision.dates.length
    ? vision.dates.map((d) => `- ${d.label}: ${d.raw} (${d.iso})`).join("\n")
    : "- none extracted";
  const amounts = vision.amounts.length
    ? vision.amounts.map((a) => `- ${a.label}: ${a.raw} (${a.yen} JPY)`).join("\n")
    : "- none extracted";
  const todo = obligations.length
    ? obligations.map((o) => `- ${o.action}`).join("\n")
    : "- none extracted";

  // rawText is truncated: the card only needs the gist, and a long tail of
  // OCR noise is where the model starts hallucinating extra deadlines.
  const excerpt = vision.rawText.slice(0, 2000);

  return `DOCUMENT TYPE: ${vision.docType}
TITLE (Japanese, as printed): ${vision.titleJa}
ISSUER: ${vision.issuer ?? "not printed"}

DATES (the complete list — there are no others):
${dates}

AMOUNTS (the complete list — there are no others):
${amounts}

OBLIGATIONS ALREADY IDENTIFIED:
${todo}

DOCUMENT TEXT (transcription, may contain OCR noise):
${excerpt}

Return the JSON object now.`;
}
