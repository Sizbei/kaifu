"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ActionCard as ActionCardData, DecodeRequest, DecodeResponse } from "@/lib/types";
import { prepareImage } from "@/components/image-prep";
import { mockBenchmark, mockCard, parseMock, type MockScenario } from "@/components/mock-data";
import { CaptureScreen } from "@/components/capture-screen";
import { ProcessingScreen } from "@/components/processing-screen";
import { ActionCard } from "@/components/action-card";
import { ReplyPanel } from "@/components/reply-panel";
import { Wordmark } from "@/components/ui";
import { BackIcon } from "@/components/icons";
import { BENCHMARK_HEADER, parseBenchmarkHeader, type BenchmarkMap } from "@/lib/benchmark";

type Phase = "capture" | "processing" | "card";

interface AppState {
  phase: Phase;
  previewUrl: string | null;
  card: ActionCardData | null;
  /** Rides beside the card, never on it — ActionCard is frozen. */
  benchmark: BenchmarkMap | null;
  error: string | null;
}

interface Decoded {
  card: ActionCardData;
  benchmark: BenchmarkMap | null;
}

const START: AppState = { phase: "capture", previewUrl: null, card: null, benchmark: null, error: null };

/** The corpus opt-in. Remembered per device; default off, and off again if storage misbehaves. */
const CONTRIBUTE_KEY = "kaifu.contribute";

function readContribute(): boolean {
  try {
    return window.localStorage.getItem(CONTRIBUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeContribute(on: boolean): void {
  try {
    window.localStorage.setItem(CONTRIBUTE_KEY, on ? "1" : "0");
  } catch {
    // Preference simply does not persist.
  }
}

export function KaifuApp() {
  const [state, setState] = useState<AppState>(START);
  const [peeking, setPeeking] = useState(false);
  const contribute = useSyncExternalStore(subscribeNever, readContribute, () => false);
  const [contributeOverride, setContributeOverride] = useState<boolean | null>(null);
  const contributing = contributeOverride ?? contribute;
  const setContributing = useCallback((on: boolean) => {
    writeContribute(on);
    setContributeOverride(on);
  }, []);

  // The dev-only ?mock= flag. Read as an external store rather than in an
  // effect: the server snapshot is null, so SSR and hydration agree, and the
  // query string cannot change without a navigation.
  const mock = useSyncExternalStore<MockScenario | null>(
    subscribeNever,
    () => parseMock(window.location.search),
    () => null,
  );

  useEffect(() => {
    if (state.phase === "card") window.scrollTo({ top: 0 });
  }, [state.phase]);

  const handleFile = useCallback(
    async (file: File) => {
      setState({ ...START, phase: "processing" });
      try {
        const prepared = await prepareImage(file);
        setState((prev) => ({ ...prev, previewUrl: prepared.dataUrl }));

        const { card, benchmark } = mock
          ? await decodeMock(mock)
          : await decode({ imageBase64: prepared.base64, outputLang: "en" }, contributing);

        setState((prev) => ({ ...prev, phase: "card", card, benchmark, error: null }));
      } catch (err) {
        setState({
          ...START,
          error:
            err instanceof Error
              ? err.message
              : "Something went wrong reading that photo. Nothing was kept — try again.",
        });
      }
    },
    [mock, contributing],
  );

  const reset = useCallback(() => {
    setPeeking(false);
    setState(START);
  }, []);

  if (state.phase === "capture") {
    return (
      <main className="mx-auto flex w-full max-w-[520px] flex-1 flex-col">
        <CaptureScreen
          onFile={(file) => void handleFile(file)}
          error={state.error}
          mockLabel={mock ? `mock · ${mock}` : null}
          contribute={contributing}
          onContributeChange={setContributing}
        />
      </main>
    );
  }

  if (state.phase === "processing" || !state.card) {
    return (
      <main className="mx-auto flex w-full max-w-[520px] flex-1 flex-col">
        <ProcessingScreen previewUrl={state.previewUrl ?? ""} onCancel={reset} />
      </main>
    );
  }

  return (
    <main className="relative z-1 mx-auto w-full max-w-[520px] flex-1 px-6 pt-5 pb-[max(40px,env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-10 -mx-6 mb-7 flex items-center justify-between gap-3 border-b border-rule bg-paper/85 px-6 py-3 backdrop-blur-md">
        <button
          type="button"
          onClick={reset}
          className="pressable -ml-2 flex min-h-11 items-center gap-1.5 pr-2 pl-2 text-[13.5px] font-medium text-sumi-soft"
        >
          <BackIcon className="size-[15px]" />
          New
        </button>
        <Wordmark compact />
        {state.previewUrl ? (
          <button
            type="button"
            onClick={() => setPeeking((p) => !p)}
            aria-pressed={peeking}
            className="pressable size-9 shrink-0 overflow-hidden rounded-[6px] border border-rule-strong"
            title="Show the photo"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.previewUrl}
              alt="Show the photo you took"
              className="size-full object-cover"
            />
          </button>
        ) : (
          <span className="size-9" />
        )}
      </header>

      {peeking && state.previewUrl ? (
        <figure className="rise card-depth mb-7 overflow-hidden rounded-[var(--radius-card)] bg-raised p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={state.previewUrl}
            alt="The document you photographed"
            className="block w-full rounded-[var(--radius-inner)] object-contain"
          />
          <figcaption className="px-1 pt-2 pb-1 text-[12px] text-sumi-faint">
            Held in this tab only. Leaving the page discards it.
          </figcaption>
        </figure>
      ) : null}

      <div className="space-y-9">
        <ActionCard card={state.card} benchmark={state.benchmark} />
        <ReplyPanel card={state.card} mock={mock !== null} />
      </div>

      <p className="mt-10 border-t border-rule pt-5 text-[12px] leading-[1.55] text-sumi-faint">
        KAIFŪ read this once and kept nothing. Machine translation of an official document is a
        starting point, not a substitute for the document itself.
      </p>
    </main>
  );
}

const subscribeNever = () => () => {};

async function decode(request: DecodeRequest, contribute: boolean): Promise<Decoded> {
  // `contribute` is not on DecodeRequest (frozen); the route reads it off the raw body.
  const res = await fetch("/api/decode", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...request, contribute }),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 413
        ? "That photo was too large to send. Try again with a single page in frame."
        : `The reader answered ${res.status}. Nothing was kept — try again.`,
    );
  }
  const body: DecodeResponse = await res.json();
  if (!body.ok) throw new Error(body.error);
  return { card: body.card, benchmark: parseBenchmarkHeader(res.headers.get(BENCHMARK_HEADER)) };
}

function decodeMock(scenario: MockScenario): Promise<Decoded> {
  return new Promise((resolve) => {
    window.setTimeout(
      () => resolve({ card: mockCard(scenario), benchmark: mockBenchmark(scenario) }),
      5200,
    );
  });
}
