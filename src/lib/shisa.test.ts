import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REGISTERS, type RegisterId, type ReplyEvent, type VisionResult } from "@/lib/types";
import {
  createShisaClient, generateActionCard, streamRegisters, stripMetaCommentary,
} from "@/lib/shisa";

/* ---------------------------- fixtures ---------------------------- */

const GOOD_ENV = {
  SHISA_BASE_URL: "https://api.shisa.ai/openai/v1",
  SHISA_API_KEY: "sk-test",
  SHISA_MODEL: "shisa-ai/shisa-v2.1-llama3.3-70b",
};

const utf8 = (s: string) => new TextEncoder().encode(s);
const DONE = "data: [DONE]\n\n";

/** One OpenAI streaming chunk, wire-formatted. */
const sse = (c: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`;

/** Full SSE body for one register: message, delimiter, gloss. */
const body = (textJa: string, gloss: string) =>
  sse(textJa) + sse("\n---GLOSS---\n") + sse(gloss) + DONE;

// A Response-shaped stub over a raw ReadableStream. Not a real Response:
// undici may re-chunk its body, and these tests pin exact byte boundaries.
const stream = (start: (c: ReadableStreamDefaultController<Uint8Array>) => void) =>
  ({ ok: true, status: 200, body: new ReadableStream<Uint8Array>({ start }) }) as unknown as Response;

const streamRes = (chunks: Uint8Array[]) =>
  stream((c) => {
    chunks.forEach((chunk) => c.enqueue(chunk));
    c.close();
  });

const errorRes = (status: number, text: string) =>
  ({ ok: false, status, text: () => Promise.resolve(text) }) as unknown as Response;

/** Which register a captured request belongs to. */
const registerOf = (init: RequestInit | undefined): RegisterId => {
  const raw = String(init?.body ?? "");
  const hit = REGISTERS.find((r) => raw.includes(`REGISTER: ${r.id}`));
  if (!hit) throw new Error(`no register marker in body: ${raw.slice(0, 120)}`);
  return hit.id;
};


const REQ = {
  intent: "Tell them my son will be absent on the 5th.",
  recipient: "my son's homeroom teacher",
  docType: "school_notice" as const,
  documentSummary: "Excursion notice, reply slip due 2026-09-05.",
};

const collect = () => {
  const events: ReplyEvent[] = [];
  return { events, onEvent: (e: ReplyEvent) => void events.push(e) };
};



const textFor = (events: ReplyEvent[], register: RegisterId) =>
  events.map((e) => (e.type === "delta" && e.register === register ? e.text : "")).join("");

const stubFetch = (fn: (...a: [string, RequestInit | undefined]) => Promise<Response>) => {
  const mock = vi.fn(fn);
  vi.stubGlobal("fetch", mock);
  return mock;
};

/** Serve one whole SSE body per register, in a single chunk. */
const stubBody = (make: (id: RegisterId) => string) =>
  stubFetch((_u, init) => Promise.resolve(streamRes([utf8(make(registerOf(init)))])));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ------- 1. Model allowlist — the Japan-hosting guarantee ---------- */

describe("createShisaClient", () => {
  it("accepts a shisa-ai/ model", () => {
    expect(createShisaClient(GOOD_ENV).model).toBe("shisa-ai/shisa-v2.1-llama3.3-70b");
  });

  it("strips a trailing slash off the base URL", () => {
    const c = createShisaClient({ ...GOOD_ENV, SHISA_BASE_URL: "https://x/openai/v1/" });
    expect(c.baseUrl).toBe("https://x/openai/v1");
  });

  // The same gateway serves glm-* and qwen*, which are not Japan-hosted. A
  // misconfigured env var must not be able to route a lease PDF off-shore.
  // "shisa-ai" must be a whole path segment: the last two are near-misses.
  it.each(["glm-5.2", "qwen3.7-max", "qwen3.7-flash", "shisa-ai-evil/x", "not-shisa-ai/x"])(
    "refuses to construct for non-Japan-hosted model %s",
    (model) => {
      const construct = () => createShisaClient({ ...GOOD_ENV, SHISA_MODEL: model });
      expect(construct).toThrow(/shisa-ai\//);
      expect(construct).toThrow(model); // named, so a bad deploy is diagnosable
    },
  );

  // A missing model must throw, never let the gateway pick a default.
  it.each([
    ["SHISA_API_KEY", { SHISA_API_KEY: "" }],
    ["SHISA_BASE_URL", { SHISA_BASE_URL: undefined }],
    ["SHISA_MODEL", { SHISA_MODEL: undefined }],
  ])("throws an actionable error naming %s", (key, patch) => {
    expect(() => createShisaClient({ ...GOOD_ENV, ...patch })).toThrow(new RegExp(key));
  });
});

/* ---------------------- 2. stripMetaCommentary -------------------- */

const LETTER = "拝啓\n\n時下ますますご清栄のこととお慶び申し上げます。\n\n敬具";
const KEPT = ["欠席します。\n\n（9月5日）", "件名は Excursion Notice です。\n\nよろしくお願いします。"];

describe("stripMetaCommentary", () => {
  it.each<[string, string, string]>([
    [
      "the exact trailer observed live",
      '「本日はご連絡ありがとうございます。」\n\n（Polite version for a teacher: "..." )\n\n' +
        "※ If you need further adjustments (e.g., more formal or casual), let me know!",
      "「本日はご連絡ありがとうございます。」",
    ],
    [
      // Observed live on 敬語: a --- rule and a bold header before the letter.
      "the markdown scaffolding observed live",
      "---  \n**Japanese Message:**  \n拝啓  \n本文でございます。  \n\n---  \n**GLOSS:**  \n" +
        "This uses 尊敬語 for the reader.  \n\n---",
      "拝啓  \n本文でございます。",
    ],
    ["a clean formal letter", LETTER, LETTER],
    ["a Japanese parenthetical with real content", KEPT[0], KEPT[0]],
    ["English quoted inside the message", KEPT[1], KEPT[1]],
    [
      "a bare ※ note with no blank line before it",
      "よろしくお願いします。\n※ Let me know if you want it softer.",
      "よろしくお願いします。",
    ],
    ["output that is only commentary", "Sure! Here is the polite version:", ""],
  ])("handles %s", (_name, input, expected) => {
    expect(stripMetaCommentary(input)).toBe(expected);
  });
});

/* ---- 3. streamRegisters — SSE parsing and fault isolation --------- */

describe("streamRegisters", () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries(GOOD_ENV)) vi.stubEnv(k, v);
  });

  it("survives a chunk boundary that splits a multibyte UTF-8 character", async () => {
    const message = "予定を確認いたします。";
    stubFetch((_u, init) => {
      const bytes = utf8(body(message, `gloss for ${registerOf(init)}`));
      // Cut inside the 3-byte sequence for 予. A non-streaming decode here
      // yields U+FFFD and the demo shows mojibake.
      const cut = bytes.findIndex((b) => b > 0x7f) + 1;
      expect(cut).toBeGreaterThan(0);
      return Promise.resolve(streamRes([bytes.slice(0, cut), bytes.slice(cut)]));
    });

    const { events, onEvent } = collect();
    await streamRegisters(REQ, onEvent);

    for (const r of REGISTERS) expect(textFor(events, r.id)).toBe(message);
    expect(events.filter((e) => e.type === "done")).toHaveLength(4);
  });

  it("handles a data: line split across two reads", async () => {
    const message = "承知いたしました。";
    const full = body(message, "gloss");
    const bytes = utf8(full);
    const cut = full.indexOf('"delta"'); // mid-JSON, mid-line
    expect(cut).toBeGreaterThan(0);
    stubFetch(() => Promise.resolve(streamRes([bytes.slice(0, cut), bytes.slice(cut)])));

    const { events, onEvent } = collect();
    await streamRegisters(REQ, onEvent);
    for (const r of REGISTERS) expect(textFor(events, r.id)).toBe(message);
  });

  it("emits gloss then done per register", async () => {
    stubBody((id) => body("本文です。", `why ${id} fits`));

    const { events, onEvent } = collect();
    await streamRegisters(REQ, onEvent);

    for (const r of REGISTERS) {
      const seq = events.filter((e) => e.register === r.id).map((e) => e.type);
      expect(seq.slice(-2)).toEqual(["gloss", "done"]);
      const g = { type: "gloss", register: r.id, glossEn: `why ${r.id} fits` };
      expect(events).toContainEqual(g);
    }
  });

  it("never leaks the delimiter into textJa when it splits across chunks", async () => {
    const chunks = [
      utf8(sse("お世話になっております。") + sse("\n---GLO")),
      utf8(sse("SS---\n") + sse("plain form") + DONE),
    ];
    stubFetch(() => Promise.resolve(streamRes(chunks)));

    const { events, onEvent } = collect();
    await streamRegisters(REQ, onEvent);
    for (const r of REGISTERS) {
      expect(textFor(events, r.id)).toBe("お世話になっております。");
      expect(textFor(events, r.id)).not.toContain("-");
    }
  });

  it("strips trailing meta-commentary out of the live stream", async () => {
    stubBody(
      () =>
        sse("よろしくお願いいたします。") +
        sse("\n\n※ If you need further adjustments, let me know!") +
        sse("\n---GLOSS---\nds/ms form") +
        DONE,
    );

    const { events, onEvent } = collect();
    await streamRegisters(REQ, onEvent);
    for (const r of REGISTERS) expect(textFor(events, r.id)).toBe("よろしくお願いいたします。");
  });

  it("ignores keep-alives and malformed chunks instead of failing the register", async () => {
    stubBody(
      () =>
        ": keep-alive\n\ndata: {not json}\n\n" +
        sse("了解です。") +
        'data: {"choices":[]}\n\n' +
        sse("\n---GLOSS---\nplain form") +
        "data:[DONE]\n\n", // no space after the colon
    );

    const { events, onEvent } = collect();
    await streamRegisters(REQ, onEvent);
    expect(events.filter((e) => e.type === "error")).toHaveLength(0);
    for (const r of REGISTERS) expect(textFor(events, r.id)).toBe("了解です。");
  });

  it("one register failing does not abort the other three", async () => {
    stubFetch((_u, init) => {
      const id = registerOf(init);
      const res = id === "keigo" ? errorRes(503, "boom") : streamRes([utf8(body("本文。", "g"))]);
      return Promise.resolve(res);
    });

    const { events, onEvent } = collect();
    await expect(streamRegisters(REQ, onEvent)).resolves.toBeUndefined();

    const errs = events.filter((e) => e.type === "error");
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ type: "error", register: "keigo" });
    const done = events.filter((e) => e.type === "done").map((e) => e.register);
    expect(done.sort()).toEqual(["casual", "formal", "polite"]);
    for (const id of ["casual", "polite", "formal"] as const) {
      expect(textFor(events, id)).toBe("本文。");
    }
  });

  it("isolates a mid-stream network fault to its own register", async () => {
    const broken = stream((c) => {
      c.enqueue(utf8(sse("拝啓")));
      c.error(new Error("socket hang up"));
    });
    stubFetch((_u, init) =>
      Promise.resolve(
        registerOf(init) === "formal" ? broken : streamRes([utf8(body("本文。", "g"))]),
      ),
    );

    const { events, onEvent } = collect();
    await streamRegisters(REQ, onEvent);
    expect(events.filter((e) => e.type === "error").map((e) => e.register)).toEqual(["formal"]);
    expect(events.filter((e) => e.type === "done")).toHaveLength(3);
  });

  it("fires all four registers concurrently, not one after another", async () => {
    let inFlight = 0;
    let peak = 0;
    stubFetch(async (_u, init) => {
      registerOf(init);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return streamRes([utf8(body("本文。", "g"))]);
    });

    await streamRegisters(REQ, collect().onEvent);
    expect(peak).toBe(4);
  });

  // Observed live: the model substituted "**GLOSS:**" for the delimiter and
  // wrapped the letter in markdown, losing the gloss. The split after "GLOSS"
  // is the second half of that bug — the delimiter's tail led the gloss.
  it("recovers the gloss when the model decorates the delimiter", async () => {
    stubBody(
      () =>
        sse("---\n**Japanese Message:**\n拝啓\n本文でございます。\n\n---\n**GLOSS") +
        sse(":**\nuses 尊敬語 for the reader's actions") +
        DONE,
    );

    const { events, onEvent } = collect();
    await streamRegisters(REQ, onEvent);
    for (const r of REGISTERS) {
      expect(textFor(events, r.id)).toBe("拝啓\n本文でございます。");
      expect(events).toContainEqual({
        type: "gloss",
        register: r.id,
        glossEn: "uses 尊敬語 for the reader's actions",
      });
    }
  });

  it("omits the gloss event entirely when the model never produced one", async () => {
    stubBody(() => sse("承知しました。") + DONE);
    const { events, onEvent } = collect();
    await streamRegisters(REQ, onEvent);
    expect(events.filter((e) => e.type === "gloss")).toHaveLength(0);
    expect(events.filter((e) => e.type === "done")).toHaveLength(4);
  });

  it("rejects on a bad model before any request is made", async () => {
    vi.stubEnv("SHISA_MODEL", "glm-5.2");
    const fetchMock = stubFetch(() => Promise.resolve(streamRes([])));
    await expect(streamRegisters(REQ, collect().onEvent)).rejects.toThrow(/shisa-ai\//);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/* ---------------------- 4. generateActionCard --------------------- */

const VISION: VisionResult = {
  docType: "school_notice",
  confidence: 0.91,
  titleJa: "遠足のお知らせ",
  rawText: "遠足のお知らせ … 令和8年9月5日までに提出してください。3,200円",
  issuer: "港区立青山小学校",
  dates: [{ iso: "2026-09-05", raw: "令和8年9月5日", label: "提出期限" }],
  amounts: [{ yen: 3200, raw: "3,200円", label: "参加費" }],
  obligations: [{ action: "Return the slip.", dueDate: null, amount: null, conflict: null }],
};

describe("generateActionCard", () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries(GOOD_ENV)) vi.stubEnv(k, v);
  });

  const stubJson = (content: string) =>
    stubFetch(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ choices: [{ message: { content } }] }),
      } as unknown as Response),
    );

  it("returns the two user-facing strings", async () => {
    stubJson('{"whatThisIs":"School excursion notice","summary":"A class trip."}');
    const card = await generateActionCard(VISION, VISION.obligations, "en");
    expect(card).toEqual({ whatThisIs: "School excursion notice", summary: "A class trip." });
  });

  it("tolerates a fenced reply with a ※ trailer", async () => {
    stubJson('Sure:\n```json\n{"whatThisIs":"Ward tax letter","summary":"A bill."}\n```\n※ ok?');
    const card = await generateActionCard(VISION, VISION.obligations, "en");
    expect(card).toEqual({ whatThisIs: "Ward tax letter", summary: "A bill." });
  });

  it("does not stream, and passes the extracted facts through verbatim", async () => {
    const fetchMock = stubJson('{"whatThisIs":"x","summary":"y"}');
    await generateActionCard(VISION, VISION.obligations, "en");

    const sent = String(fetchMock.mock.calls[0][1]?.body);
    expect(JSON.parse(sent).stream).toBe(false);
    expect(sent).toContain("令和8年9月5日"); // the model describes, never re-derives
    expect(sent).toContain("3,200");
  });

  it("throws on an unusable reply rather than inventing a card", async () => {
    stubJson("no json at all");
    await expect(generateActionCard(VISION, VISION.obligations, "en")).rejects.toThrow();
  });

  it("surfaces an HTTP failure", async () => {
    stubFetch(() => Promise.resolve(errorRes(401, "bad key")));
    await expect(generateActionCard(VISION, VISION.obligations, "en")).rejects.toThrow(/401/);
  });
});
