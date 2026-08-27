/**
 * KAIFŪ v0 document taxonomy.
 *
 * Three types earn a bespoke treatment because each one asks the reader for
 * something different: a school notice asks for money and a signed slip, a
 * ward letter asks for a payment by a statutory date, a lease clause asks
 * nothing but binds. `unknown` is a first-class member, not a failure mode —
 * a wrong bucket produces a confidently wrong action card, which is the one
 * outcome the product cannot afford.
 *
 * The hints are surface strings, not semantics. They exist to anchor the
 * classifier on characters that actually appear on the page, so a blurry
 * scan degrades toward `unknown` rather than toward a plausible guess.
 */

import type { DocType } from "@/lib/types";

export interface DocTypeDescriptor {
  id: DocType;
  labelEn: string;
  labelJa: string;
  /** Japanese keywords whose presence signals this type. */
  hints: string[];
  /** What matters most when extracting from this type. */
  extractionFocus: string;
}

export const DOC_TYPE_DESCRIPTORS: Record<DocType, DocTypeDescriptor> = {
  school_notice: {
    id: "school_notice",
    labelEn: "School notice",
    labelJa: "学校からのお知らせ",
    hints: ["保護者各位", "遠足", "参加費", "提出期限", "持ち物", "弁当", "集金"],
    extractionFocus:
      "Capture every deadline, every amount of money the household must send, every item the child must bring, and every reply slip or form that must be signed and returned.",
  },
  ward_tax_letter: {
    id: "ward_tax_letter",
    labelEn: "Ward office / tax letter",
    labelJa: "区役所・納税関係の通知",
    hints: [
      "納税通知書",
      "住民税",
      "国民健康保険",
      "年金",
      "区役所",
      "納期限",
    ],
    extractionFocus:
      "Capture the amount payable, the 納期限 (payment deadline) for each instalment, and any printed statement of what happens if the payment is late or unpaid.",
  },
  lease_clause: {
    id: "lease_clause",
    labelEn: "Lease clause",
    labelJa: "賃貸借契約の条項",
    hints: ["賃貸借契約", "原状回復", "敷金", "礼金", "更新料", "解約", "修繕"],
    extractionFocus:
      "Capture the clause text verbatim, exactly as printed, and every obligation the clause places on the tenant — restoration, charges, notice periods, repairs.",
  },
  unknown: {
    id: "unknown",
    labelEn: "Unknown",
    labelJa: "分類不能",
    hints: [],
    extractionFocus:
      "Transcribe everything, extract any dates and amounts you can read, and leave obligations empty. Choose this whenever the document does not clearly belong to one of the other types.",
  },
};

/** Ordered so `unknown` reads as the fallback it is, not as a fourth category. */
const PROMPT_ORDER: DocType[] = [
  "school_notice",
  "ward_tax_letter",
  "lease_clause",
  "unknown",
];

/**
 * Renders the taxonomy as promptable text.
 *
 * Built from the same descriptors the rest of the app uses, so the prompt can
 * never silently disagree with the type union it is classifying into.
 */
export function describeTaxonomyForPrompt(): string {
  return PROMPT_ORDER.map((id) => {
    const { labelEn, labelJa, hints, extractionFocus } = DOC_TYPE_DESCRIPTORS[id];
    const signals =
      hints.length > 0
        ? `Japanese signals: ${hints.join("、")}`
        : "No signals — this is the fallback.";
    return [
      `- ${id} — ${labelEn} (${labelJa})`,
      `  ${signals}`,
      `  Extraction focus: ${extractionFocus}`,
    ].join("\n");
  }).join("\n");
}
