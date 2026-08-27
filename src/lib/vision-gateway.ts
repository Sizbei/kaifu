/**
 * Vision via the Shisa gateway (OpenAI-compatible chat/completions).
 *
 * The gateway fronts Qwen multimodal models (qwen3.7-plus, qwen3.7-flash)
 * that accept image_url parts. These are NOT the Japan-hosted shisa-ai/*
 * models — they are the vision fallback when OpenAI is unavailable, and the
 * seam still holds: the model returns structured JSON only, and Shisa proper
 * still writes every word the user reads. This module deliberately does not
 * use createShisaClient(): that constructor enforces the shisa-ai/ allowlist
 * for GENERATION, and vision must neither widen that allowlist nor be
 * blocked by it.
 */

import { withRateLimitRetry } from "@/lib/backoff";
import { VisionResultSchema, type VisionResult } from "@/lib/types";
import {
  VISION_FORMAT,
  VISION_SYSTEM_PROMPT,
  VisionConfigError,
  VisionResponseError,
  VisionSchemaError,
} from "@/lib/vision-schema";

/**
 * Measured live on the sample set: qwen3.7-plus and qwen3.7-flash extract
 * the same dates/amounts/obligations, and flash answers in a third of the
 * time (11 s vs 29 s on the school notice). The route has 60 s for vision,
 * card and judge in sequence, so latency decides. Override via
 * SHISA_VISION_MODEL or `opts.model`.
 */
export const DEFAULT_GATEWAY_VISION_MODEL = "qwen3.7-flash";

/** Dense notice transcribed verbatim, plus the JSON scaffolding around it. */
const MAX_TOKENS = 8000;
const REQUEST_TIMEOUT_MS = 50_000;

/**
 * Observed live: without this the Qwen models tend to normalise `raw` to
 * ISO ("2026-09-18") or drop the weekday ("9月18日" for "9月18日（金）"),
 * and crossCheck then flags every obligation. Appended to the shared prompt
 * so the shared wording that vision.test.ts guards stays untouched.
 */
export const GATEWAY_PROMPT_ADDENDUM = `
OUTPUT FORMAT
Return exactly one JSON object with these keys and no others: docType, confidence, titleJa, rawText, issuer, dates, amounts, obligations. Each date is {"iso","raw","label"}; each amount is {"yen","raw","label"}; each obligation is {"action","dueDate","amount"} where dueDate/amount are a date/amount object or null. No markdown fences, no text before or after the object.

VERBATIM RULE FOR raw (critical)
"raw" must be a character-for-character copy of the substring in rawText that the date or amount came from, including the weekday in parentheses, full-width digits, era names, and the 円/¥ symbol. Examples: "9月18日（金）" not "9月18日" and not "2026-09-18"; "令和8年9月1日" not "2026年9月1日"; "1,200円" not "1200". If the page prints only month and day, raw is only month and day. The ISO form goes in "iso" and nowhere else. An obligation's dueDate and amount must reuse the same raw strings as the matching entries in dates and amounts.

Only calendar dates printed on the page count as dates. A relative deadline such as 請求を受けた日から14日以内 or 当日午前7時30分まで is not a date: do not put it in dates and leave that obligation's dueDate null.`;

/* ------------------------------------------------------------------ *
 * Response-format fallback chain. Not every gateway model accepts strict
 * json_schema; some accept only json_object; some accept neither. A 400
 * moves to the next rung. Anything else is returned to the caller as-is.
 * ------------------------------------------------------------------ */

type ResponseFormat =
  | { type: "json_schema"; json_schema: { name: string; schema: unknown; strict: true } }
  | { type: "json_object" }
  | null;

const FORMAT_CHAIN: readonly ResponseFormat[] = [
  {
    type: "json_schema",
    json_schema: { name: VISION_FORMAT.name, schema: VISION_FORMAT.schema, strict: true },
  },
  { type: "json_object" },
  null,
];

export interface GatewayConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
}

type Env = Readonly<Record<string, string | undefined>>;

export function gatewayConfig(env: Env = process.env, modelOverride?: string): GatewayConfig {
  const baseUrl = env.SHISA_BASE_URL?.trim();
  const apiKey = env.SHISA_API_KEY?.trim();
  if (!baseUrl || !apiKey) {
    throw new VisionConfigError(
      "VISION_PROVIDER=shisa-gateway needs SHISA_BASE_URL and SHISA_API_KEY in the server environment (e.g. .env.local).",
    );
  }
  const model = modelOverride ?? env.SHISA_VISION_MODEL?.trim() ?? DEFAULT_GATEWAY_VISION_MODEL;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, model };
}

/** The route sends JPEG; the sample scans are PNG. Sniff rather than assume. */
export function imageMime(base64: string): string {
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("UklGR")) return "image/webp";
  return "image/jpeg";
}

function requestBody(cfg: GatewayConfig, imageBase64: string, format: ResponseFormat): string {
  return JSON.stringify({
    model: cfg.model,
    temperature: 0,
    max_tokens: MAX_TOKENS,
    // Qwen defaults to thinking mode on this gateway: 30-50 s of
    // reasoning_content that also eats max_tokens. Observed live. OCR is
    // transcription, not reasoning; off is both faster and more complete.
    enable_thinking: false,
    ...(format ? { response_format: format } : {}),
    messages: [
      { role: "system", content: VISION_SYSTEM_PROMPT + GATEWAY_PROMPT_ADDENDUM },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${imageMime(imageBase64)};base64,${imageBase64}`, detail: "high" },
          },
          { type: "text", text: "Record this document as a single JSON object." },
        ],
      },
    ],
  });
}

async function postOnce(
  cfg: GatewayConfig,
  imageBase64: string,
  format: ResponseFormat,
  signal: AbortSignal,
): Promise<Response> {
  return withRateLimitRetry(
    () =>
      fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.apiKey}`,
          Accept: "application/json",
        },
        body: requestBody(cfg, imageBase64, format),
        signal,
      }),
    signal,
  );
}

/** Walks the format chain; resolves with the first non-400 response. */
async function postWithFormatFallback(
  cfg: GatewayConfig,
  imageBase64: string,
  signal: AbortSignal,
): Promise<Response> {
  let last: Response | undefined;
  for (const format of FORMAT_CHAIN) {
    last = await postOnce(cfg, imageBase64, format, signal);
    if (last.status !== 400) return last;
  }
  return last as Response;
}

/* ------------------------------------------------------------------ *
 * Content → VisionResult.
 * ------------------------------------------------------------------ */

/** First {...} object in content that may carry ``` fences or chatter. */
export function extractJsonObject(content: string): unknown {
  const unfenced = content.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new VisionResponseError(
      `The gateway model returned no JSON object: ${content.slice(0, 200)}`,
    );
  }
  try {
    return JSON.parse(unfenced.slice(start, end + 1));
  } catch (cause) {
    throw new VisionResponseError("The gateway model's JSON does not parse.", { cause });
  }
}

/**
 * The model must not be able to assert a conflict — crossCheck computes it.
 * Without strict schema enforcement on the gateway, strip it before parse so
 * Zod's `.default(null)` fills it in, exactly as on the OpenAI path.
 */
export function stripConflicts(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { obligations?: unknown }).obligations)) {
    return parsed;
  }
  const { obligations, ...rest } = parsed as { obligations: unknown[] };
  return {
    ...rest,
    obligations: obligations.map((ob) => {
      if (!ob || typeof ob !== "object") return ob;
      const keep = { ...(ob as Record<string, unknown>) };
      delete keep.conflict;
      return keep;
    }),
  };
}

/** A printed calendar date: N月N日 (either digit width) or a 4-digit year. */
const CALENDAR_DATE = /[0-9０-９]+\s*月\s*[0-9０-９]+\s*日|\d{4}[-/年]/;

/**
 * Observed live even with the prompt forbidding it: Qwen turns a relative
 * deadline (請求を受けた日から14日以内, 当日午前7時30分まで) into a dueDate
 * with an invented ISO, which crossCheck then flags. A deadline that is not
 * a date on the page is nulled: no answer beats a wrong one.
 */
export function dropRelativeDueDates(result: VisionResult): VisionResult {
  return {
    ...result,
    obligations: result.obligations.map((ob) =>
      ob.dueDate && !CALENDAR_DATE.test(ob.dueDate.raw) ? { ...ob, dueDate: null } : ob,
    ),
  };
}

export function parseGatewayContent(content: string): VisionResult {
  const parsed = stripConflicts(extractJsonObject(content));
  try {
    return dropRelativeDueDates(VisionResultSchema.parse(parsed));
  } catch (cause) {
    throw new VisionSchemaError(
      "The gateway vision model returned JSON that does not satisfy VisionResultSchema.",
      { cause },
    );
  }
}

/* ------------------------------------------------------------------ *
 * Entry point.
 * ------------------------------------------------------------------ */

export async function analyzeViaGateway(
  imageBase64: string,
  opts: { model?: string } = {},
): Promise<VisionResult> {
  const cfg = gatewayConfig(process.env, opts.model);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("gateway vision timeout")), REQUEST_TIMEOUT_MS);

  try {
    const res = await postWithFormatFallback(cfg, imageBase64, controller.signal);
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new VisionResponseError(
        `Gateway vision request failed: ${res.status} ${detail.slice(0, 300)}`,
      );
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new VisionResponseError(
        `The gateway model (${cfg.model}) returned empty content — is it multimodal?`,
      );
    }
    return parseGatewayContent(content);
  } finally {
    clearTimeout(timer);
  }
}
