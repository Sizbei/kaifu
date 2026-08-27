"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { REGISTERS, type RegisterId, type ReplyEvent, type ReplyRequest } from "@/lib/types";
import { runMockReplyStream } from "@/components/mock-data";

/**
 * /api/reply emits newline-delimited ReplyEvent objects for all four
 * registers on ONE stream, interleaved. Deltas arrive out of order with
 * respect to register, so the only correct model is a buffer per register
 * that each delta appends to. The slider then reads finished or in-flight
 * buffers — it never causes work.
 */

export type Phase = "idle" | "streaming" | "done" | "error";

export interface RegisterBuffer {
  textJa: string;
  glossEn: string | null;
  phase: Phase;
  error: string | null;
}

export interface ReplyState {
  phase: Phase;
  /** A failure of the request itself, not of one register. */
  fatal: string | null;
  buffers: Record<RegisterId, RegisterBuffer>;
}

const EMPTY: RegisterBuffer = { textJa: "", glossEn: null, phase: "idle", error: null };

function freshBuffers(phase: Phase): Record<RegisterId, RegisterBuffer> {
  return REGISTERS.reduce<Record<string, RegisterBuffer>>((acc, r) => {
    acc[r.id] = { ...EMPTY, phase };
    return acc;
  }, {}) as Record<RegisterId, RegisterBuffer>;
}

export const INITIAL_REPLY_STATE: ReplyState = {
  phase: "idle",
  fatal: null,
  buffers: freshBuffers("idle"),
};

type Action =
  | { kind: "start" }
  | { kind: "events"; events: ReplyEvent[] }
  | { kind: "settle" }
  | { kind: "fatal"; message: string }
  | { kind: "reset" };

function applyEvent(state: ReplyState, event: ReplyEvent): ReplyState {
  const prev = state.buffers[event.register];
  if (!prev) return state;

  let next: RegisterBuffer;
  switch (event.type) {
    case "delta":
      next = { ...prev, textJa: prev.textJa + event.text, phase: "streaming" };
      break;
    case "gloss":
      next = { ...prev, glossEn: event.glossEn };
      break;
    case "done":
      next = { ...prev, phase: "done" };
      break;
    case "error":
      next = { ...prev, phase: "error", error: event.message };
      break;
  }
  // New object at every level. Nothing above is mutated.
  return { ...state, buffers: { ...state.buffers, [event.register]: next } };
}

function reducer(state: ReplyState, action: Action): ReplyState {
  switch (action.kind) {
    case "start":
      return { phase: "streaming", fatal: null, buffers: freshBuffers("streaming") };
    case "events":
      return action.events.reduce(applyEvent, state);
    case "settle": {
      // Any register still marked streaming when the body closes is finished.
      const buffers = REGISTERS.reduce<Record<string, RegisterBuffer>>((acc, r) => {
        const b = state.buffers[r.id];
        acc[r.id] = b.phase === "streaming" || b.phase === "idle" ? { ...b, phase: "done" } : b;
        return acc;
      }, {}) as Record<RegisterId, RegisterBuffer>;
      return { ...state, phase: "done", buffers };
    }
    case "fatal":
      return { ...state, phase: "error", fatal: action.message };
    case "reset":
      return INITIAL_REPLY_STATE;
  }
}

/** Split a decoded chunk into complete lines, returning the trailing partial. */
function takeLines(carry: string, chunk: string): { events: ReplyEvent[]; carry: string } {
  const merged = carry + chunk;
  const parts = merged.split("\n");
  const rest = parts.pop() ?? "";
  const events: ReplyEvent[] = [];
  for (const line of parts) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isReplyEvent(parsed)) events.push(parsed);
    } catch {
      // A malformed line is one bad frame, not a dead stream. Skip it.
    }
  }
  return { events, carry: rest };
}

function isReplyEvent(value: unknown): value is ReplyEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { type?: unknown; register?: unknown };
  if (typeof v.register !== "string") return false;
  if (!REGISTERS.some((r) => r.id === v.register)) return false;
  return v.type === "delta" || v.type === "gloss" || v.type === "done" || v.type === "error";
}

export function useReplyStream(mock: boolean) {
  const [state, dispatch] = useReducer(reducer, INITIAL_REPLY_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const timersRef = useRef<number[]>([]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  }, []);

  useEffect(() => stop, [stop]);

  const send = useCallback(
    async (request: ReplyRequest) => {
      stop();
      dispatch({ kind: "start" });

      if (mock) {
        runMockReplyStream(
          (events) => dispatch({ kind: "events", events }),
          () => dispatch({ kind: "settle" }),
          timersRef,
        );
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/reply", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          throw new Error(`The reply service answered ${res.status}.`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let carry = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const { events, carry: rest } = takeLines(carry, decoder.decode(value, { stream: true }));
          carry = rest;
          // One dispatch per network chunk, not per event: the four streams
          // interleave densely and per-event dispatch thrashes the tree.
          if (events.length) dispatch({ kind: "events", events });
        }
        const tail = takeLines(carry, decoder.decode());
        if (tail.events.length) dispatch({ kind: "events", events: tail.events });
        dispatch({ kind: "settle" });
      } catch (err) {
        if (controller.signal.aborted) return;
        dispatch({
          kind: "fatal",
          message: err instanceof Error ? err.message : "The reply could not be written.",
        });
      }
    },
    [mock, stop],
  );

  const reset = useCallback(() => {
    stop();
    dispatch({ kind: "reset" });
  }, [stop]);

  return { state, send, reset };
}
