#!/usr/bin/env -S npx tsx --env-file=.env.local
/**
 * Seed the corpus graph from the 17 synthetic fixtures.
 *
 * Idempotent: every fixture gets the stable id `fixture:<id>` and is
 * MERGEd, so running this twice leaves one node per fixture. Fixtures are
 * synthetic, but they go through the same `anonymize()` path as a real
 * decode — the seed cannot store anything a real decode could not.
 *
 *   pnpm seed:graph
 */

import { documentFixtures, type DocumentFixture } from "@/fixtures";
import { GROUND_TRUTH } from "@/lib/groundtruth";
import { retrieveByHints } from "@/lib/judge";
import { closeGraph, clauseStats, mergeClauseTypes, recordDecode, wardFromIssuer } from "@/lib/graph";
import type { ActionCard, JudgeFinding } from "@/lib/types";

/**
 * Fixtures carry expected obligations but not expected findings (the JUDGE
 * verdict needs a model). The clause verdicts below are the ones the
 * fixture file header documents: restoration / deposit / special-terms are
 * the true positives, renewal and termination the true negatives.
 */
const FIXTURE_VERDICTS: Record<string, Record<string, JudgeFinding["status"]>> = {
  "lease-restoration": {
    "genjo-kaifuku-definition": "differs",
    "genjo-kaifuku-wear-examples": "differs",
    "tsujo-sonmo-tokuyaku": "differs",
  },
  "lease-deposit": { "shikikin-return": "differs" },
  "lease-special-terms": { "house-cleaning-tokuyaku": "differs", "tsujo-sonmo-tokuyaku": "differs" },
  "lease-renewal": { "koshinryo-not-in-model-lease": "not_addressed" },
  "lease-termination": {},
};

/**
 * Retrieval decides which clause types the text CONTAINS; the table decides
 * the status. No candidate cap here: the judge's top-3 is a prompt budget,
 * and a corpus row should list every clause type the page carries.
 */
function findingsFor(f: DocumentFixture): JudgeFinding[] {
  if (f.docType !== "lease_clause") return [];
  const verdicts = FIXTURE_VERDICTS[f.id] ?? {};
  return retrieveByHints(f.rawText, GROUND_TRUTH.length)
    .filter((e) => e.id in verdicts)
    .map((e) => ({
      clauseJa: "",
      clausePlain: "",
      guidelineSays: "",
      citation: e.citation,
      status: verdicts[e.id],
    }));
}

function toCard(f: DocumentFixture): ActionCard {
  return {
    docType: f.docType,
    whatThisIs: "",
    titleJa: f.titleJa,
    issuer: f.issuer,
    summary: "",
    obligations: f.docType === "unknown" ? [] : f.expected.obligations,
    summaryOnly: f.docType === "unknown",
    findings: findingsFor(f),
  };
}

async function main(): Promise<void> {
  await mergeClauseTypes();
  for (const f of documentFixtures) {
    await recordDecode(toCard(f), {
      documentId: `fixture:${f.id}`,
      ward: wardFromIssuer(f.issuer, f.docType),
      issuedMonth: "2026-09",
      confidence: 1,
    });
    console.log(`seeded ${f.id}`);
  }
  const s = await clauseStats("genjo-kaifuku-wear-examples");
  if (s) {
    console.log(
      `\n${s.containing} of ${s.total} leases in the corpus contain a restoration wear clause; ` +
        `${s.differs} differ from the guideline, ${s.matches} match.`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeGraph);
