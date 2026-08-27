"use client";

import { useCallback, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { REGISTERS, type RegisterId } from "@/lib/types";
import type { RegisterBuffer } from "@/components/use-reply-stream";

/*
 * Four stops, and all four are already streaming or finished before this is
 * touched. Dragging only changes which buffer is foregrounded — it never
 * starts work, so there is no loading state to design for here.
 *
 * Built without <input type="range">: tapping a range track does not move the
 * thumb in iOS Safari, and tapping the stop you want is the whole gesture.
 */

interface RegisterSliderProps {
  value: RegisterId;
  onChange: (register: RegisterId) => void;
  buffers: Record<RegisterId, RegisterBuffer>;
}

function dotClass(buffer: RegisterBuffer): string {
  if (buffer.phase === "error") return "bg-shu";
  if (buffer.phase === "streaming") return "breathe bg-ai";
  if (buffer.phase === "done") return "bg-matcha";
  return "bg-rule-strong";
}

export function RegisterSlider({ value, onChange, buffers }: RegisterSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const index = REGISTERS.findIndex((r) => r.id === value);
  const active = REGISTERS[index] ?? REGISTERS[1];

  const indexFromX = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const ratio = (clientX - rect.left) / rect.width;
    return Math.min(REGISTERS.length - 1, Math.max(0, Math.floor(ratio * REGISTERS.length)));
  }, []);

  const setFromX = useCallback(
    (clientX: number) => {
      const next = REGISTERS[indexFromX(clientX)];
      if (next && next.id !== value) onChange(next.id);
    },
    [indexFromX, onChange, value],
  );

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setFromX(event.clientX);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    setFromX(event.clientX);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? -1
          : 0;
    let next = index;
    if (step !== 0) next = index + step;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = REGISTERS.length - 1;
    else return;
    event.preventDefault();
    const clamped = Math.min(REGISTERS.length - 1, Math.max(0, next));
    if (clamped !== index) onChange(REGISTERS[clamped].id);
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="Politeness register"
      aria-valuemin={0}
      aria-valuemax={REGISTERS.length - 1}
      aria-valuenow={index}
      aria-valuetext={`${active.en} — ${active.ja}`}
      aria-orientation="horizontal"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      className="relative isolate touch-pan-y rounded-[var(--radius-pill)] border border-rule bg-sunken p-1 select-none"
    >
      {/* The moving stop. Transform only, 180ms, strong ease-out. */}
      <span
        aria-hidden
        className="card-depth absolute top-1 bottom-1 left-1 -z-1 rounded-[var(--radius-pill)] bg-raised"
        style={{
          width: `calc((100% - 8px) / ${REGISTERS.length})`,
          transform: `translate3d(calc(${index} * 100%), 0, 0)`,
          transition: "transform 180ms var(--ease-move)",
        }}
      />

      <div className="grid grid-cols-4">
        {REGISTERS.map((register) => {
          const selected = register.id === value;
          const buffer = buffers[register.id];
          return (
            <div
              key={register.id}
              className="flex min-h-[52px] flex-col items-center justify-center gap-1 px-1"
            >
              <span
                className={`ja-tight text-[13.5px] transition-colors duration-150 ${
                  selected ? "font-medium text-sumi" : "text-sumi-soft"
                } ${
                  // A struck-out stop reads as "unavailable" at a glance; on the
                  // selected stop the panel says so in words, so it would be noise.
                  buffer.phase === "error" && !selected ? "line-through decoration-shu" : ""
                }`}
              >
                {register.ja}
              </span>
              <span aria-hidden className={`size-[6px] rounded-full ${dotClass(buffer)}`} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
