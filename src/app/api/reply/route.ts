/**
 * REPLY: intent → four registers, streamed together as NDJSON.
 * One line per ReplyEvent. The registers interleave freely; the client
 * buffers per register. Nothing here is Japanese-aware — that is all
 * in shisa.ts and prompts.ts.
 */

import { streamRegisters } from "@/lib/shisa";
import type { ReplyEvent, ReplyRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_INTENT_CHARS = 1000;

function isReplyRequest(body: unknown): body is ReplyRequest {
  const b = body as Partial<ReplyRequest> | null;
  return (
    typeof b === "object" &&
    b !== null &&
    typeof b.intent === "string" &&
    b.intent.trim().length > 0 &&
    b.intent.length <= MAX_INTENT_CHARS &&
    typeof b.recipient === "string" &&
    typeof b.docType === "string" &&
    typeof b.documentSummary === "string"
  );
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Request body must be JSON.", { status: 400 });
  }
  if (!isReplyRequest(body)) {
    return new Response("Expected { intent, recipient, docType, documentSummary }.", { status: 400 });
  }
  const request = body;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ReplyEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        // streamRegisters never rejects for a single register's failure —
        // that arrives as an error event and the other three keep going.
        await streamRegisters(request, send, req.signal);
      } catch (err) {
        console.error("[reply]", err);
        // Config-level failure (bad model, missing key): tell every stop.
        for (const r of ["casual", "polite", "keigo", "formal"] as const) {
          send({ type: "error", register: r, message: "Reply service unavailable." });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Keep proxies from buffering the whole stream before forwarding.
      "X-Accel-Buffering": "no",
    },
  });
}
