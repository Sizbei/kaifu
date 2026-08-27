# Architecture

This document explains the decisions in KAIFŪ that are not obvious from the code, and the
reasons they are shaped the way they are. The shared contract every module speaks is
`src/lib/types.ts`; read that first.

Five rules do most of the work here:

1. The vision model never generates Japanese. Shisa never sees an image.
2. A wrong deadline is worse than no answer, so disagreement is surfaced, not resolved.
3. A low-confidence scan produces a summary, never an obligation.
4. Only `shisa-ai/*` models may be called.
5. A JUDGE finding without a citation is dropped.

---

## 1. The vision/generation seam

```
image ──► Claude (vision) ──► VisionResult (structured JSON)
                                     │
                             rawText │
                                     ▼
                          Shisa (Japan-hosted) ──► Japanese prose, registers
```

Claude does OCR, document classification, and field extraction. Its output is
`VisionResultSchema` — a document type, a confidence score, the transcribed Japanese
title, the full raw transcription, the issuer, and arrays of dates, amounts, and
obligations. No prose. No Japanese generation. No advice.

Shisa (`api.shisa.ai/openai/v1`) does every piece of Japanese generation: the summary
phrasing, the register renderings, the glosses, the JUDGE plain-language restatements. It
receives text. It never receives an image.

**Why the seam exists.**

*Data residency is a product promise.* These documents contain names, home addresses,
salary figures, and residence status. "Your Japanese text is processed in Japan" is
something the product says to the user, which means it has to be true structurally rather
than by good intentions. Because the image never leaves the vision path and the Japanese
generation never leaves the Shisa path, the guarantee is checkable by reading two function
signatures rather than by auditing prompt text.

*The register engine is the moat.* Rendering one intent at four registers, with an honest
account of what changed between them, is the part of this product that is hard to
reproduce. It runs on a model trained on Japanese rather than one that merely tolerates
it, and keeping that path clean of OCR concerns keeps it tunable.

The practical consequence: if a change would have Claude write a Japanese sentence, or
have Shisa read pixels, the change is wrong regardless of how much simpler it looks.

---

## 2. Data flow, end to end

**Capture.** The browser takes a photograph and downscales it client-side before upload —
smaller payload, faster round trip, and less raw personal data crossing the wire than the
sensor produced. It is encoded as base64 JPEG with no `data:` prefix and posted as
`DecodeRequest`.

**`/api/decode`.**

1. *Vision pass.* The image goes to Claude with a schema-constrained prompt. The response
   is parsed through `VisionResultSchema`. A response that does not validate is an error,
   not something to repair — a partially-parsed obligation is exactly the failure mode this
   product cannot afford.
2. *Deterministic pass.* `extract.ts` regexes over `VisionResult.rawText` — the raw
   transcription, not the model's structured claims — for dates and amounts. It
   understands Japanese-era dates (令和8年9月5日) alongside Western ones, and yen written
   as `3,200円`, `¥3,200`, and `金参千弐百円`-style variants. Every hit carries its `raw`
   surface form, so provenance survives to the UI.
3. *Cross-check.* The two sets are compared (§3).
4. *Confidence gate.* Below threshold, obligations are dropped and the card is marked
   `summaryOnly` (§4).
5. *Generation.* Shisa turns what survived into the user-facing `summary` and, for
   `lease_clause`, the JUDGE findings (§5).
6. The `ActionCard` is returned. Nothing is written down.

**`/api/reply`.** Takes a `ReplyRequest` — the user's intent in their own language, the
recipient, and enough card context to reference the document. It opens four concurrent
Shisa generations, one per register, and streams them as `ReplyEvent`s tagged by register:
`delta` for text, `gloss` for the one-line explanation, then `done` or `error`. The client
slider reads from four independently-filling buffers; moving it never starts work, so
there is no latency on the interaction that people will use most. A single register
failing emits `error` for that register alone — the other three are still useful.

**Persistence: none.** No image, no transcription, no card, no reply is written to disk or
to a database. There is no database. Buffers live for the length of the request. This is
why v0 has no history feature: it is not a missing feature, it is the design.

---

## 3. The cross-check: disagreement is shown, never resolved

A document decoding product has one truly bad failure: telling a user the deadline is the
20th when the paper says the 12th. They act on it. They miss it. They trust the wrong
answer more than they would have trusted no answer at all.

So dates and amounts are derived twice, from different places:

- the **model's** structured `dates` / `amounts` / `obligations`, which understand
  context ("this date is the deadline, that one is the event"), and
- the **deterministic pass** over `rawText`, which understands nothing about context but
  cannot hallucinate a numeral that is not in the transcription.

The two are compared per obligation. Where they agree, the obligation is presented plainly.
Where they differ, the obligation carries a `conflict`:

```ts
conflict: {
  field: "dueDate" | "amount",
  modelSaw: string,      // what the model reported
  documentSaid: string,  // what the text actually contains
}
```

A flagged obligation is still shown — suppressing it would hide a real deadline — but it is
shown **with both values visible and marked as unresolved**. The UI must not pick a winner,
average them, prefer the model, or prefer the regex. Any of those turns a visible
disagreement into an invisible wrong answer.

This is deliberately not a confidence score. A number between 0 and 1 invites the interface
to threshold it away. Two concrete values side by side, with the printed surface form
(`令和8年9月5日`) shown next to the interpretation, hands the user something they can
resolve in two seconds by glancing at the paper in their hand. They have the document. We
do not.

Note the asymmetry: the regex pass reads `rawText`, which is itself produced by the vision
model. This catches the model *reasoning* wrongly about a date it transcribed correctly,
which is the common failure. It cannot catch a misread character in the transcription
itself — that is what the confidence gate is for.

---

## 4. The confidence threshold

`VisionResult.confidence` is 0..1. `CONFIDENCE_THRESHOLD` is `0.6`. Below it, the pipeline
does not produce obligations at all: `ActionCard.summaryOnly` is set, `obligations` is
empty, and the UI must say why — this scan was not clear enough to be sure what you have
to do.

The scan that motivates this is real and common: a school printout, folded into quarters,
photographed at an angle in a genkan, with a teacher's handwritten note over the date box.
The words are half-readable. A model asked for a deadline will produce one. It will be
wrong at a rate the user has no way to detect.

Degrading to a translated summary is the honest output. The user still learns what the
document is and roughly what it concerns, which is most of the value, and they learn it
without being handed a false deadline. The remedy is also obvious to them: retake the
photo, flatter and better lit.

`docType: "unknown"` routes the same way. It is not an error path — v0 recognises three
document types, and a correct "I know this is a Japanese document, here is what it says,
I do not know its category well enough to tell you your obligations" is a good answer.

The threshold is a single exported constant so that it is tunable against fixtures rather
than being scattered through branches.

---

## 5. The model allowlist

`SHISA_BASE_URL` points at an OpenAI-compatible gateway that serves Japan-hosted
`shisa-ai/*` models **and also** models that are not Japan-hosted (`glm-*`, `qwen*`).
Which one you get is decided by a string in an environment variable.

That is an unacceptable amount of trust to place in a config file when the payload is a
photographed lease containing someone's name, address, and salary, and the promise made is
that it is processed in Japan.

`src/lib/shisa.ts` therefore allowlists by prefix: the configured model must begin with
`shisa-ai/`. Anything else fails loudly at client construction, before any request is
built. Not a warning, not a fallback to the default — a refusal. A typo, a copy-pasted
snippet from the gateway's docs, or a well-meant "let me try a cheaper model" cannot
result in a lease PDF being sent off-shore.

Two properties make this worth the small rigidity:

- It fails at startup, not on the request that carries the sensitive data.
- It is a prefix allowlist, not a blocklist. New non-Japan-hosted models appearing on the
  gateway do not silently become reachable.

The check belongs in the client, not in the calling code, because there is exactly one
place a model name can enter the system and that is where it should be stopped.

---

## 6. JUDGE: citation or drop

JUDGE compares a lease clause against published 国土交通省 (MLIT) guidance. What it
produces is a `JudgeFinding`:

```ts
{
  clauseJa: string,       // the clause as printed, quoted
  clausePlain: string,    // plain-language restatement, user's language
  guidelineSays: string,  // what the cited guideline says. Neutral voice
  citation: { source, section, url },   // never optional
  status: "matches" | "differs" | "not_addressed",
}
```

Three constraints, all of them load-bearing.

**The citation is not optional, and a finding without one is dropped.** Not softened, not
hedged, not shipped with a disclaimer. Dropped. The value of the layer is "here is what
the published guidance says, go read it" — a claim with nothing behind it is worse than
silence, because it is indistinguishable from the sourced ones sitting next to it.
`groundtruth.ts` holds the cited corpus; if a clause does not map into it, the honest
result is `not_addressed`.

**`"differs"` is the strongest word available.** Not "illegal", not "unenforceable", not
"unfair", not "you should push back". The enum has no term stronger than `differs` on
purpose, so that neither a prompt edit nor a UI copy change can escalate the claim without
someone changing the type and noticing why it is that way.

**Neutral voice, no recommendation.** A finding states what the document says and what the
guideline says, and stops. It does not advise, does not tell the user what to do about it,
and does not assess whether the clause would hold up.

The reason is 弁護士法 (Attorney Act) Article 72, which restricts the handling of legal
matters for compensation to licensed attorneys. Translating a clause and placing it beside
a public government document is comparison and translation. Telling a resident that their
clause is void and they should refuse to pay is legal work. The gap between those is
narrow, it is where the product would like to drift, and the citation-or-drop rule plus
the capped `status` vocabulary is the structural thing keeping it on the correct side —
rather than a line of prompt text that any future edit could dilute.

The UI carries the same obligation: the citation is displayed with the finding, never
folded behind a tooltip or an expander. The source being visible *is* the product.

---

## Test strategy

The suite mocks every network call, so it runs with no API keys and CI needs no secrets.
What is worth testing here is the deterministic surface:

- `extract.ts` — given this raw transcription, these dates and amounts, including
  Japanese-era conversion.
- the cross-check — given this model output and this transcription, this `conflict` is
  raised, and given agreement, none is.
- the confidence gate — below threshold, `obligations` is empty and `summaryOnly` is true.
- the allowlist — a non-`shisa-ai/*` model fails at construction.
- JUDGE — a finding lacking a citation does not survive into `ActionCard.findings`.

Register quality is not unit-testable and is not in CI. It is a separate eval that makes
real Shisa calls and is read by a human — see the README.
