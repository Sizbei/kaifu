import type { JudgeFinding } from "@/lib/types";
import { benchmarkLine, type BenchmarkStats } from "@/lib/benchmark";
import { LinkIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";

/* "differs" is the strongest word this product uses. No advice, no verdict,
   and never a finding without its citation showing. */
const STATUS: Record<JudgeFinding["status"], { label: string; className: string }> = {
  differs: {
    label: "Differs from the guideline",
    className: "border-shu-line bg-shu-wash text-shu",
  },
  matches: {
    label: "Matches the guideline",
    className: "border-rule-strong bg-matcha-wash text-matcha",
  },
  not_addressed: {
    label: "Guideline does not cover this",
    className: "border-rule-strong bg-sunken text-sumi-soft",
  },
};

interface FindingRowProps {
  finding: JudgeFinding;
  index: number;
  /** Corpus counts for this finding's clause type. Null when the graph is off or has no row. */
  benchmark?: BenchmarkStats | null;
}

export function FindingRow({ finding, index, benchmark = null }: FindingRowProps) {
  const status = STATUS[finding.status];

  return (
    <Card
      asChild
      className="rise card-depth gap-0 rounded-[var(--radius-card)] bg-raised py-0 text-base ring-0"
    >
    <li style={{ animationDelay: `${120 + index * 50}ms` }}>
      <CardContent className="space-y-4 p-[18px] lg:space-y-5 lg:p-6">
        <Badge
          variant="outline"
          className={`h-[24px] rounded-[var(--radius-pill)] px-2.5 text-[11.5px] font-medium tracking-[0.02em] ${status.className}`}
        >
          {status.label}
        </Badge>

        <p className="text-[16px] leading-[1.5] font-medium tracking-[-0.005em] text-sumi lg:text-[17.5px]">
          {finding.clausePlain}
        </p>

        {/* The clause as written, set off by a hairline. */}
        <blockquote className="ja border-l border-rule-strong py-0.5 pl-4 text-[13.5px] text-sumi-soft lg:text-[14px]">
          {finding.clauseJa}
        </blockquote>

        <div className="space-y-1.5">
          <p className="eyebrow">What the guideline says</p>
          <p className="text-[14.5px] leading-[1.6] text-sumi-soft lg:text-[15px]">
            {finding.guidelineSays}
          </p>
        </div>
      </CardContent>

      {/* The citation is the product, not the footnote. It never hides. */}
      <CardFooter className="block rounded-b-[var(--radius-card)] border-t border-rule bg-transparent px-[18px] pt-3.5 pb-4 lg:px-6">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
          <span aria-hidden className="numeric pt-px text-[11px] text-sumi-faint">
            {index + 1}
          </span>
          <div>
            <p className="ja-tight text-[13px] leading-[1.55] text-sumi">{finding.citation.source}</p>
            <p className="ja-tight numeric mt-0.5 text-[12px] text-sumi-soft">
              {finding.citation.section}
            </p>
            <a
              href={finding.citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="pressable mt-1.5 inline-flex min-h-9 items-center gap-1.5 text-[13px] font-medium text-ai underline decoration-ai-line underline-offset-[3px]"
            >
              <LinkIcon className="size-[14px]" />
              Read the guideline
            </a>
          </div>
        </div>
        {/* Counts only. The corpus is described, never the clause. */}
        {benchmark ? (
          <p className="mt-3 border-t border-rule pt-3 text-[12.5px] leading-[1.55] tabular-nums text-sumi-faint">
            {benchmarkLine(benchmark)}
          </p>
        ) : null}
      </CardFooter>
    </li>
    </Card>
  );
}
