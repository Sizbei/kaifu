import type { ActionCard as ActionCardData, DocType } from "@/lib/types";
import { ObligationRow } from "@/components/obligation-row";
import { FindingRow } from "@/components/finding-row";
import { SectionRule } from "@/components/ui";
import { benchmarkForCitation, type BenchmarkMap } from "@/lib/benchmark";

const DOC_LABEL: Record<DocType, string> = {
  school_notice: "School notice",
  ward_tax_letter: "Ward office letter",
  lease_clause: "Tenancy agreement",
  unknown: "Unclassified",
};

/** Confidence fell short, so obligations were withheld. Calm, not broken. */
function SummaryOnlyNotice() {
  return (
    <div className="rise rounded-[var(--radius-card)] border border-ai-line bg-ai-wash p-[18px]">
      <p className="text-[15px] leading-[1.55] font-medium text-sumi">
        Only a summary this time.
      </p>
      <p className="mt-1.5 text-[14px] leading-[1.6] text-sumi-soft">
        The photo was not clear enough to read the dates and amounts with confidence, so none are
        shown. A wrong deadline would be worse than none. Try again in better light, flattening the
        fold and filling the frame with the page.
      </p>
    </div>
  );
}

interface ActionCardProps {
  card: ActionCardData;
  /** Sibling of the card, not part of it: ActionCard the type is frozen. */
  benchmark?: BenchmarkMap | null;
}

export function ActionCard({ card, benchmark = null }: ActionCardProps) {
  const hasObligations = card.obligations.length > 0;
  const hasFindings = card.findings.length > 0;

  return (
    <div className="space-y-8">
      <header className="rise space-y-3.5">
        <div className="flex items-center gap-2.5">
          <span className="eyebrow">{DOC_LABEL[card.docType]}</span>
          <span aria-hidden className="h-px flex-1 bg-rule" />
        </div>

        <h1 className="font-display text-[29px] leading-[1.2] tracking-[-0.015em] text-balance text-sumi">
          {card.whatThisIs}
        </h1>

        {/* The original title, kept beside the decode. Seeing both is the reassurance. */}
        <p className="ja border-l-2 border-shu/40 pl-3 text-[15px] text-sumi-soft">
          {card.titleJa}
        </p>

        {card.issuer ? (
          <p className="ja-tight text-[13px] text-sumi-faint">From {card.issuer}</p>
        ) : null}

        <p className="pt-1 text-[15.5px] leading-[1.62] text-sumi-soft">{card.summary}</p>
      </header>

      {card.summaryOnly ? <SummaryOnlyNotice /> : null}

      {hasObligations ? (
        <section className="space-y-4">
          <SectionRule label={`What you have to do · ${card.obligations.length}`} />
          <ul className="space-y-3">
            {card.obligations.map((obligation, i) => (
              <ObligationRow
                key={`${obligation.action}-${i}`}
                obligation={obligation}
                documentTitle={card.titleJa}
                index={i}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {!hasObligations && !card.summaryOnly ? (
        <section className="space-y-4">
          <SectionRule label="What you have to do" />
          <div className="rise rounded-[var(--radius-card)] border border-dashed border-rule-strong bg-raised/60 p-[18px]">
            <p className="text-[15px] leading-[1.55] text-sumi">
              Nothing to do. This one is for information.
            </p>
            <p className="mt-1.5 text-[14px] leading-[1.6] text-sumi-soft">
              No deadline, payment or reply was found on the page. You can still write back below
              if you want to.
            </p>
          </div>
        </section>
      ) : null}

      {hasFindings ? (
        <section className="space-y-4">
          <SectionRule label={`Clauses against the guideline · ${card.findings.length}`} />
          <ul className="space-y-3">
            {card.findings.map((finding, i) => (
              <FindingRow
                key={finding.citation.section + i}
                finding={finding}
                index={i}
                benchmark={benchmarkForCitation(benchmark, finding.citation)}
              />
            ))}
          </ul>
          <p className="text-[12.5px] leading-[1.55] text-sumi-faint">
            These set your contract beside published government guidance and stop there. This is
            not legal advice and no view is offered on whether a clause is enforceable.
          </p>
        </section>
      ) : null}
    </div>
  );
}
