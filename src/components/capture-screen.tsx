"use client";

import { useRef, type ChangeEvent } from "react";
import { Button, Wordmark } from "@/components/ui";
import { AlertIcon, CameraIcon, SealIcon, UploadIcon } from "@/components/icons";

interface CaptureScreenProps {
  onFile: (file: File) => void;
  error: string | null;
  mockLabel: string | null;
}

/** A sealed envelope, drawn rather than photographed. Sets the metaphor. */
function EnvelopeMark() {
  return (
    <svg
      viewBox="0 0 200 132"
      className="h-auto w-full max-w-[236px] text-rule-strong"
      aria-hidden
    >
      <rect
        x="1"
        y="1"
        width="198"
        height="130"
        rx="6"
        fill="var(--paper-raised)"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path
        d="M1 8 100 78 199 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path d="M1 128 74 62M199 128 126 62" fill="none" stroke="currentColor" strokeWidth="1" />
      <g className="breathe">
        <circle cx="100" cy="78" r="11" fill="var(--shu)" opacity="0.14" />
        <circle cx="100" cy="78" r="5.5" fill="var(--shu)" />
      </g>
    </svg>
  );
}

export function CaptureScreen({ onFile, error, mockLabel }: CaptureScreenProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Clear so re-picking the same file still fires change.
    event.target.value = "";
    if (file) onFile(file);
  };

  return (
    <section className="rise relative z-1 flex flex-1 flex-col px-6 pt-6 pb-[max(24px,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <Wordmark />
        {mockLabel ? (
          <span className="numeric rounded-full border border-rule-strong px-2.5 py-1 text-[10px] tracking-[0.08em] text-sumi-faint uppercase">
            {mockLabel}
          </span>
        ) : null}
      </header>

      <div className="flex flex-1 flex-col justify-center gap-9 py-10">
        <div className="flex justify-center pt-2">
          <EnvelopeMark />
        </div>

        <div className="space-y-3.5">
          <h1 className="font-display text-[34px] leading-[1.18] tracking-[-0.015em] text-balance text-sumi">
            The letter you have been putting off.
          </h1>
          <p className="max-w-[34ch] text-[16px] leading-[1.6] text-sumi-soft">
            Photograph it and get back what it is, what you have to do, by when — and a reply
            written at the politeness level the reader expects.
          </p>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="fade mb-4 flex items-start gap-2.5 rounded-[var(--radius-inner)] border border-shu-line bg-shu-wash px-4 py-3 text-[14px] leading-[1.5] text-shu"
        >
          <AlertIcon className="mt-0.5 size-4" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="space-y-3">
        <Button block onClick={() => cameraRef.current?.click()}>
          <CameraIcon className="size-[18px]" />
          Photograph the document
        </Button>
        <Button block variant="secondary" onClick={() => libraryRef.current?.click()}>
          <UploadIcon className="size-[18px]" />
          Choose a photo or scan
        </Button>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleChange}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
        />
        <input
          ref={libraryRef}
          type="file"
          accept="image/*"
          onChange={handleChange}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
        />
      </div>

      <div className="mt-6 flex items-start gap-3 border-t border-rule pt-5">
        <SealIcon className="mt-px size-[17px] text-matcha" />
        <p className="text-[13px] leading-[1.55] text-sumi-soft">
          <span className="font-medium text-sumi">Nothing is kept.</span> The photo is read once
          and discarded. No image, no transcribed text, no history is stored — not on this device,
          not on our side. Your name, address, salary and status stay on the paper.
        </p>
      </div>
    </section>
  );
}
