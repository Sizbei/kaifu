"use client";

import { Slider as SliderPrimitive } from "radix-ui";
import { REGISTERS, type RegisterId } from "@/lib/types";
import type { RegisterBuffer } from "@/components/use-reply-stream";
import { cn } from "@/lib/utils";

/*
 * Four stops, and all four are already streaming or finished before this is
 * touched. Dragging only changes which buffer is foregrounded — it never
 * starts work, so there is no loading state to design for here.
 *
 * Radix Slider underneath: the thumb carries role="slider", the arrow keys,
 * Home/End and aria-valuenow. The labels above and below are the stops.
 */

interface RegisterSliderProps {
  value: RegisterId;
  onChange: (register: RegisterId) => void;
  buffers: Record<RegisterId, RegisterBuffer>;
}

/** Short English under each stop; the full name lives on the output panel. */
const SHORT_EN: Record<RegisterId, string> = {
  casual: "Casual",
  polite: "Polite",
  keigo: "Keigo",
  formal: "Formal",
};

function dotClass(buffer: RegisterBuffer): string {
  if (buffer.phase === "error") return "bg-shu";
  if (buffer.phase === "streaming") return "breathe bg-ai";
  if (buffer.phase === "done") return "bg-matcha";
  return "bg-rule-strong";
}

export function RegisterSlider({ value, onChange, buffers }: RegisterSliderProps) {
  const index = Math.max(0, REGISTERS.findIndex((r) => r.id === value));
  const active = REGISTERS[index] ?? REGISTERS[1];

  return (
    <div
      data-testid="register-slider"
      className="rounded-[var(--radius-card)] border border-rule bg-sunken px-2 pt-3 pb-2.5 select-none lg:px-3 lg:pt-4 lg:pb-3"
    >
      {/* Japanese above the rail. Tapping a stop is the whole gesture. */}
      <div className="grid grid-cols-4">
        {REGISTERS.map((register, i) => {
          const selected = i === index;
          const failed = buffers[register.id].phase === "error";
          return (
            <button
              key={register.id}
              type="button"
              tabIndex={-1}
              onClick={() => onChange(register.id)}
              className={cn(
                "ja-tight pressable rounded-[var(--radius-inner)] py-1 text-center text-[14px] transition-colors duration-150 lg:text-[15px]",
                selected ? "font-medium text-sumi" : "text-sumi-soft",
                // A struck-out stop reads as "unavailable" at a glance; on the
                // selected stop the panel says so in words, so it would be noise.
                failed && !selected && "line-through decoration-shu",
              )}
            >
              {register.ja}
            </button>
          );
        })}
      </div>

      <SliderPrimitive.Root
        data-slot="slider"
        value={[index]}
        min={0}
        max={REGISTERS.length - 1}
        step={1}
        onValueChange={([next]) => {
          const target = REGISTERS[next];
          if (target && target.id !== value) onChange(target.id);
        }}
        className="relative mx-[12.5%] my-2 flex h-8 w-3/4 touch-none items-center select-none"
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative h-[3px] w-full grow rounded-full bg-rule-strong"
        >
          <SliderPrimitive.Range data-slot="slider-range" className="absolute h-full rounded-full bg-ai" />
          {/* One notch per stop. */}
          {REGISTERS.map((r, i) => (
            <span
              key={r.id}
              aria-hidden
              className={cn(
                "absolute top-1/2 size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sunken",
                i <= index ? "bg-ai" : "bg-rule-strong",
              )}
              style={{ left: `${(i / (REGISTERS.length - 1)) * 100}%` }}
            />
          ))}
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          aria-label="Politeness register"
          aria-valuetext={`${active.en} — ${active.ja}`}
          className="register-stop card-depth block size-[26px] rounded-full border-2 border-ai bg-raised outline-none after:absolute after:-inset-3 focus-visible:ring-4 focus-visible:ring-ai-wash"
        />
      </SliderPrimitive.Root>

      {/* English beneath, with each register's stream state. */}
      <div className="grid grid-cols-4">
        {REGISTERS.map((register, i) => {
          const selected = i === index;
          return (
            <span
              key={register.id}
              className="flex items-center justify-center gap-1.5"
            >
              <span
                aria-hidden
                className={`size-[5px] rounded-full ${dotClass(buffers[register.id])}`}
              />
              <span
                className={cn(
                  "text-[10.5px] tracking-[0.08em] uppercase transition-colors duration-150",
                  selected ? "text-sumi" : "text-sumi-faint",
                )}
              >
                {SHORT_EN[register.id]}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
