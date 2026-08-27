"use client";

import type { ComponentProps, ReactNode } from "react";
import { Button as ShadButton } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "quiet";

/* KAIFŪ's three button voices on top of shadcn's Button: a pill, 48px tall,
   pressed state under 100ms. */
const VARIANTS: Record<Variant, { variant: "default" | "outline" | "ghost"; className: string }> = {
  primary: {
    variant: "default",
    className:
      "bg-ai text-on-accent hover:bg-[var(--ai-hover)] active:bg-[var(--ai-hover)] disabled:bg-sunken disabled:text-sumi-faint disabled:opacity-100",
  },
  secondary: {
    variant: "outline",
    className:
      "border-rule-strong bg-raised text-sumi hover:border-sumi-faint hover:bg-raised active:bg-sunken disabled:border-rule disabled:text-sumi-faint disabled:opacity-100",
  },
  quiet: {
    variant: "ghost",
    className: "text-ai hover:bg-ai-wash hover:text-ai active:bg-ai-wash disabled:text-sumi-faint",
  },
};

interface ButtonProps extends Omit<ComponentProps<typeof ShadButton>, "variant" | "size"> {
  variant?: Variant;
  /** Fills the thumb zone. Primary actions on mobile should. */
  block?: boolean;
}

export function Button({ variant = "primary", block = false, className, ...rest }: ButtonProps) {
  const v = VARIANTS[variant];
  return (
    <ShadButton
      variant={v.variant}
      size="lg"
      {...rest}
      className={cn(
        "pressable h-12 gap-2.5 rounded-[var(--radius-pill)] px-6 text-[15px] font-medium tracking-[0.01em] focus-visible:ring-0 active:translate-y-0 disabled:pointer-events-auto disabled:cursor-not-allowed [&_svg:not([class*='size-'])]:size-[17px]",
        v.className,
        block && "w-full",
        className,
      )}
    />
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
      <Separator className="flex-1 bg-rule data-horizontal:w-auto" />
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
