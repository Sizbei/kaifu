"use client";

/**
 * Route-level error boundary. A bad value from the model must never
 * become a white screen: say so calmly, keep nothing, offer a retry.
 */

import { useEffect } from "react";
import { AlertIcon } from "@/components/icons";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[kaifu]", error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="card-depth w-full max-w-[420px] rounded-[var(--radius-card)] bg-raised p-[22px]">
        <div className="flex items-center gap-2 text-shu">
          <AlertIcon className="size-4" />
          <p className="text-[14.5px] font-medium">Something went wrong reading that.</p>
        </div>
        <p className="mt-2 text-[14px] leading-[1.55] text-sumi-soft">
          Nothing was kept — try again.
        </p>
        <button
          type="button"
          onClick={reset}
          className="pressable mt-5 inline-flex min-h-11 items-center rounded-[var(--radius-pill)] bg-ai px-5 text-[14px] font-medium text-on-accent"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
