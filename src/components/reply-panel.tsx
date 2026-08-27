"use client";

import { useState } from "react";
import type { ActionCard, DocType, RegisterId, ReplyRequest } from "@/lib/types";
import { useReplyStream } from "@/components/use-reply-stream";
import { RegisterOutput } from "@/components/register-output";
import { Button, SectionRule } from "@/components/ui";
import { AlertIcon, SendIcon } from "@/components/icons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
    <section className="space-y-4 lg:space-y-5">
      <SectionRule label="Write back" />

      {!started ? (
        <Card className="rise card-depth gap-0 rounded-[var(--radius-card)] bg-raised py-0 text-base ring-0">
        <CardContent className="space-y-5 p-[18px] lg:space-y-6 lg:p-6">
          <div className="space-y-2">
            <Label htmlFor="reply-intent" className="text-[14.5px] leading-normal font-medium text-sumi">
              What do you want to say?
            </Label>
            <p className="text-[13px] leading-[1.5] text-sumi-faint">
              In English, plainly. The Japanese is written for you at four levels of politeness.
            </p>
            <Textarea
              id="reply-intent"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              rows={3}
              placeholder={PLACEHOLDER[card.docType]}
              className="min-h-[92px] resize-none rounded-[var(--radius-inner)] border-rule-strong bg-paper px-3.5 py-3 text-[15.5px] leading-[1.55] text-sumi placeholder:text-sumi-faint focus-visible:border-ai focus-visible:ring-ai-wash md:text-[15.5px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reply-recipient" className="text-[14.5px] leading-normal font-medium text-sumi">
              Who reads it?
            </Label>
            <Input
              id="reply-recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="h-12 rounded-[var(--radius-inner)] border-rule-strong bg-paper px-3.5 text-[15px] text-sumi focus-visible:border-ai focus-visible:ring-ai-wash md:text-[15px]"
            />
            <div className="flex flex-wrap gap-2 pt-0.5">
              {RECIPIENT_CHIPS[card.docType].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setRecipient(chip)}
                  aria-pressed={recipient === chip}
                  className={`pressable h-9 rounded-[var(--radius-pill)] border px-3.5 text-[13px] font-medium ${
                    recipient === chip
                      ? "border-ai bg-ai-wash text-ai"
                      : "border-rule-strong text-sumi-soft hover:border-sumi-faint"
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
        </CardContent>
        </Card>
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
        <Alert
          variant="destructive"
          className="fade rounded-[var(--radius-inner)] border-shu-line bg-shu-wash px-4 py-3 text-shu"
        >
          <AlertIcon className="size-4" />
          <AlertDescription className="text-[13.5px] leading-[1.5] text-shu">
            {state.fatal} Nothing was sent anywhere. You can try again.
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
