/**
 * Shisa client — every word of Japanese KAIFŪ produces comes from here.
 *
 * OpenAI-compatible over plain fetch. No SDK: we need exactly two shapes, a
 * chat completion and its SSE stream, and owning the parser is what lets us
 * hold back a half-decoded multibyte character instead of shipping mojibake.
 */

import { z } from "zod";

import {
  actionCardSystemPrompt,
  actionCardUserPrompt,
  GLOSS_DELIMITER,
  registerSystemPrompt,
  registerUserPrompt,
} from "@/lib/prompts";
import {
  REGISTERS,
  type ActionCard,
  type Obligation,
  type RegisterId,
  type ReplyEvent,
  type ReplyRequest,
  type VisionResult,
} from "@/lib/types";

/* ------------------------------------------------------------------ *
 * Client construction — the Japan-hosting guarantee lives here.
 *
 * The gateway serving Shisa also serves glm-* and qwen*, which are not
 * hosted in Japan. These documents carry names, addresses, salaries and
 * visa status, and "Japan-hosted inference" is a promise we make. A typo in
 * SHISA_MODEL must be a crash, never a quietly re-routed lease PDF.
 * ------------------------------------------------------------------ */

const JAPAN_HOSTED_MODEL = /^shisa-ai\//;

export interface ShisaClient {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
}

type Env = Readonly<Record<string, string | undefined>>;

function required(env: Env, key: string, hint: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is not set. ${hint}`);
  return value;
}


export function createShisaClient(env: Env = process.env): ShisaClient {
  const baseUrl = required(
    env,
    "SHISA_BASE_URL",
    "Expected https://api.shisa.ai/openai/v1 — note the /openai segment; a bare /v1 returns 404.",
  );
  const apiKey = required(env, "SHISA_API_KEY", "Add it to .env.local; never sent to the browser.");
  const model = required(env, "SHISA_MODEL", "Expected e.g. shisa-ai/shisa-v2.1-llama3.3-70b.");

  if (!JAPAN_HOSTED_MODEL.test(model)) {
    throw new Error(
      `SHISA_MODEL="${model}" is refused: KAIFŪ only calls models matching shisa-ai/ ` +
        `because the same gateway also serves non-Japan-hosted models (glm-*, qwen*), ` +
        `and this pipeline processes names, addresses, salaries and visa status. ` +
        `Set SHISA_MODEL to a shisa-ai/ model.`,
    );
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, model };
}

/* ------------------------------------------------------------------ *
 * Transport.
 * ------------------------------------------------------------------ */

interface ChatBody {
  readonly messages: readonly { readonly role: "system" | "user"; readonly content: string }[];
  readonly stream: boolean;
  readonly temperature: number;
  readonly max_tokens: number;
}

async function postChat(
  client: ShisaClient,
  body: ChatBody,
  signal?: AbortSignal,
): Promise<Response> {
  const res = await fetch(`${client.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${client.apiKey}`,
      Accept: body.stream ? "text/event-stream" : "application/json",
    },
    body: JSON.stringify({ model: client.model, ...body }),
    signal,
  });

  if (!res.ok) {
    // Upstream diagnostics, not user-facing: the route maps this to a
    // generic message before it reaches the browser.
    const detail = await res.text().catch(() => "");
    throw new Error(`Shisa request failed: ${res.status} ${detail.slice(0, 300)}`);
  }
  return res;
}

/* ------------------------------------------------------------------ *
 * SSE parsing. Two hazards, both of which corrupt Japanese specifically:
 * a chunk boundary inside a multibyte sequence (TextDecoder streaming mode
 * holds the partial bytes rather than emitting U+FFFD), and a boundary
 * inside a `data:` line (we buffer until a newline before parsing).
 * ------------------------------------------------------------------ */

const DONE_SENTINEL = "[DONE]";

/** The payload of one `data:` line, or null for anything else. */
function dataPayload(line: string): string | null {
  const trimmed = line.replace(/\r$/, "");
  if (!trimmed.startsWith("data:")) return null; // comments, blank lines, event:
  const payload = trimmed.slice("data:".length).trim();
  return payload.length > 0 ? payload : null;
}

async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        buffer += decoder.decode(); // flush any dangling bytes
        for (const line of buffer.split("\n")) {
          const payload = dataPayload(line);
          if (payload === null) continue;
          if (payload === DONE_SENTINEL) return;
          yield payload;
        }
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      for (let nl = buffer.indexOf("\n"); nl !== -1; nl = buffer.indexOf("\n")) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        const payload = dataPayload(line);
        if (payload === null) continue;
        if (payload === DONE_SENTINEL) return;
        yield payload;
      }
    }
  } finally {
    // Covers early return on [DONE] as well as an abort unwinding the caller.
    void reader.cancel().catch(() => undefined);
  }
}

const StreamChunkSchema = z.object({
  choices: z
    .array(z.object({ delta: z.object({ content: z.string().nullish() }).optional() }))
    .optional(),
});

/** Content of one chunk, or "" for keep-alives, role-only deltas and junk. */
function chunkContent(payload: string): string {
  try {
    const parsed = StreamChunkSchema.safeParse(JSON.parse(payload));
    if (!parsed.success) return "";
    return parsed.data.choices?.[0]?.delta?.content ?? "";
  } catch {
    // A malformed chunk is not worth failing a register over.
    return "";
  }
}

/* ------------------------------------------------------------------ *
 * Meta-commentary stripping. Observed live: the model appends a bracketed
 * restatement and a ※ note offering further adjustments. All of it trails
 * the message, so we scan backwards and stop at the first real line.
 * ------------------------------------------------------------------ */

// Kana, not "any Japanese": the model's commentary quotes Japanese terms
// ("This uses 尊敬語 for the reader"), so a kanji test would keep it. Real
// prose always has kana; 拝啓 / 敬具 carry no Latin so never reach that rule.
const KANA = /[぀-ヿｦ-ﾟ]/;
const LATIN = /[A-Za-z]/;

/** Markdown the model wraps an answer in: "---", "**Japanese Message:**", "# H". */
const SCAFFOLD = /^(?:[-*_=]{2,}|#{1,6}\s|\*\*[^*]*\*\*[:：]?$)/;

function isNoiseLine(line: string): boolean {
  if (line.startsWith("※")) return true;
  if (SCAFFOLD.test(line)) return true;
  if (LATIN.test(line) && !KANA.test(line)) return true;
  // A mixed-script parenthetical gloss, e.g. （丁寧版: for a teacher）.
  return /^[（(]/.test(line) && LATIN.test(line);
}

export function stripMetaCommentary(s: string): string {
  const lines = s.split("\n");
  let tail = lines.length - 1;
  let head = 0;

  // Trailing: ※ notes, restatement parentheticals, English trailers.
  while (tail >= 0 && (lines[tail].trim() === "" || isNoiseLine(lines[tail].trim()))) tail--;
  // Leading: observed live on 敬語 — a "---" rule and a "**Japanese Message:**"
  // header before the actual letter. Blank lines never end either scan.
  while (head <= tail && (lines[head].trim() === "" || isNoiseLine(lines[head].trim()))) head++;

  return lines.slice(head, tail + 1).join("\n").trimEnd();
}

/* ------------------------------------------------------------------ *
 * The register engine.
 * ------------------------------------------------------------------ */

const REGISTER_TEMPERATURE = 0.55;
const REGISTER_MAX_TOKENS = 900;

/**
 * The gloss separator as the model actually writes it. Observed live: 敬語
 * came back with "**GLOSS:**" instead of the literal delimiter, which lost
 * the whole gloss. "GLOSS" cannot occur in Japanese prose, so anchoring on
 * the word and absorbing the decoration around it is the safe rule.
 */
const GLOSS_CUT = /[*_#\-\s]*GLOSS[*_#\-\s:：]*/;

/** Held back each pass so a split "---GLO" is never emitted as message text. */
const DELIMITER_HOLDBACK = GLOSS_DELIMITER.length - 1;

async function streamOne(
  client: ShisaClient,
  register: RegisterId,
  req: ReplyRequest,
  onEvent: (e: ReplyEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await postChat(
    client,
    {
      messages: [
        { role: "system", content: registerSystemPrompt(register) },
        { role: "user", content: registerUserPrompt(req) },
      ],
      stream: true,
      temperature: REGISTER_TEMPERATURE,
      max_tokens: REGISTER_MAX_TOKENS,
    },
    signal,
  );

  if (!res.body) throw new Error("Shisa returned no response body for streaming");

  // Local accumulators. They are confined to this call — nothing outside the
  // function can observe an intermediate state.
  let raw = ""; // message part seen so far, pre-cleaning
  let sent = 0; // characters of the CLEANED message already emitted
  let gloss = "";
  let inGloss = false;

  /** Emit whatever cleaning now agrees is safe to show. */
  const flush = (text: string): void => {
    const clean = stripMetaCommentary(text);
    if (clean.length <= sent) return; // cleaning retracted the tail; wait
    onEvent({ type: "delta", register, text: clean.slice(sent) });
    sent = clean.length;
  };

  for await (const payload of sseData(res.body)) {
    const delta = chunkContent(payload);
    if (delta === "") continue;

    if (inGloss) {
      gloss += delta;
      continue;
    }

    raw += delta;
    const cut = GLOSS_CUT.exec(raw);
    if (cut) {
      inGloss = true;
      gloss = raw.slice(cut.index + cut[0].length);
      raw = raw.slice(0, cut.index);
      flush(raw);
    } else {
      flush(raw.slice(0, Math.max(0, raw.length - DELIMITER_HOLDBACK)));
    }
  }

  if (!inGloss) flush(raw); // model never emitted the delimiter

  // The cut can land mid-delimiter ("…\n---GLOSS" arrives before "---\n"),
  // which leaves the delimiter's tail at the head of the gloss. Observed live.
  const glossEn = gloss.replace(/^[*_#\-\s:：]+/, "").split("\n")[0].trim();
  // No gloss event when the model skipped it: an empty teaching line in the
  // UI is worse than none, and `done` is the terminator either way.
  if (glossEn !== "") onEvent({ type: "gloss", register, glossEn });
  onEvent({ type: "done", register });
}

/**
 * Fire all four registers at once and stream them together.
 *
 * Independent completions on purpose: the slider reveals finished
 * renderings, so the wall clock is one generation, not four. Each register
 * owns its failure — one upstream 503 must not take the other three down,
 * because three working registers still demo the idea.
 *
 * Resolves once every register terminates. Rejects only for a misconfigured
 * client, which is raised before any request is made.
 */
export async function streamRegisters(
  req: ReplyRequest,
  onEvent: (e: ReplyEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const client = createShisaClient();

  await Promise.all(
    REGISTERS.map(async (spec) => {
      try {
        await streamOne(client, spec.id, req, onEvent, signal);
      } catch (err) {
        // A caller-initiated abort is not a register failure; the consumer
        // asked for the stream to stop and does not need four error events.
        if (signal?.aborted) return;
        onEvent({
          type: "error",
          register: spec.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );
}

/* ------------------------------------------------------------------ *
 * Action card text.
 * ------------------------------------------------------------------ */

const CompletionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});

const CardTextSchema = z.object({
  whatThisIs: z.string().min(1),
  summary: z.string().min(1),
});

/** First balanced-looking JSON object in a reply that may carry fences or chatter. */
function extractJsonObject(content: string): unknown {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error(`Shisa returned no JSON object: ${content.slice(0, 200)}`);
  }
  try {
    return JSON.parse(content.slice(start, end + 1));
  } catch {
    throw new Error(`Shisa returned unparseable JSON: ${content.slice(start, start + 200)}`);
  }
}

/**
 * Turn the structured extraction into the user-language header of the card.
 *
 * Non-streaming: two short strings, and the card cannot render until both
 * exist, so a stream would have nothing to reveal. A describer, never an
 * extractor — dates and amounts arrive already extracted and cross-checked.
 */
export async function generateActionCard(
  vision: VisionResult,
  obligations: Obligation[],
  outputLang: string,
): Promise<Pick<ActionCard, "whatThisIs" | "summary">> {
  const client = createShisaClient();

  const res = await postChat(client, {
    messages: [
      { role: "system", content: actionCardSystemPrompt(outputLang) },
      { role: "user", content: actionCardUserPrompt(vision, obligations) },
    ],
    stream: false,
    temperature: 0.2,
    max_tokens: 400,
  });

  const completion = CompletionSchema.parse(await res.json());
  const parsed = CardTextSchema.parse(extractJsonObject(completion.choices[0].message.content));

  return { whatThisIs: parsed.whatThisIs, summary: parsed.summary };
}
