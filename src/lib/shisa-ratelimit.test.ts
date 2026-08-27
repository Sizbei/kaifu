import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RETRY_AFTER_DEFAULT_MS, delay, retryAfterMs } from "@/lib/backoff";
import { streamRegisters } from "@/lib/shisa";
import { REGISTERS, type ReplyEvent } from "@/lib/types";

/* ---------------------------- fixtures ---------------------------- */

const GOOD_ENV = {
  SHISA_BASE_URL: "https://api.shisa.ai/openai/v1",
  SHISA_API_KEY: "sk-test",
  SHISA_MODEL: "shisa-ai/shisa-v2.1-llama3.3-70b",
};

const REQ = {
  intent: "Tell them my son will be absent on the 5th.",
  recipient: "my son's homeroom teacher",
  docType: "school_notice" as const,
  documentSummary: "Excursion notice, reply slip due 2026-09-05.",
};

/** The exact 429 body observed live: an "auth" error carrying the wait in text. */
const LIMITER_BODY =
  '{"context":["authMiddleware"],"code":104,"name":"ErrAuthenticationFailed",' +
  '"error":"Authentication error: Too many requests. Retry after 12.5ms"}';

const sse = (c: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`;

const okRes = (text: string) =>
  ({
    ok: true,
    status: 200,
    headers: new Headers(),
    body: new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(sse(text) + sse("\n---GLOSS---\ng") + "data: [DONE]\n\n"));
        c.close();
      },
    }),
  }) as unknown as Response;

const rateLimited = (body = LIMITER_BODY, headers: Record<string, string> = {}) =>
  ({ ok: false, status: 429, headers: new Headers(headers), text: () => Promise.resolve(body) }) as unknown as Response;

const collect = () => {
  const events: ReplyEvent[] = [];
  return { events, onEvent: (e: ReplyEvent) => void events.push(e) };
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ------------------------------ parsing --------------------------- */

describe("retryAfterMs", () => {
  it.each<[string, number]>([
    ["Too many requests. Retry after 297.369003ms", 297.369003],
    ["Too many requests. Retry after 4.664162993s", 4664.162993],
    ["Retry after 1s", 1000],
    ["retry after 250 ms", 250],
  ])("parses the body text %s", (body, ms) => {
    expect(retryAfterMs(null, body)).toBeCloseTo(ms, 3);
  });

  it("prefers a Retry-After header in delay-seconds", () => {
    expect(retryAfterMs("2", LIMITER_BODY)).toBe(2000);
  });

  it("accepts a Retry-After header as an HTTP-date", () => {
    const now = Date.UTC(2026, 7, 27, 12, 0, 0);
    expect(retryAfterMs("Thu, 27 Aug 2026 12:00:03 GMT", "", now)).toBe(3000);
  });

  it("falls back to the default when nothing says how long", () => {
    expect(retryAfterMs(null, "nope")).toBe(RETRY_AFTER_DEFAULT_MS);
    expect(retryAfterMs("garbage", "nope")).toBe(RETRY_AFTER_DEFAULT_MS);
  });
});

describe("delay", () => {
  it("rejects promptly when aborted mid-wait", async () => {
    const ac = new AbortController();
    const p = delay(10_000, ac.signal);
    ac.abort(new Error("stop"));
    await expect(p).rejects.toThrow("stop");
  });
});

/* ------------------------ 429 then 200 --------------------------- */

describe("streamRegisters under the per-key limiter", () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries(GOOD_ENV)) vi.stubEnv(k, v);
  });

  it("retries a 429 after the wait it names and then succeeds", async () => {
    // Limit each register exactly once, keyed on the request body: launches are
    // staggered, so a global call counter would let one register's retry eat
    // another's 429.
    const limited = new Set<string>();
    const fetchMock = vi.fn((_u: string, init?: RequestInit) => {
      const body = String(init?.body ?? "");
      const id = REGISTERS.find((r) => body.includes(`REGISTER: ${r.id}`))?.id ?? body;
      if (limited.has(id)) return Promise.resolve(okRes("承知しました。"));
      limited.add(id);
      return Promise.resolve(rateLimited());
    });
    vi.stubGlobal("fetch", fetchMock);

    const { events, onEvent } = collect();
    await streamRegisters(REQ, onEvent);

    expect(events.filter((e) => e.type === "error")).toHaveLength(0);
    expect(events.filter((e) => e.type === "done")).toHaveLength(4);
    // Every register was limited exactly once, then served.
    expect(fetchMock).toHaveBeenCalledTimes(REGISTERS.length * 2);
  });

  // If the header were ignored the body's 10 s wait would blow the test timeout.
  it("honours a Retry-After header over the body text", { timeout: 3000 }, async () => {
    let first = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        if (first) {
          first = false;
          return Promise.resolve(rateLimited("Retry after 10s", { "retry-after": "0" }));
        }
        return Promise.resolve(okRes("了解です。"));
      }),
    );

    const { events, onEvent } = collect();
    await streamRegisters(REQ, onEvent);
    expect(events.filter((e) => e.type === "error")).toHaveLength(0);
    expect(events.filter((e) => e.type === "done")).toHaveLength(4);
  });

  it("surfaces the 429 as a register error once the attempts are spent", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(rateLimited())));

    const { events, onEvent } = collect();
    await streamRegisters(REQ, onEvent);

    const errs = events.filter((e) => e.type === "error");
    expect(errs).toHaveLength(4);
    expect(errs[0]).toMatchObject({ type: "error" });
    expect(errs[0].type === "error" && errs[0].message).toMatch(/429/);
  });
});
