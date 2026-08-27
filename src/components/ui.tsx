"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "quiet";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-ai text-on-accent border border-transparent hover:bg-[var(--ai-hover)] disabled:bg-sunken disabled:text-sumi-faint",
  secondary:
    "bg-raised text-sumi border border-rule-strong hover:border-sumi-faint disabled:text-sumi-faint disabled:border-rule",
  quiet:
    "bg-transparent text-ai border border-transparent hover:bg-[var(--ai-wash)] disabled:text-sumi-faint",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Fills the thumb zone. Primary actions on mobile should. */
  block?: boolean;
}

export function Button({
  variant = "primary",
  block = false,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={`pressable inline-flex min-h-[48px] items-center justify-center gap-2.5 rounded-[var(--radius-pill)] px-6 text-[15px] font-medium tracking-[0.01em] disabled:cursor-not-allowed ${
        VARIANTS[variant]
      } ${block ? "w-full" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`eyebrow ${className}`}>{children}</p>;
}

/** A hairline with a hanko-red tick, used to open a section. */
export function SectionRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span aria-hidden className="h-[3px] w-[3px] rounded-full bg-shu" />
      <Eyebrow>{label}</Eyebrow>
      <span aria-hidden className="h-px flex-1 bg-rule" />
    </div>
  );
}

/** The one place the product name appears. Latin lockup + the Japanese it means. */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span
        className={`font-display tracking-[0.16em] text-sumi ${
          compact ? "text-[15px]" : "text-[19px]"
        }`}
      >
        KAIFŪ
      </span>
      <span
        className={`ja-tight text-shu ${compact ? "text-[13px]" : "text-[15px]"}`}
        aria-hidden
      >
        開封
      </span>
    </div>
  );
}
