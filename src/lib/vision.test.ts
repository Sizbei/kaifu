import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DOC_TYPE_DESCRIPTORS, describeTaxonomyForPrompt } from "@/lib/doctypes";
import {
  analyzeDocument,
  VISION_FORMAT,
  VISION_SYSTEM_PROMPT,
  VisionConfigError,
  VisionResponseError,
  VisionSchemaError,
} from "@/lib/vision";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    responses = { create };
    constructor(readonly options: { apiKey: string }) {}
  },
}));

/** A response shaped like the one the Responses API returns for a json_schema format. */
function structuredResponse(output: unknown) {
  return {
    id: "resp_test",
    status: "completed",
    incomplete_details: null,
    output: [
      {
        type: "message",
        id: "msg_test",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }],
      },
    ],
  };
}

const WELL_FORMED = {
  docType: "school_notice",
  confidence: 0.91,
  titleJa: "遠足のお知らせ",
  rawText: "保護者各位\n遠足を実施します。参加費 3,200円\n提出期限 令和8年9月5日",
  issuer: "みどり小学校",
  dates: [{ iso: "2026-09-05", raw: "令和8年9月5日", label: "提出期限" }],
  amounts: [{ yen: 3200, raw: "3,200円", label: "参加費" }],
  obligations: [
    {
      action: "Pay ¥3,200 and return the reply slip.",
      dueDate: { iso: "2026-09-05", raw: "令和8年9月5日", label: "提出期限" },
      amount: { yen: 3200, raw: "3,200円", label: "参加費" },
    },
  ],
};

const IMAGE_B64 = "/9j/4AAQSkZJRgABAQ==";

beforeEach(() => {
  create.mockReset();
  process.env.OPENAI_API_KEY = "sk-test";
  delete process.env.OPENAI_VISION_MODEL;
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_VISION_MODEL;
});

describe("describeTaxonomyForPrompt", () => {
  it("renders every hint of all three real document types", () => {
    const rendered = describeTaxonomyForPrompt();

    for (const id of ["school_notice", "ward_tax_letter", "lease_clause"] as const) {
      const descriptor = DOC_TYPE_DESCRIPTORS[id];
      expect(rendered).toContain(descriptor.id);
      expect(rendered).toContain(descriptor.labelEn);
      expect(descriptor.hints.length).toBeGreaterThan(0);
      for (const hint of descriptor.hints) {
        expect(rendered).toContain(hint);
      }
      expect(rendered).toContain(descriptor.extractionFocus);
    }
  });

  it("offers `unknown` so the model is never forced into a wrong bucket", () => {
    expect(describeTaxonomyForPrompt()).toContain("unknown");
  });
});

/*
 * The vision/generation seam IS the product. If these assertions ever have to
 * be relaxed, the prompt has drifted into doing Shisa's job.
 */
describe("VISION_SYSTEM_PROMPT", () => {
  it("forbids prose, translation, advice and commentary", () => {
    for (const clause of [
      "JSON only",
      "Do not translate",
      "Do not advise",
      "Do not editorialise",
      "commentary",
      "Do not write prose",
    ]) {
      expect(VISION_SYSTEM_PROMPT).toContain(clause);
    }
  });

  it("forbids generating Japanese — it may only transcribe what is printed", () => {
    expect(VISION_SYSTEM_PROMPT).toContain("Do not generate Japanese");
  });

  it("demands a verbatim, complete transcription including handwriting", () => {
    expect(VISION_SYSTEM_PROMPT).toContain("verbatim");
    expect(VISION_SYSTEM_PROMPT).toContain("handwritten");
    expect(VISION_SYSTEM_PROMPT).toContain("Never summarise");
  });

  it("demands raw surface forms for dates and amounts", () => {
    expect(VISION_SYSTEM_PROMPT).toContain("exactly as printed");
  });

  it("carries the taxonomy so classification is grounded", () => {
    expect(VISION_SYSTEM_PROMPT).toContain("納期限");
    expect(VISION_SYSTEM_PROMPT).toContain("原状回復");
  });
});

describe("VISION_FORMAT", () => {
  it("is strict and closed so the model cannot assert a conflict", () => {
    expect(VISION_FORMAT.strict).toBe(true);
    expect(JSON.stringify(VISION_FORMAT.schema)).not.toContain("conflict");
    expect(VISION_FORMAT.schema.additionalProperties).toBe(false);
  });

  it("requires a nullable box on every obligation, so strict mode stays valid", () => {
    const schema = VISION_FORMAT.schema as {
      properties: { obligations: { items: { required: string[]; properties: { box: unknown } } } };
    };
    const items = schema.properties.obligations.items;
    expect(items.required).toContain("box");
    expect(JSON.stringify(items.properties.box)).toContain("normalized 0..1");
    expect(JSON.stringify(items.properties.box)).toContain('"null"');
    expect(VISION_SYSTEM_PROMPT).toContain("LOCATING OBLIGATIONS");
  });
});

describe("analyzeDocument", () => {
  it("throws an actionable config error when the API key is absent", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(analyzeDocument(IMAGE_B64)).rejects.toBeInstanceOf(VisionConfigError);
    await expect(analyzeDocument(IMAGE_B64)).rejects.toThrow(/OPENAI_API_KEY/);
    expect(create).not.toHaveBeenCalled();
  });

  it("sends the image as a high-detail data URL and forces the JSON schema format", async () => {
    create.mockResolvedValue(structuredResponse(WELL_FORMED));

    await analyzeDocument(IMAGE_B64);

    const request = create.mock.calls[0][0];
    expect(request.model).toBe("gpt-5.5");
    expect(request.instructions).toBe(VISION_SYSTEM_PROMPT);
    expect(request.text).toEqual({ format: VISION_FORMAT });
    expect(request.input[0].content[0]).toEqual({
      type: "input_image",
      image_url: `data:image/jpeg;base64,${IMAGE_B64}`,
      detail: "high",
    });
  });

  it("honours OPENAI_VISION_MODEL, and a caller override above it", async () => {
    create.mockResolvedValue(structuredResponse(WELL_FORMED));
    process.env.OPENAI_VISION_MODEL = "gpt-5.4-mini";

    await analyzeDocument(IMAGE_B64);
    expect(create.mock.calls[0][0].model).toBe("gpt-5.4-mini");

    await analyzeDocument(IMAGE_B64, { model: "gpt-5.5-pro" });
    expect(create.mock.calls[1][0].model).toBe("gpt-5.5-pro");
  });

  it("returns a validated result and defaults obligation conflicts to null", async () => {
    create.mockResolvedValue(structuredResponse(WELL_FORMED));

    const result = await analyzeDocument(IMAGE_B64);

    expect(result.docType).toBe("school_notice");
    expect(result.rawText).toContain("保護者各位");
    expect(result.dates[0].raw).toBe("令和8年9月5日");
    expect(result.obligations[0].conflict).toBeNull();
  });

  it("rejects malformed model output with a typed schema error", async () => {
    create.mockResolvedValue(
      structuredResponse({
        ...WELL_FORMED,
        docType: "parking_ticket", // not in the taxonomy
        confidence: 4, // outside 0..1
        amounts: [{ yen: "3,200", raw: "3,200円", label: "参加費" }],
      }),
    );

    await expect(analyzeDocument(IMAGE_B64)).rejects.toBeInstanceOf(VisionSchemaError);
  });

  it("rejects a missing rawText rather than inventing an empty transcription", async () => {
    const withoutRawText = Object.fromEntries(
      Object.entries(WELL_FORMED).filter(([key]) => key !== "rawText"),
    );
    create.mockResolvedValue(structuredResponse(withoutRawText));

    await expect(analyzeDocument(IMAGE_B64)).rejects.toBeInstanceOf(VisionSchemaError);
  });

  it("passes a low-confidence result through unfiltered — the caller decides", async () => {
    create.mockResolvedValue(structuredResponse({ ...WELL_FORMED, confidence: 0.12 }));

    const result = await analyzeDocument(IMAGE_B64);

    expect(result.confidence).toBe(0.12);
    expect(result.obligations).toHaveLength(1);
    expect(result.rawText).toContain("参加費");
  });

  it("throws when the model refuses instead of producing JSON", async () => {
    create.mockResolvedValue({
      id: "resp_test",
      status: "completed",
      incomplete_details: null,
      output: [
        {
          type: "message",
          id: "msg_test",
          role: "assistant",
          status: "completed",
          content: [{ type: "refusal", refusal: "I can't help with that." }],
        },
      ],
    });

    await expect(analyzeDocument(IMAGE_B64)).rejects.toBeInstanceOf(VisionResponseError);
  });

  it("throws when the response carries no message at all", async () => {
    create.mockResolvedValue({
      id: "resp_test",
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output: [{ type: "reasoning", id: "rs_test", summary: [] }],
    });

    await expect(analyzeDocument(IMAGE_B64)).rejects.toThrow(VisionResponseError);
    await expect(analyzeDocument(IMAGE_B64)).rejects.toThrow(/max_output_tokens/);
  });

  it("throws a response error, not a schema error, when output_text is not JSON", async () => {
    create.mockResolvedValue({
      id: "resp_test",
      status: "completed",
      incomplete_details: null,
      output: [
        {
          type: "message",
          id: "msg_test",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "This is a school excursion notice.", annotations: [] }],
        },
      ],
    });

    await expect(analyzeDocument(IMAGE_B64)).rejects.toBeInstanceOf(VisionResponseError);
  });
});
