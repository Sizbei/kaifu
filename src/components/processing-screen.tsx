"use client";

import { useEffect, useState } from "react";
import { CheckIcon } from "@/components/icons";
import { Wordmark } from "@/components/ui";

/* Real work is 3–8s. Long enough that a spinner reads as a stall, so the
   stages are named: the wait becomes evidence that something is happening. */
const STAGES = [
  { at: 0, label: "Reading the document", ja: "読み取り中" },
  { at: 1800, label: "Checking dates and amounts", ja: "日付・金額の照合" },
  { at: 4200, label: "Writing your card", ja: "カードを作成中" },
] as const;

interface ProcessingScreenProps {
  previewUrl: string;
  onCancel: () => void;
}

export function ProcessingScreen({ previewUrl, onCancel }: ProcessingScreenProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => setElapsed(Date.now() - started), 200);
    return () => window.clearInterval(id);
  }, []);

  const activeIndex = STAGES.reduce(
    (acc, stage, i) => (elapsed >= stage.at ? i : acc),
    0,
  );

  return (
    <section className="rise relative z-1 flex flex-1 flex-col px-6 pt-6 pb-[max(24px,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <Wordmark compact />
        <button
          type="button"
          onClick={onCancel}
          className="pressable -mr-2 min-h-11 px-2 text-[13px] text-sumi-soft"
        >
          Cancel
        </button>
      </header>

      <div className="flex flex-1 flex-col justify-center gap-10 py-8">
        {/* The captured frame stays on screen: you can see it got the page. */}
        <figure className="card-depth relative mx-auto w-full max-w-[300px] overflow-hidden rounded-[var(--radius-card)] bg-raised p-2">
          <div className="relative overflow-hidden rounded-[var(--radius-inner)]">
            {previewUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={previewUrl}
                alt="The document you photographed"
                className="block max-h-[46vh] w-full object-cover opacity-80 saturate-[0.45]"
              />
            ) : (
              <div className="h-[46vh] w-full bg-sunken" />
            )}
            <div
              aria-hidden
              className="sweep pointer-events-none absolute inset-x-0 top-0 h-[15%]"
              style={{
                background:
                  "linear-gradient(180deg, transparent, color-mix(in srgb, var(--ai) 26%, transparent), transparent)",
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, color-mix(in srgb, var(--paper) 34%, transparent), transparent 38%, color-mix(in srgb, var(--paper) 30%, transparent))",
              }}
            />
          </div>
        </figure>

        <ol className="mx-auto w-full max-w-[320px] space-y-3.5" aria-live="polite">
          {STAGES.map((stage, i) => {
            const done = i < activeIndex;
            const active = i === activeIndex;
            return (
              <li
                key={stage.label}
                className="rise flex items-start gap-3"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <span
                  aria-hidden
                  className={`mt-px flex size-[22px] shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
                    done
                      ? "border-matcha bg-matcha-wash text-matcha"
                      : active
                        ? "border-ai text-ai"
                        : "border-rule text-rule"
                  }`}
                >
                  {done ? (
                    <CheckIcon className="size-[11px]" />
                  ) : (
                    <span
                      className={`size-[6px] rounded-full ${
                        active ? "breathe bg-ai" : "bg-rule-strong"
                      }`}
                    />
                  )}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block text-[15px] leading-[1.4] transition-colors duration-200 ${
                      done ? "text-sumi-faint" : active ? "font-medium text-sumi" : "text-sumi-faint"
                    }`}
                  >
                    {stage.label}
                  </span>
                  {active ? (
                    <span className="ja-tight fade block text-[11.5px] text-sumi-faint">
                      {stage.ja}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <p className="text-center text-[12.5px] text-sumi-faint">
        The image is being read now and discarded straight after.
      </p>
    </section>
  );
}
