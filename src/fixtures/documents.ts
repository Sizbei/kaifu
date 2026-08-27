/**
 * KAIFŪ document fixtures.
 *
 * Synthetic stand-ins for the real paper — school prints, 区役所 mail and
 * lease clauses — so the pipeline can be exercised before ten real
 * documents per type have been collected. Every fixture is a full page as
 * OCR would transcribe it, paired with the ground truth a correct pipeline
 * should recover from it.
 *
 * Layout note: the per-type files below deliberately contain NOTHING but
 * `import type` and data. That keeps each of them loadable directly by
 * Node's type stripping (see scripts/render-samples.mjs), which has no
 * `@/*` alias and no extensionless resolution. Do not add a runtime import
 * to them.
 */

import type {
  DocType,
  ExtractedAmount,
  ExtractedDate,
  Obligation,
} from "@/lib/types";

import { leaseClauseFixtures } from "./lease-clauses";
import { schoolNoticeFixtures } from "./school-notices";
import { unknownDocumentFixtures } from "./unknown-documents";
import { wardBenefitFixtures } from "./ward-benefits";
import { wardTaxFixtures } from "./ward-tax";

/**
 * The salient extraction result for one document.
 *
 * These are the *load-bearing* dates and amounts — the ones a user would
 * be harmed by missing. A stricter deterministic pass may legitimately
 * surface extra numbers (a telephone number, a page count, a floor
 * number), so assert that these are present rather than that nothing
 * else is.
 */
export interface ExpectedExtraction {
  dates: ExtractedDate[];
  amounts: ExtractedAmount[];
  obligations: Obligation[];
}

export interface DocumentFixture {
  /** Stable, kebab-case. Also the basename of the rendered sample image. */
  id: string;
  docType: DocType;
  /** The document's own title, transcribed. `""` when it has none. */
  titleJa: string;
  /** Issuing school / ward office / management company, if printed. */
  issuer: string | null;
  /** Why this fixture exists — the edge case it pins down. */
  note?: string;
  /** The full page as OCR would transcribe it, line breaks included. */
  rawText: string;
  expected: ExpectedExtraction;
}

export const documentFixtures: DocumentFixture[] = [
  ...schoolNoticeFixtures,
  ...wardTaxFixtures,
  ...wardBenefitFixtures,
  ...leaseClauseFixtures,
  ...unknownDocumentFixtures,
];

export const fixturesByDocType: Record<DocType, DocumentFixture[]> = {
  school_notice: schoolNoticeFixtures,
  ward_tax_letter: [...wardTaxFixtures, ...wardBenefitFixtures],
  lease_clause: leaseClauseFixtures,
  unknown: unknownDocumentFixtures,
};

/** Throws rather than returning undefined: a missing fixture is a bug in the test. */
export function getFixture(id: string): DocumentFixture {
  const found = documentFixtures.find((fixture) => fixture.id === id);
  if (!found) {
    throw new Error(
      `No fixture with id "${id}". Known ids: ${documentFixtures.map((f) => f.id).join(", ")}`,
    );
  }
  return found;
}

export {
  leaseClauseFixtures,
  schoolNoticeFixtures,
  unknownDocumentFixtures,
  wardBenefitFixtures,
  wardTaxFixtures,
};
