# KAIFŪ

**開封** — "opening a sealed envelope."

A Japanese document arrives. A print-out in a child's school bag, a notice from the ward
office, a clause in a lease renewal. A translation app will tell you what the words
say. It will not tell you that you have eleven days to return a stamped form, or how much
to pay, or what to write back.

KAIFŪ is a mobile-first web app for foreign residents in Japan. Photograph the document
and get back: what it is, what you must do, by when — and a reply you can actually send,
rendered at the Japanese politeness register the situation calls for.

Japan has millions of foreign residents dealing with this paper flood. Nothing currently
tells them what a document *means they must do*.

---

## Two things to know before reading further

**v0 persists nothing.** No image, no document text, no extracted fields, no history. The
photograph is downscaled in the browser, posted to the API, held in memory for the length
of the request, and dropped. Nothing is written to disk or to a database — there is no
database. These documents contain names, addresses, salaries, and residence status, and
the shortest path to not leaking them is not to keep them.

**This is not legal advice.** The JUDGE layer translates a clause and places it beside
published government guidance, with the citation shown. It never says a clause is illegal,
unfair, void, or unenforceable — `"differs"` is the strongest word in the vocabulary (see
`JudgeFindingSchema.status` in `src/lib/types.ts`). Japan's 弁護士法 (Attorney Act)
Article 72 restricts non-lawyers from providing legal services for a fee, and the
citation-or-silence rule is how the product stays on the right side of it: a finding
without a citation is not a finding, and is dropped rather than softened.

---

## The three layers

**DECODE** (free) — What is this document? What must you do, and by when? One tap adds the
deadline to a calendar. Covers the everyday paper: school notices, ward-office and tax
mail, lease clauses.

**JUDGE** (paid) — A lease clause set beside the relevant published 国土交通省 (MLIT)
guidance, in the user's language, with the source and section linked. Comparison and
translation only, always with the citation shown.

**REPLY** (the differentiator) — The same message rendered at four registers —
カジュアル / 丁寧 / 敬語 / 最敬語 — generated concurrently and streamed together, with a
one-line English gloss of what changed at each level and why it suits the reader. The
slider selects between finished streams; it never triggers new work.

Register is where the real difficulty lives. Knowing *what* to reply is a translation
problem. Knowing whether this ward-office clerk gets 丁寧 or 敬語, and what it signals
when you get it wrong, is the thing no dictionary tells you.

---

## Quickstart

Requires Node 22+ and pnpm 8.

```bash
pnpm install
cp .env.example .env.local
# fill in the two keys, then:
pnpm dev
```

Open http://localhost:3000. The app wants a camera; on desktop, use the file picker
fallback and the sample documents in `src/fixtures/`.

---

## Environment variables

All live in `.env.local` (git-ignored; `.env.example` is the committed template).

| Variable | Required | What it is |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | yes | Claude, used for OCR, document classification, and field extraction. **Never** for Japanese generation. Get one at [console.anthropic.com](https://console.anthropic.com) → API Keys. |
| `SHISA_BASE_URL` | yes | Japan-hosted OpenAI-compatible gateway. `https://api.shisa.ai/openai/v1`. |
| `SHISA_API_KEY` | yes | Key for that gateway. Get one at [shisa.ai](https://shisa.ai). |
| `SHISA_MODEL` | yes | Default `shisa-ai/shisa-v2.1-llama3.3-70b`. Must start with `shisa-ai/` — see below. |

The Shisa gateway also serves models that are **not** Japan-hosted (`glm-*`, `qwen*`).
`src/lib/shisa.ts` allowlists the `shisa-ai/*` prefix and refuses anything else at
startup, so an edited `.env.local` cannot quietly route a lease PDF off-shore. If you want
a different model, it has to be a `shisa-ai/*` one.

No keys are needed to run the test suite. Every network call is mocked.

---

## Architecture

```
camera → downscale client-side → /api/decode
              ├─ Claude vision  → structured JSON ONLY (OCR, classification, field extraction)
              ├─ deterministic regex pass over the raw transcription (dates, amounts)
              └─ cross-check: model vs document. Disagreement is SHOWN, never silently resolved
                     ↓
              Shisa (Japan-hosted, api.shisa.ai/openai/v1) → all Japanese generation + register work
```

One seam runs through the whole system: **Shisa never does OCR; the vision model never
generates Japanese.** Two reasons, and both are product decisions rather than plumbing.

The documents carry names, addresses, salaries, and visa status. "Japanese text is
processed in Japan" is a promise made to the user, not an infrastructure detail — which
means it has to hold at the level of code, not intent. The vision model sees the image and
returns structured JSON (`VisionResultSchema`); Shisa sees text and returns Japanese.
Neither can drift into the other's job without the seam being visibly cut.

And the register engine is the moat. Four-way register rendering with an honest gloss of
what changed is the part of this product that is hard to copy, and it runs on a model
trained for Japanese rather than one that merely tolerates it.

Two further rules that the code enforces:

- **A wrong deadline is worse than no answer.** Dates and amounts are extracted twice —
  once by the model, once by a deterministic regex pass over the raw transcription. When
  they disagree, the obligation is shown to the user *with both values and the conflict
  visible* (`Obligation.conflict`). Nothing is silently reconciled.
- **A bad scan gets a summary, not an obligation.** Below `CONFIDENCE_THRESHOLD` (0.6) the
  card degrades to `summaryOnly`: a translated summary with the obligation list empty and
  the reason stated. A crumpled, hand-annotated school print should produce less, not
  something confidently wrong.

Full detail — including the allowlist and the JUDGE citation-or-drop rule — is in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Project structure

```
src/
  lib/
    types.ts         Shared contract. Zod schemas + types. Every module speaks these
                     and nothing else. Read this first.
    vision.ts        Claude vision call: OCR, classification, field extraction → VisionResult
    doctypes.ts      The three v0 document types and their extraction hints
    extract.ts       Deterministic date/amount regex pass + the cross-check against the model
    shisa.ts         Shisa client. Model allowlist lives here
    prompts.ts       Register engine: the four register prompts and the gloss
    judge.ts         Lease clause → MLIT guidance comparison
    groundtruth.ts   The cited guidance corpus JUDGE compares against
  fixtures/          Sample Japanese documents used by tests and desktop dev
  app/               Next.js routes, including /api/decode and /api/reply
  components/        UI: capture, action card, register slider
docs/ARCHITECTURE.md
```

`src/lib/types.ts` is the contract. It is the one file to read before touching anything
else, and changes to it ripple through every module.

---

## Tests and the register eval

```bash
pnpm test          # vitest, unit + integration. All network calls mocked; no keys needed
pnpm test:watch
npx tsc --noEmit   # the contract is enforced by types; run this
pnpm lint
```

The suite covers the deterministic extraction pass (given this raw text, these dates and
amounts), the cross-check (given this model output and this document, this conflict is
raised), the confidence gate, and the JUDGE citation rule (a finding with no citation must
not survive).

The **register eval** is separate and is not part of CI, because it makes real calls to
Shisa and costs money. It runs the fixture intents through all four registers and checks
that the output is actually distinct at each level — that 敬語 is not 丁寧 with a longer
verb — and that the gloss describes a change that really happened.

```bash
pnpm eval          # requires SHISA_API_KEY; makes real inference calls
```

Register quality is not a unit-testable property. The eval is a graded check with a
human reading the diff, not a pass/fail gate.

---

## Status

v0, demo quality.

- Three document types: `school_notice`, `ward_tax_letter`, `lease_clause`. Anything else
  classifies as `unknown` and routes to summary-only. `unknown` is a correct outcome, not
  a failure.
- Output language is English. `DecodeRequest.outputLang` is BCP-47 and threaded through
  so that adding a language is not a rewrite, but only `"en"` is exercised.
- Nothing is persisted. No accounts, no history, no re-opening yesterday's document.
- JUDGE covers a small hand-curated slice of the MLIT guidance, not the whole corpus. A
  clause outside that slice returns `not_addressed`, which is the honest answer.
- The paid tier is not wired to payment. Every layer is on for everyone.

---

## License

MIT. See [LICENSE](LICENSE).
