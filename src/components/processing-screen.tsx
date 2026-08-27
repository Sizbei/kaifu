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

  /* One accessible image only: the desk copy is decorative. */
  const preview = (alt: string) => (
    <div className="relative overflow-hidden rounded-[var(--radius-inner)] lg:rounded-[3px]">
      {previewUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={previewUrl}
          alt={alt}
          className="block max-h-[46vh] w-full object-cover opacity-80 saturate-[0.45] lg:max-h-[calc(100vh-200px)] lg:object-contain"
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
  );

  return (
    <section className="rise flex flex-1 flex-col pb-[max(24px,env(safe-area-inset-bottom))]">
      <header className="shell-bar px-6 pt-6 lg:pt-8">
        <Wordmark compact />
        <button
          type="button"
          onClick={onCancel}
          className="pressable -mr-2 min-h-11 rounded-[var(--radius-pill)] px-3 text-[13px] text-sumi-soft hover:bg-sunken"
        >
          Cancel
        </button>
      </header>

      <div className="shell shell-centered flex flex-1 flex-col px-6">
        {/* Desktop: the captured frame lies on the desk, being read. */}
        <aside className="shell-aside">
          <figure className="sheet mx-auto w-full max-w-[640px] rounded-[6px] bg-raised p-3">
            {preview("")}
          </figure>
        </aside>

        <div className="flex flex-1 flex-col justify-center gap-10 py-8 lg:flex-none lg:py-0">
          <figure className="card-depth relative mx-auto w-full max-w-[300px] overflow-hidden rounded-[var(--radius-card)] bg-raised p-2 lg:hidden">
            {preview("The document you photographed")}
          </figure>

          <div className="mx-auto w-full max-w-[320px] lg:mx-0 lg:max-w-none">
            <p className="eyebrow mb-5 hidden lg:block">Reading</p>
            <ol className="space-y-3.5 lg:space-y-5" aria-live="polite">
              {STAGES.map((stage, i) => {
                const done = i < activeIndex;
                const active = i === activeIndex;
                return (
                  <li
                    key={stage.label}
                    className="rise flex items-start gap-3 lg:gap-4"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <span
                      aria-hidden
                      className={`mt-px flex size-[22px] shrink-0 items-center justify-center rounded-full border transition-colors duration-200 lg:mt-0.5 lg:size-[26px] ${
                        done
                          ? "border-matcha bg-matcha-wash text-matcha"
                          : active
                            ? "border-ai text-ai"
                            : "border-rule text-rule"
                      }`}
                    >
                      {done ? (
                        <CheckIcon className="size-[11px] lg:size-[13px]" />
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
                        className={`block text-[15px] leading-[1.4] transition-colors duration-200 lg:text-[19px] ${
                          done
                            ? "text-sumi-faint"
                            : active
                              ? "font-medium text-sumi"
                              : "text-sumi-faint"
                        }`}
                      >
                        {stage.label}
                      </span>
                      {active ? (
                        <span className="ja-tight fade block text-[11.5px] text-sumi-faint lg:text-[13px]">
                          {stage.ja}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="mt-8 hidden max-w-[44ch] text-[13px] leading-[1.55] text-sumi-faint lg:block">
              The image is being read now and discarded straight after.
            </p>
          </div>
        </div>
      </div>

      <p className="text-center text-[12.5px] text-sumi-faint lg:hidden">
        The image is being read now and discarded straight after.
      </p>
    </section>
  );
}
