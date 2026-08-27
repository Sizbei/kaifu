/**
 * DECODE: image → ActionCard. Orchestration only — every decision lives
 * in a lib module with its own tests. The order here is the product:
 * see what's on the page, check the model against the page, decide
 * whether to trust it, then and only then write for the user.
 */

import { NextResponse } from "next/server";
import { analyzeDocument, VisionConfigError } from "@/lib/vision";
import { crossCheck } from "@/lib/extract";
import { judgeClause } from "@/lib/judge";
import { completeWithShisa } from "@/lib/complete";
import { generateActionCard } from "@/lib/shisa";
import { clauseStats, recordDecode, wardFromIssuer, type ClauseStats } from "@/lib/graph";
import { findEntryByCitation } from "@/lib/groundtruth";
import {
  CONFIDENCE_THRESHOLD,
  type ActionCard,
  type DecodeRequest,
  type DecodeResponse,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** ~1568px-long-edge JPEG at q0.85 is well under this; anything larger is not a phone photo of a page. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

function isDecodeRequest(body: unknown): body is DecodeRequest {
  return (
    typeof body === "object" &&
    body !== null &&
    typeof (body as DecodeRequest).imageBase64 === "string" &&
    typeof (body as DecodeRequest).outputLang === "string"
  );
}

/**
 * `contribute` is the corpus-graph opt-in. DecodeRequest is frozen, so it is
 * read off the raw body here. Anything but a literal `true` means no.
 */
function wantsContribution(body: unknown): boolean {
  return typeof body === "object" && body !== null && (body as { contribute?: unknown }).contribute === true;
}

/** "YYYY-MM" of now: the coarsest useful timestamp for a corpus row. */
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Corpus benchmark for a lease: per cited clause type, how the rest of the
 * corpus sits against the same guideline. Null when the graph is off.
 */
async function benchmarkFor(card: ActionCard): Promise<Record<string, ClauseStats> | null> {
  if (card.docType !== "lease_clause" || card.findings.length === 0) return null;
  const ids = [...new Set(card.findings.flatMap((f) => findEntryByCitation(f.citation)?.id ?? []))];
  const stats = await Promise.all(ids.map((id) => clauseStats(id)));
  const present = ids.flatMap((id, i) => {
    const s = stats[i];
    return s ? [[id, s] as [string, ClauseStats]] : [];
  });
  return present.length ? Object.fromEntries(present) : null;
}

/**
 * A failure upstream is not a failure of the photo. Only the vision
 * model's own rejection earns the photo hint.
 */
function describeFailure(err: unknown): string {
  if (err instanceof VisionConfigError) return "Server is missing its vision API key.";
  const status = (err as { status?: unknown } | null)?.status;
  const message = err instanceof Error ? err.message : String(err);
  if (status === 429 || /credits|quota/i.test(message)) {
    return "Vision service is out of credits — try the demo mode.";
  }
  if (/shisa/i.test(message)) return "Reply service is busy — try again in a moment.";
  return "Could not read this document. Try a flatter, better-lit photo.";
}

export async function POST(req: Request): Promise<NextResponse<DecodeResponse>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be JSON." }, { status: 400 });
  }
  if (!isDecodeRequest(body)) {
    return NextResponse.json({ ok: false, error: "Expected { imageBase64, outputLang }." }, { status: 400 });
  }
  // base64 inflates by 4/3; check the decoded size.
  if ((body.imageBase64.length * 3) / 4 > MAX_IMAGE_BYTES) {
    return NextResponse.json({ ok: false, error: "Image too large. Retake at a lower resolution." }, { status: 413 });
  }

  try {
    // 1. What is on the page. Structured JSON only.
    const vision = await analyzeDocument(body.imageBase64);

    // 2. The model against the page. Disagreements come back flagged, never resolved.
    const checked = crossCheck(vision);

    // 3. Below threshold we do not trust obligations at all. Better a summary than a wrong deadline.
    const summaryOnly = vision.confidence < CONFIDENCE_THRESHOLD || vision.docType === "unknown";
    const obligations = summaryOnly ? [] : checked;

    // 4. Card text and (for leases) findings are independent; run them together.
    const [text, findings] = await Promise.all([
      generateActionCard(vision, obligations, body.outputLang),
      summaryOnly
        ? Promise.resolve([])
        : // A lease card without findings beats a 502 with a photo hint.
          judgeClause(vision, body.outputLang, completeWithShisa).catch((e: unknown) => {
            console.warn("[decode] judge failed", e);
            return [];
          }),
    ]);

    const card: ActionCard = {
      docType: vision.docType,
      whatThisIs: text.whatThisIs,
      titleJa: vision.titleJa,
      issuer: vision.issuer,
      summary: text.summary,
      obligations,
      summaryOnly,
      findings,
    };

    // Opt-in only. Fire-and-forget: the user's card never waits on the sidecar.
    if (wantsContribution(body)) {
      recordDecode(card, {
        ward: wardFromIssuer(vision.issuer, vision.docType),
        issuedMonth: currentMonth(),
        confidence: vision.confidence,
      }).catch((err: unknown) => console.warn("[decode] corpus write failed", err));
    }

    // ActionCard is frozen, so the benchmark rides in a header rather than on the card.
    const benchmark = await benchmarkFor(card);
    const headers = benchmark ? { "X-Kaifu-Benchmark": JSON.stringify(benchmark) } : undefined;
    return NextResponse.json({ ok: true, card }, { headers });
  } catch (err) {
    // Upstream detail goes to the server log; the user gets a remedy.
    console.error("[decode]", err);
    return NextResponse.json({ ok: false, error: describeFailure(err) }, { status: 502 });
  }
}
