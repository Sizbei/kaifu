"use client";

import { useState } from "react";
import { REGISTERS, type RegisterId } from "@/lib/types";
import type { ReplyState } from "@/components/use-reply-stream";
import { RegisterSlider } from "@/components/register-slider";
import { Button } from "@/components/ui";
import { AlertIcon, CheckIcon, CopyIcon } from "@/components/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

interface RegisterOutputProps {
  state: ReplyState;
  register: RegisterId;
  onRegisterChange: (register: RegisterId) => void;
  intent: string;
  recipient: string;
  onRewrite: () => void;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older iOS Safari outside a trusted gesture chain.
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  }
}

export function RegisterOutput({
  state,
  register,
  onRegisterChange,
  intent,
  recipient,
  onRewrite,
}: RegisterOutputProps) {
  const [copied, setCopied] = useState(false);
  const buffer = state.buffers[register];
  const meta = REGISTERS.find((r) => r.id === register) ?? REGISTERS[1];
  const failed = buffer.phase === "error";
  const streaming = buffer.phase === "streaming" || (buffer.phase === "idle" && state.phase === "streaming");

  const handleCopy = async () => {
    const ok = await copyText(buffer.textJa);
    if (!ok) return;
    setCopied(true);
    toast.success("Copied. Paste it into LINE or a reply slip.", { duration: 2400 });
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="rise space-y-4 lg:space-y-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13.5px] leading-[1.5] text-sumi-faint">
          <span className="text-sumi-soft">&ldquo;{intent}&rdquo;</span>
          <br />
          to {recipient}
        </p>
        <button
          type="button"
          onClick={onRewrite}
          className="pressable -mt-1.5 -mr-2 h-9 shrink-0 rounded-[var(--radius-pill)] px-3 text-[13px] font-medium text-ai hover:bg-ai-wash"
        >
          Change
        </button>
      </div>

      <RegisterSlider value={register} onChange={onRegisterChange} buffers={state.buffers} />

      <div className="card-depth overflow-hidden rounded-[var(--radius-card)] bg-raised">
        <div className="register-panel p-[18px] lg:p-7">
          {failed ? (
            <div className="flex items-start gap-2.5 text-shu">
              <AlertIcon className="mt-0.5 size-4" />
              <div>
                <p className="text-[14.5px] font-medium">This level could not be written.</p>
                <p className="mt-1 text-[13.5px] leading-[1.55] text-sumi-soft">
                  {buffer.error ?? "The register failed on its own."} The other three are on the
                  slider and unaffected.
                </p>
              </div>
            </div>
          ) : (
            <>
            {buffer.textJa.length === 0 && streaming ? (
              <div aria-hidden className="space-y-3.5 pt-1.5">
                <Skeleton className="h-[18px] w-[92%] bg-sunken" />
                <Skeleton className="h-[18px] w-[78%] bg-sunken" />
                <Skeleton className="h-[18px] w-[56%] bg-sunken" />
              </div>
            ) : null}
            <p className="ja text-[16.5px] whitespace-pre-line text-sumi lg:text-[18px] lg:leading-[2]">
              {buffer.textJa}
              {streaming ? (
                <span
                  aria-hidden
                  className="breathe ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.18em] bg-ai"
                />
              ) : null}
            </p>
            </>
          )}
        </div>

        {/* The teaching moment: one line on what this level changed, and why. */}
        <div className="border-t border-rule bg-sunken/50 px-[18px] py-4 lg:px-7 lg:py-5">
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="eyebrow mb-1.5 w-fit cursor-help underline decoration-rule-strong decoration-dotted underline-offset-4">
                {meta.en} · {meta.ja}
              </p>
            </TooltipTrigger>
            <TooltipContent side="top" align="start" className="bg-sumi text-paper">
              Why this level fits the reader, and what it changed.
            </TooltipContent>
          </Tooltip>
          {buffer.glossEn ? (
            <p className="fade font-display text-[15.5px] leading-[1.55] text-sumi-soft lg:text-[17px]">
              {buffer.glossEn}
            </p>
          ) : (
            <p className="font-display text-[15.5px] leading-[1.55] text-sumi-faint lg:text-[17px]">
              {failed ? "No note for this level." : "Working out what changed at this level…"}
            </p>
          )}
        </div>
      </div>

      <Button
        block
        onClick={() => void handleCopy()}
        disabled={failed || buffer.textJa.length === 0}
        variant={copied ? "secondary" : "primary"}
      >
        {copied ? (
          <>
            <CheckIcon className="size-[17px] text-matcha" />
            Copied — paste it into LINE
          </>
        ) : (
          <>
            <CopyIcon className="size-[17px]" />
            Copy the Japanese
          </>
        )}
      </Button>

      {/* Desktop has the room: the same message, the other three ways. */}
      <ul className="hidden gap-3 pt-2 lg:grid lg:grid-cols-3" aria-label="Other registers">
        {REGISTERS.filter((r) => r.id !== register).map((r) => {
          const b = state.buffers[r.id];
          return (
            <li key={r.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onRegisterChange(r.id)}
                className="pressable flex h-full w-full flex-col items-start gap-2 rounded-[var(--radius-inner)] border border-rule bg-raised/70 p-3.5 text-left hover:border-rule-strong"
              >
                <span className="eyebrow">{r.ja}</span>
                {b.phase === "error" ? (
                  <span className="text-[12.5px] leading-[1.5] text-shu">Could not be written.</span>
                ) : (
                  b.textJa ? (
                  <span className="ja-tight line-clamp-4 text-[12.5px] whitespace-pre-line text-sumi-soft">
                    {b.textJa}
                  </span>
                  ) : (
                    <span className="block w-full space-y-2">
                      <Skeleton className="h-3 w-full bg-sunken" />
                      <Skeleton className="h-3 w-4/5 bg-sunken" />
                    </span>
                  )
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
