import type { JudgeFinding } from "@/lib/types";
import { LinkIcon } from "@/components/icons";

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
}

export function FindingRow({ finding, index }: FindingRowProps) {
  const status = STATUS[finding.status];

  return (
    <li
      className="rise card-depth overflow-hidden rounded-[var(--radius-card)] bg-raised"
      style={{ animationDelay: `${120 + index * 50}ms` }}
    >
      <div className="space-y-4 p-[18px]">
        <span
          className={`inline-flex items-center rounded-[var(--radius-pill)] border px-2.5 py-[3px] text-[11.5px] font-medium tracking-[0.02em] ${status.className}`}
        >
          {status.label}
        </span>

        <p className="text-[16px] leading-[1.5] font-medium tracking-[-0.005em] text-sumi">
          {finding.clausePlain}
        </p>

        <blockquote className="ja border-l-2 border-rule-strong bg-sunken/60 py-2.5 pr-3 pl-3.5 text-[13.5px] text-sumi-soft">
          {finding.clauseJa}
        </blockquote>

        <div className="space-y-1.5">
          <p className="eyebrow">What the guideline says</p>
          <p className="text-[14.5px] leading-[1.6] text-sumi-soft">{finding.guidelineSays}</p>
        </div>
      </div>

      {/* The citation is the product, not the footnote. It never hides. */}
      <div className="border-t border-rule bg-sunken/50 px-[18px] py-3.5">
        <p className="eyebrow mb-1.5">Source</p>
        <p className="ja-tight text-[13px] leading-[1.5] text-sumi">{finding.citation.source}</p>
        <p className="ja-tight numeric mt-0.5 text-[12.5px] text-sumi-soft">
          {finding.citation.section}
        </p>
        <a
          href={finding.citation.url}
          target="_blank"
          rel="noopener noreferrer"
          className="pressable mt-2 inline-flex min-h-11 items-center gap-1.5 -ml-0.5 text-[13px] font-medium text-ai underline decoration-ai-line underline-offset-[3px]"
        >
          <LinkIcon className="size-[14px]" />
          Read the guideline
        </a>
      </div>
    </li>
  );
}
