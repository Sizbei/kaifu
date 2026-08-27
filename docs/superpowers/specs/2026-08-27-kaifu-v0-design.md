# KAIFŪ v0 — design

2026-08-27 · Raymond Chen · status: approved, building

## What v0 is

The pitch artifact. Camera → action card → register slider, live, on a phone,
against documents nobody has tested before. Three document types recognised:
school notice, ward tax letter, lease clause. Everything else routes to
`unknown` → translated summary only.

Success metric, from the product spec: a correct action card from a document
never seen before, generated live on stage.

## Decisions made

| Decision | Choice | Why |
|---|---|---|
| Scope | v0 + JUDGE-lite | The demo script's kicker is the MLIT restoration-clause flag. It is one file. |
| Vision | Claude | Key already present; strong on Japanese OCR + structured extraction in one call |
| Japanese generation | Shisa, `api.shisa.ai/openai/v1` | Japan-hosted inference is a product guarantee, not infra |
| Stack | Next.js 15 + Tailwind 4, Vercel | Server routes hold keys; streaming is built in; matches existing repos |
| Persistence | None | Documents contain PII. v0 stores no image, no text, no history. |
| Repo | `~/Documents/github/kaifu`, private | |

## The seam

Shisa never does OCR. The vision model never generates Japanese. Enforced by
module boundary (`vision.ts` returns only `VisionResult` JSON; `shisa.ts` never
receives an image) and by prompt, and guarded by tests.

## Pipeline

```
camera → downscale 1568px client-side → POST /api/decode
    ├─ vision.ts   Claude → VisionResult (docType, confidence, rawText, dates, amounts, obligations)
    ├─ extract.ts  deterministic regex over rawText → independent dates/amounts
    └─ crossCheck  model vs document. Disagreement → obligation.conflict populated, SHOWN to user
           ↓
    confidence < 0.6 → summaryOnly, no obligations
    docType = lease_clause → judge.ts → JudgeFinding[] (citation or dropped)
           ↓
    shisa.ts → whatThisIs + summary in user language → ActionCard
```

```
intent + recipient → POST /api/reply → four concurrent Shisa streams
    → NDJSON ReplyEvent stream (delta / gloss / done / error per register)
    → UI buffers per register; slider selects, never triggers generation
```

## Hard rules

1. **A wrong deadline is worse than no answer.** Cross-check disagreements are
   displayed with both values. Never silently resolved, never dropped.
2. **Citation or silence.** A JUDGE finding whose citation does not match the
   ground-truth corpus exactly is dropped in code. "differs" is the strongest
   word used. No advice language (弁護士法 72条).
3. **Model allowlist.** The Shisa gateway also serves `glm-*` / `qwen*`, which are
   not Japan-hosted. `SHISA_MODEL` must match `/^shisa-ai\//` or the client
   refuses to construct.
4. **No persistence.** Stated in the UI.

## Modules

| File | Job | I/O |
|---|---|---|
| `lib/types.ts` | shared contract | — |
| `lib/extract.ts` | dates, amounts, crossCheck | pure |
| `lib/vision.ts` + `doctypes.ts` | Claude OCR/classify/extract | Anthropic |
| `lib/shisa.ts` + `prompts.ts` | card text, four-register streaming | Shisa |
| `lib/judge.ts` + `groundtruth.ts` | MLIT clause comparison | Shisa (injected) |
| `app/api/decode`, `app/api/reply` | orchestration only | — |
| `app/`, `components/` | capture → card → reply | — |
| `fixtures/` | 12+ realistic JP documents with expected extractions | — |

## Testing

Vitest. `extract.ts` and the crossCheck are pure and fully unit-tested.
Vision and Shisa are mocked; CI runs with no keys. `scripts/eval-registers.mjs`
runs live against Shisa and produces a review sheet for a native speaker.

## Out of scope for v0

Accounts, history, calendar sync (ICS download only), languages other than
English output, real MLIT RAG (hardcoded corpus), payments, PDF upload.
