"use client";

import { useState } from "react";
import type { Obligation } from "@/lib/types";
import { downloadIcs } from "@/components/ics";
import { AlertIcon, CalendarIcon, CheckIcon } from "@/components/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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

/** The model's `iso` is schema-checked, but a bad date must never take the card down. */
function formatDue(dueDate: { iso: string; raw: string }): string {
  return Number.isNaN(Date.parse(`${dueDate.iso}T00:00:00+09:00`))
    ? dueDate.raw
    : DATE_FMT.format(new Date(`${dueDate.iso}T00:00:00+09:00`));
}

function urgency(days: number | null): { label: string; tone: string } | null {
  if (days === null) return null;
  if (days < 0) return { label: `${Math.abs(days)} days ago`, tone: "text-shu" };
  if (days === 0) return { label: "today", tone: "text-shu" };
  if (days === 1) return { label: "tomorrow", tone: "text-shu" };
  if (days <= 7) return { label: `in ${days} days`, tone: "text-ai" };
  return { label: `in ${days} days`, tone: "text-sumi-faint" };
}

/* Two readings disagreed. Both are shown with equal weight: the UI must not
   pick a winner, so neither value is struck through or dimmed. */
function ConflictNotice({ conflict }: { conflict: NonNullable<Obligation["conflict"]> }) {
  const noun = conflict.field === "dueDate" ? "date" : "amount";
  return (
    <Alert
      role="note"
      className="mt-4 block rounded-[var(--radius-inner)] border-shu-line bg-shu-wash p-4 text-sumi"
    >
      <AlertTitle className="flex items-center gap-2 text-[13.5px] font-semibold tracking-[0.01em] text-shu">
        <AlertIcon className="size-[15px]" />
        Check this {noun} against the paper
      </AlertTitle>
      <AlertDescription className="mt-1.5 block text-[13.5px] leading-[1.55] text-sumi-soft">
        <p className="mb-0!">
          Two readings of this {noun} disagreed. We are not going to pick one for you.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-shu-line pt-3">
          <dt className="eyebrow">Model read</dt>
          <dt className="eyebrow">Regex found on page</dt>
          <dd className="ja-tight text-[15px] font-medium tabular-nums text-sumi">
            {conflict.modelSaw}
          </dd>
          <dd className="ja-tight text-[15px] font-medium tabular-nums text-sumi">
            {conflict.documentSaid}
          </dd>
        </dl>
      </AlertDescription>
    </Alert>
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
    <Card
      asChild
      className="rise card-depth gap-0 rounded-[var(--radius-card)] bg-raised py-0 text-base ring-0"
    >
    <li style={{ animationDelay: `${120 + index * 50}ms` }}>
      <CardContent className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 p-[18px] lg:gap-x-5 lg:p-6">
        {/* A leading numeral: this is a list of things, in order. */}
        <span
          aria-hidden
          className="numeric pt-[3px] text-[13px] leading-[1.45] text-sumi-faint lg:text-[14px]"
        >
          {String(index + 1).padStart(2, "0")}
        </span>

        <div className="min-w-0">
          <p className="text-[16.5px] leading-[1.45] font-medium tracking-[-0.005em] text-sumi lg:text-[18px]">
            {obligation.action}
          </p>

          {dueDate || amount ? (
            <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3.5">
              {dueDate ? (
                <div className="min-w-0">
                  <dt className="eyebrow">By</dt>
                  <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-2.5">
                    <span className="text-[18px] font-medium tabular-nums text-sumi lg:text-[20px]">
                      {formatDue(dueDate)}
                    </span>
                    {away ? (
                      <span className={`text-[13px] font-medium ${away.tone}`}>{away.label}</span>
                    ) : null}
                  </dd>
                  <dd className="ja-tight mt-0.5 text-[12.5px] text-sumi-faint">
                    {dueDate.label}：{dueDate.raw}
                  </dd>
                </div>
              ) : null}
              {amount ? (
                <div className="min-w-0">
                  <dt className="eyebrow">Amount</dt>
                  <dd className="numeric mt-0.5 text-[18px] font-medium text-sumi lg:text-[20px]">
                    ¥{amount.yen.toLocaleString("en-US")}
                  </dd>
                  <dd className="ja-tight mt-0.5 text-[12.5px] text-sumi-faint">
                    {amount.label}：{amount.raw}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          {conflict ? <ConflictNotice conflict={conflict} /> : null}

          {dueDate ? (
            <Button
              variant="outline"
              onClick={handleAdd}
              className="pressable mt-4 h-10 gap-2 rounded-[var(--radius-pill)] border-rule-strong bg-raised px-4 text-[13.5px] font-medium text-sumi hover:border-sumi-faint hover:bg-raised focus-visible:ring-0"
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
            </Button>
          ) : null}
        </div>
      </CardContent>
    </li>
    </Card>
  );
}
