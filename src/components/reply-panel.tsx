"use client";

import { useState } from "react";
import type { ActionCard, DocType, RegisterId, ReplyRequest } from "@/lib/types";
import { useReplyStream } from "@/components/use-reply-stream";
import { RegisterOutput } from "@/components/register-output";
import { Button, SectionRule } from "@/components/ui";
import { AlertIcon, SendIcon } from "@/components/icons";

const DEFAULT_RECIPIENT: Record<DocType, string> = {
  school_notice: "My child's class teacher",
  ward_tax_letter: "The ward office",
  lease_clause: "The property management company",
  unknown: "The sender",
};

const RECIPIENT_CHIPS: Record<DocType, readonly string[]> = {
  school_notice: ["Class teacher", "School office", "PTA representative"],
  ward_tax_letter: ["Ward office", "Tax section", "Insurance section"],
  lease_clause: ["Management company", "Landlord", "Building manager"],
  unknown: ["The sender", "Reception desk"],
};

const PLACEHOLDER: Record<DocType, string> = {
  school_notice: "tell the teacher my son is allergic to eggs",
  ward_tax_letter: "ask whether I can pay this in instalments",
  lease_clause: "ask them to explain the cleaning charge",
  unknown: "ask them what I am supposed to do next",
};

export function ReplyPanel({ card, mock }: { card: ActionCard; mock: boolean }) {
  const [intent, setIntent] = useState("");
  const [recipient, setRecipient] = useState(DEFAULT_RECIPIENT[card.docType]);
  const [register, setRegister] = useState<RegisterId>("polite");
  const { state, send, reset } = useReplyStream(mock);

  const canSend = intent.trim().length > 2;
  const started = state.phase !== "idle";

  const handleSend = () => {
    if (!canSend) return;
    const request: ReplyRequest = {
      intent: intent.trim(),
      recipient: recipient.trim() || DEFAULT_RECIPIENT[card.docType],
      docType: card.docType,
      documentSummary: card.summary,
    };
    void send(request);
  };

  return (
    <section className="space-y-4">
      <SectionRule label="Write back" />

      {!started ? (
        <div className="rise card-depth space-y-5 rounded-[var(--radius-card)] bg-raised p-[18px]">
          <div className="space-y-2">
            <label
              htmlFor="reply-intent"
              className="block text-[14.5px] font-medium text-sumi"
            >
              What do you want to say?
            </label>
            <p className="text-[13px] leading-[1.5] text-sumi-faint">
              In English, plainly. The Japanese is written for you at four levels of politeness.
            </p>
            <textarea
              id="reply-intent"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              rows={3}
              placeholder={PLACEHOLDER[card.docType]}
              className="w-full resize-none rounded-[var(--radius-inner)] border border-rule-strong bg-paper px-3.5 py-3 text-[15.5px] leading-[1.55] text-sumi placeholder:text-sumi-faint focus:border-ai focus:outline-none"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="reply-recipient"
              className="block text-[14.5px] font-medium text-sumi"
            >
              Who reads it?
            </label>
            <input
              id="reply-recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="numeric w-full rounded-[var(--radius-inner)] border border-rule-strong bg-paper px-3.5 py-3 text-[15px] text-sumi focus:border-ai focus:outline-none"
              style={{ fontFamily: "inherit" }}
            />
            <div className="flex flex-wrap gap-2 pt-0.5">
              {RECIPIENT_CHIPS[card.docType].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setRecipient(chip)}
                  className={`pressable min-h-9 rounded-[var(--radius-pill)] border px-3 text-[13px] ${
                    recipient === chip
                      ? "border-ai bg-ai-wash text-ai"
                      : "border-rule-strong text-sumi-soft"
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          <Button block onClick={handleSend} disabled={!canSend}>
            <SendIcon className="size-[17px]" />
            Write it in Japanese
          </Button>
        </div>
      ) : (
        <RegisterOutput
          state={state}
          register={register}
          onRegisterChange={setRegister}
          intent={intent}
          recipient={recipient}
          onRewrite={reset}
        />
      )}

      {state.fatal ? (
        <div
          role="alert"
          className="fade flex items-start gap-2.5 rounded-[var(--radius-inner)] border border-shu-line bg-shu-wash px-4 py-3 text-[13.5px] leading-[1.5] text-shu"
        >
          <AlertIcon className="mt-0.5 size-4" />
          <span>
            {state.fatal} Nothing was sent anywhere. You can try again.
          </span>
        </div>
      ) : null}
    </section>
  );
}
