"use client";

import { useState } from "react";
import type { Obligation } from "@/lib/types";
import { downloadIcs } from "@/components/ics";
import { AlertIcon, CalendarIcon, CheckIcon } from "@/components/icons";

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Tokyo",
});

function daysAway(iso: string): number | null {
  const target = Date.parse(`${iso}T00:00:00+09:00`);
  if (Number.isNaN(target)) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - todayUtc) / 86_400_000);
}

function urgency(days: number | null): { label: string; tone: string } | null {
  if (days === null) return null;
  if (days < 0) return { label: `${Math.abs(days)} days ago`, tone: "text-shu" };
  if (days === 0) return { label: "today", tone: "text-shu" };
  if (days === 1) return { label: "tomorrow", tone: "text-shu" };
  if (days <= 7) return { label: `in ${days} days`, tone: "text-ai" };
  return { label: `in ${days} days`, tone: "text-sumi-faint" };
}

function ConflictNotice({ conflict }: { conflict: NonNullable<Obligation["conflict"]> }) {
  const noun = conflict.field === "dueDate" ? "date" : "amount";
  return (
    <div
      role="note"
      className="mt-3.5 rounded-[var(--radius-inner)] border border-shu-line bg-shu-wash p-3.5"
    >
      <div className="flex items-center gap-2 text-shu">
        <AlertIcon className="size-[15px]" />
        <p className="text-[13px] font-semibold tracking-[0.01em]">
          Check this {noun} against the paper
        </p>
      </div>
      <p className="mt-1.5 text-[13px] leading-[1.55] text-sumi-soft">
        Two readings of this {noun} disagreed. We are not going to pick one for you.
      </p>
      <dl className="mt-3 grid grid-cols-[1fr_1fr] gap-x-3 gap-y-1.5 border-t border-shu-line pt-3">
        <dt className="eyebrow">The scan read</dt>
        <dt className="eyebrow">The page says</dt>
        <dd className="text-[14px] tabular-nums text-sumi-soft line-through decoration-shu/50">
          {conflict.modelSaw}
        </dd>
        <dd className="ja-tight text-[14px] font-medium text-sumi">
          {conflict.documentSaid}
        </dd>
      </dl>
    </div>
  );
}

interface ObligationRowProps {
  obligation: Obligation;
  documentTitle: string;
  index: number;
}

export function ObligationRow({ obligation, documentTitle, index }: ObligationRowProps) {
  const [added, setAdded] = useState(false);
  const { dueDate, amount, conflict } = obligation;
  const away = dueDate ? urgency(daysAway(dueDate.iso)) : null;

  const handleAdd = () => {
    downloadIcs(obligation, documentTitle);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2400);
  };

  return (
    <li
      className="rise card-depth relative overflow-hidden rounded-[var(--radius-card)] bg-raised"
      style={{ animationDelay: `${120 + index * 50}ms` }}
    >
      {/* A vermilion edge only when something needs a human eye. */}
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-[3px] ${conflict ? "bg-shu" : "bg-transparent"}`}
      />
      <div className="p-[18px] pl-[21px]">
        <p className="text-[16.5px] leading-[1.45] font-medium tracking-[-0.005em] text-sumi">
          {obligation.action}
        </p>

        {dueDate || amount ? (
          <dl className="mt-3.5 space-y-2.5">
            {dueDate ? (
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <dt className="eyebrow w-[54px] shrink-0">By</dt>
                <dd className="text-[14.5px] tabular-nums text-sumi">{DATE_FMT.format(new Date(`${dueDate.iso}T00:00:00+09:00`))}</dd>
                {away ? (
                  <dd className={`text-[13px] font-medium ${away.tone}`}>{away.label}</dd>
                ) : null}
                <dd className="ja-tight w-full text-[12.5px] text-sumi-faint">
                  {dueDate.label}：{dueDate.raw}
                </dd>
              </div>
            ) : null}
            {amount ? (
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <dt className="eyebrow w-[54px] shrink-0">Amount</dt>
                <dd className="numeric text-[16px] font-medium text-sumi">
                  ¥{amount.yen.toLocaleString("en-US")}
                </dd>
                <dd className="ja-tight w-full text-[12.5px] text-sumi-faint">
                  {amount.label}：{amount.raw}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {conflict ? <ConflictNotice conflict={conflict} /> : null}

        {dueDate ? (
          <button
            type="button"
            onClick={handleAdd}
            className="pressable mt-4 -ml-1 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-pill)] border border-rule-strong px-4 text-[13.5px] font-medium text-sumi"
          >
            {added ? (
              <>
                <CheckIcon className="size-[15px] text-matcha" />
                Calendar file saved
              </>
            ) : (
              <>
                <CalendarIcon className="size-[15px] text-ai" />
                Add to calendar
              </>
            )}
          </button>
        ) : null}
      </div>
    </li>
  );
}
