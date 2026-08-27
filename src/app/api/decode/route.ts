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
      summaryOnly ? Promise.resolve([]) : judgeClause(vision, body.outputLang, completeWithShisa),
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
    return NextResponse.json({ ok: true, card });
  } catch (err) {
    // Upstream detail goes to the server log; the user gets a remedy.
    console.error("[decode]", err);
    const error =
      err instanceof VisionConfigError
        ? "Server is missing its vision API key."
        : "Could not read this document. Try a flatter, better-lit photo.";
    return NextResponse.json({ ok: false, error }, { status: 502 });
  }
}
