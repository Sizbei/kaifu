"use client";

import { useRef, type ChangeEvent } from "react";
import { Button, Wordmark } from "@/components/ui";
import { AlertIcon, CameraIcon, SealIcon, UploadIcon } from "@/components/icons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface CaptureScreenProps {
  onFile: (file: File) => void;
  error: string | null;
  mockLabel: string | null;
  /** Corpus opt-in. Off unless the user has ticked it. */
  contribute: boolean;
  onContributeChange: (on: boolean) => void;
}

/** A sealed envelope, drawn rather than photographed. Sets the metaphor. */
function EnvelopeMark({ className = "max-w-[236px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 132" className={`h-auto w-full text-rule-strong ${className}`} aria-hidden>
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

export function CaptureScreen({
  onFile,
  error,
  mockLabel,
  contribute,
  onContributeChange,
}: CaptureScreenProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Clear so re-picking the same file still fires change.
    event.target.value = "";
    if (file) onFile(file);
  };

  return (
    <section className="rise flex flex-1 flex-col pb-[max(24px,env(safe-area-inset-bottom))]">
      <header className="shell-bar px-6 pt-6 lg:pt-8">
        <Wordmark />
        {mockLabel ? (
          <span className="numeric rounded-full border border-rule-strong px-2.5 py-1 text-[10px] tracking-[0.08em] text-sumi-faint uppercase">
            {mockLabel}
          </span>
        ) : null}
      </header>

      <div className="shell shell-centered flex flex-1 flex-col px-6">
        {/* Desktop: the envelope is the object on the desk, not an icon. */}
        <aside className="shell-aside">
          <div className="sheet mx-auto w-full max-w-[560px] rounded-[10px] bg-raised p-8 xl:p-12">
            <EnvelopeMark className="max-w-none" />
          </div>
        </aside>

        <div className="flex flex-1 flex-col lg:flex-none">
          <div className="flex flex-1 flex-col justify-center gap-9 py-10 lg:flex-none lg:py-0">
            <div className="flex justify-center pt-2 lg:hidden">
              <EnvelopeMark />
            </div>

            <div className="space-y-3.5 lg:space-y-5">
              <h1 className="font-display text-[34px] leading-[1.18] tracking-[-0.015em] text-balance text-sumi lg:text-[48px] lg:leading-[1.1] lg:tracking-[-0.02em]">
                The letter you have been putting off.
              </h1>
              <p className="max-w-[34ch] text-[16px] leading-[1.6] text-sumi-soft lg:max-w-[40ch] lg:text-[18px]">
                Photograph it and get back what it is, what you have to do, by when — and a reply
                written at the politeness level the reader expects.
              </p>
            </div>
          </div>

          {error ? (
            <Alert
              variant="destructive"
              className="fade mb-4 rounded-[var(--radius-inner)] border-shu-line bg-shu-wash px-4 py-3 text-shu"
            >
              <AlertIcon className="size-4" />
              <AlertDescription className="text-[14px] leading-[1.5] text-shu">{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-3 lg:mt-9 lg:flex lg:space-y-0 lg:gap-3">
            <Button block onClick={() => cameraRef.current?.click()} className="lg:w-auto">
              <CameraIcon className="size-[18px]" />
              Photograph the document
            </Button>
            <Button
              block
              variant="secondary"
              onClick={() => libraryRef.current?.click()}
              className="lg:w-auto"
            >
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

          <div className="mt-6 flex items-start gap-3 border-t border-rule pt-5 lg:mt-10">
            <SealIcon className="mt-px size-[17px] text-matcha" />
            <p className="max-w-[58ch] text-[13px] leading-[1.55] text-sumi-soft">
              <span className="font-medium text-sumi">
                Nothing is kept unless you choose to contribute, below.
              </span>{" "}
              The photo is read once and discarded. No image, no transcribed text, no history is
              stored — not on this device, not on our side. Your name, address, salary and status
              stay on the paper.
            </p>
          </div>

          {/* Opt-in, default off, and honest about exactly what a contribution is. */}
          <div className="mt-4 flex items-start gap-3">
            <Checkbox
              id="contribute"
              checked={contribute}
              onCheckedChange={(checked) => onContributeChange(checked === true)}
              className="mt-[3px] border-rule-strong bg-raised focus-visible:ring-ai-wash data-checked:border-ai data-checked:bg-ai data-checked:text-on-accent"
            />
            <Label
              htmlFor="contribute"
              className="block max-w-[58ch] cursor-pointer text-[13px] leading-[1.55] font-normal text-sumi-soft"
            >
              <span className="font-medium text-sumi">
                Add this document&apos;s anonymized skeleton to the corpus.
              </span>{" "}
              Stored: document type, obligation kind, amount, days until due, clause type and
              guideline status. Never the text, names or image.{" "}
              <a
                href="https://github.com/Sizbei/kaifu/blob/main/docs/ARCHITECTURE.md#7-the-corpus-graph-neo4j"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ai underline decoration-ai-line underline-offset-[3px]"
              >
                What is stored, exactly
              </a>
            </Label>
          </div>
        </div>
      </div>
    </section>
  );
}
