"use client";

import { useState } from "react";
import { REGISTERS, type RegisterId } from "@/lib/types";
import type { ReplyState } from "@/components/use-reply-stream";
import { RegisterSlider } from "@/components/register-slider";
import { Button } from "@/components/ui";
import { AlertIcon, CheckIcon, CopyIcon } from "@/components/icons";

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
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="rise space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] leading-[1.5] text-sumi-faint">
          <span className="text-sumi-soft">&ldquo;{intent}&rdquo;</span>
          <br />
          to {recipient}
        </p>
        <button
          type="button"
          onClick={onRewrite}
          className="pressable -mt-2 -mr-2 min-h-11 shrink-0 px-2 text-[13px] font-medium text-ai"
        >
          Change
        </button>
      </div>

      <RegisterSlider value={register} onChange={onRegisterChange} buffers={state.buffers} />

      <div className="card-depth overflow-hidden rounded-[var(--radius-card)] bg-raised">
        <div className="min-h-[152px] p-[18px]">
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
            <p className="ja text-[16.5px] whitespace-pre-line text-sumi">
              {buffer.textJa}
              {streaming ? (
                <span
                  aria-hidden
                  className="breathe ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.18em] bg-ai"
                />
              ) : null}
            </p>
          )}
        </div>

        {/* The teaching moment: one line on what this level changed, and why. */}
        <div className="border-t border-rule bg-sunken/50 px-[18px] py-3.5">
          <p className="eyebrow mb-1.5">
            {meta.en} · {meta.ja}
          </p>
          {buffer.glossEn ? (
            <p className="fade text-[13.5px] leading-[1.6] text-sumi-soft">{buffer.glossEn}</p>
          ) : (
            <p className="text-[13.5px] leading-[1.6] text-sumi-faint">
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
    </div>
  );
}
