"use client";

/**
 * Route-level error boundary. A bad value from the model must never
 * become a white screen: say so calmly, keep nothing, offer a retry.
 */

import { useEffect } from "react";
import { AlertIcon } from "@/components/icons";
import { Button, Wordmark } from "@/components/ui";

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
      <div className="rise card-depth w-full max-w-[440px] rounded-[var(--radius-card)] bg-raised p-6">
        <div className="flex items-center gap-2.5">
          <Wordmark compact />
        </div>
        <div className="mt-5 flex items-center gap-2 text-shu">
          <AlertIcon className="size-4" />
          <p className="text-[13.5px] font-semibold tracking-[0.01em]">The read did not finish</p>
        </div>
        <p className="font-display mt-2 text-[24px] leading-[1.2] tracking-[-0.01em] text-sumi">
          Something went wrong reading that.
        </p>
        <p className="mt-2 text-[14.5px] leading-[1.55] text-sumi-soft">
          Nothing was kept — try again.
        </p>
        <Button onClick={reset} className="mt-6">
          Try again
        </Button>
      </div>
    </main>
  );
}
