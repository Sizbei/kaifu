import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crossCheck } from "@/lib/extract";
import {
  analyzeDocument,
  resolveVisionProvider,
  VisionConfigError,
  VisionResponseError,
  VisionSchemaError,
} from "@/lib/vision";
import { GATEWAY_PROMPT_ADDENDUM, extractJsonObject, imageMime, stripConflicts } from "@/lib/vision-gateway";

vi.mock("openai", () => ({ default: class MockOpenAI {} }));

const WELL_FORMED = {
  docType: "school_notice",
  confidence: 0.91,
  titleJa: "遠足のお知らせ",
  rawText: "保護者各位\n遠足を実施します。参加費 3,200円\n提出期限 令和8年9月5日（金）",
  issuer: "みどり小学校",
  dates: [{ iso: "2026-09-05", raw: "令和8年9月5日（金）", label: "提出期限" }],
  amounts: [{ yen: 3200, raw: "3,200円", label: "参加費" }],
  obligations: [
    {
      action: "Pay ¥3,200 and return the reply slip.",
      dueDate: { iso: "2026-09-05", raw: "令和8年9月5日（金）", label: "提出期限" },
      amount: { yen: 3200, raw: "3,200円", label: "参加費" },
    },
  ],
};

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUg==";
const JPEG_B64 = "/9j/4AAQSkZJRgABAQ==";

const fetchMock = vi.fn<typeof fetch>();

function completion(content: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sentBody(call: number): Record<string, unknown> {
  const init = fetchMock.mock.calls[call][1];
  return JSON.parse(init?.body as string);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.VISION_PROVIDER = "shisa-gateway";
  process.env.SHISA_BASE_URL = "https://gw.test/openai/v1/";
  process.env.SHISA_API_KEY = "sk-gw";
  delete process.env.SHISA_VISION_MODEL;
  delete process.env.OPENAI_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ["VISION_PROVIDER", "SHISA_BASE_URL", "SHISA_API_KEY", "SHISA_VISION_MODEL", "OPENAI_API_KEY"]) {
    delete process.env[k];
  }
});

describe("resolveVisionProvider", () => {
  it("prefers the gateway only when a Shisa key is set and OpenAI is not", () => {
    expect(resolveVisionProvider({ SHISA_API_KEY: "a" })).toBe("shisa-gateway");
    expect(resolveVisionProvider({ SHISA_API_KEY: "a", OPENAI_API_KEY: "b" })).toBe("openai");
    expect(resolveVisionProvider({ OPENAI_API_KEY: "b" })).toBe("openai");
    expect(resolveVisionProvider({})).toBe("openai");
  });

  it("lets an explicit VISION_PROVIDER win, and rejects unknown values", () => {
    expect(resolveVisionProvider({ VISION_PROVIDER: "openai", SHISA_API_KEY: "a" })).toBe("openai");
    expect(
      resolveVisionProvider({ VISION_PROVIDER: "shisa-gateway", OPENAI_API_KEY: "b" }),
    ).toBe("shisa-gateway");
    expect(() => resolveVisionProvider({ VISION_PROVIDER: "gemini" })).toThrow(VisionConfigError);
  });
});

describe("analyzeDocument via shisa-gateway", () => {
  it("throws a config error without gateway credentials, before any request", async () => {
    delete process.env.SHISA_API_KEY;
    await expect(analyzeDocument(PNG_B64)).rejects.toBeInstanceOf(VisionConfigError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts chat/completions with the system prompt, strict json_schema and the image", async () => {
    fetchMock.mockResolvedValue(completion(JSON.stringify(WELL_FORMED)));

    const result = await analyzeDocument(PNG_B64);

    expect(fetchMock.mock.calls[0][0]).toBe("https://gw.test/openai/v1/chat/completions");
    const body = sentBody(0);
    expect(body.model).toBe("qwen3.7-flash");
    expect(body.enable_thinking).toBe(false);
    expect(body.response_format).toMatchObject({ type: "json_schema", json_schema: { strict: true } });
    expect(JSON.stringify(body.response_format)).not.toContain("conflict");
    const messages = body.messages as { role: string; content: unknown }[];
    expect(messages[0].content).toContain("Do not generate Japanese");
    expect(messages[0].content).toContain(GATEWAY_PROMPT_ADDENDUM);
    expect(messages[1].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "image_url",
          image_url: expect.objectContaining({ url: `data:image/png;base64,${PNG_B64}` }),
        }),
      ]),
    );
    expect(result.docType).toBe("school_notice");
    expect(result.obligations[0].conflict).toBeNull();
  });

  it("honours SHISA_VISION_MODEL, and a caller override above it", async () => {
    fetchMock.mockImplementation(async () => completion(JSON.stringify(WELL_FORMED)));
    process.env.SHISA_VISION_MODEL = "qwen3.7-plus";

    await analyzeDocument(JPEG_B64);
    expect(sentBody(0).model).toBe("qwen3.7-plus");

    await analyzeDocument(JPEG_B64, { model: "qwen-next" });
    expect(sentBody(1).model).toBe("qwen-next");
  });

  it("falls back json_schema → json_object → plain when the gateway answers 400", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("unsupported response_format", { status: 400 }))
      .mockResolvedValueOnce(new Response("unsupported response_format", { status: 400 }))
      .mockResolvedValueOnce(completion(JSON.stringify(WELL_FORMED)));

    await analyzeDocument(PNG_B64);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((sentBody(0).response_format as { type: string }).type).toBe("json_schema");
    expect((sentBody(1).response_format as { type: string }).type).toBe("json_object");
    expect(sentBody(2).response_format).toBeUndefined();
  });

  it("surfaces a non-400 upstream failure as a response error", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 502 }));
    await expect(analyzeDocument(PNG_B64)).rejects.toBeInstanceOf(VisionResponseError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on 429 using the gateway's Retry-After wait", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Retry after 1ms" }), { status: 429 }),
      )
      .mockResolvedValueOnce(completion(JSON.stringify(WELL_FORMED)));

    const result = await analyzeDocument(PNG_B64);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.titleJa).toBe("遠足のお知らせ");
  });

  it("strips markdown fences and chatter around the JSON", async () => {
    fetchMock.mockResolvedValue(
      completion("Here is the record:\n```json\n" + JSON.stringify(WELL_FORMED) + "\n```\nDone."),
    );
    const result = await analyzeDocument(PNG_B64);
    expect(result.rawText).toContain("保護者各位");
  });

  it("drops a model-asserted conflict so only crossCheck can set one", async () => {
    const smuggled = {
      ...WELL_FORMED,
      obligations: [
        {
          ...WELL_FORMED.obligations[0],
          conflict: { field: "dueDate", modelSaw: "x", documentSaid: "y" },
        },
      ],
    };
    fetchMock.mockResolvedValue(completion(JSON.stringify(smuggled)));

    const result = await analyzeDocument(PNG_B64);

    expect(result.obligations[0].conflict).toBeNull();
    expect(crossCheck(result)[0].conflict).toBeNull();
  });

  it("nulls a dueDate whose raw is a relative deadline rather than a printed date", async () => {
    const relative = {
      ...WELL_FORMED,
      obligations: [
        {
          action: "Pay the shortfall.",
          dueDate: { iso: "2026-09-19", raw: "甲から請求を受けた日から14日以内", label: "支払期限" },
          amount: null,
        },
        WELL_FORMED.obligations[0],
      ],
    };
    fetchMock.mockResolvedValue(completion(JSON.stringify(relative)));

    const result = await analyzeDocument(PNG_B64);

    expect(result.obligations[0].dueDate).toBeNull();
    expect(result.obligations[1].dueDate?.raw).toBe("令和8年9月5日（金）");
    expect(crossCheck(result).every((o) => o.conflict === null)).toBe(true);
  });

  it("throws a response error when content is empty (non-multimodal model)", async () => {
    fetchMock.mockResolvedValue(completion(""));
    await expect(analyzeDocument(PNG_B64)).rejects.toThrow(/empty content/);
  });

  it("throws a response error, not a schema error, when content is not JSON", async () => {
    fetchMock.mockResolvedValue(completion("This is a school excursion notice."));
    await expect(analyzeDocument(PNG_B64)).rejects.toBeInstanceOf(VisionResponseError);
  });

  it("rejects contract-violating JSON with a schema error", async () => {
    fetchMock.mockResolvedValue(
      completion(JSON.stringify({ ...WELL_FORMED, docType: "parking_ticket" })),
    );
    await expect(analyzeDocument(PNG_B64)).rejects.toBeInstanceOf(VisionSchemaError);
  });
});

describe("helpers", () => {
  it("sniffs the image mime from the base64 prefix", () => {
    expect(imageMime(PNG_B64)).toBe("image/png");
    expect(imageMime(JPEG_B64)).toBe("image/jpeg");
  });

  it("extractJsonObject takes the outermost object", () => {
    expect(extractJsonObject('x {"a":{"b":1}} y')).toEqual({ a: { b: 1 } });
    expect(() => extractJsonObject("no json")).toThrow(VisionResponseError);
  });

  it("stripConflicts leaves non-object input alone", () => {
    expect(stripConflicts("s")).toBe("s");
    expect(stripConflicts({ obligations: "nope" })).toEqual({ obligations: "nope" });
  });
});
