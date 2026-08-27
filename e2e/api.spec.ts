import { expect, test } from "@playwright/test";

/* Validation runs before any upstream call, so these need no keys. The
   happy path is deliberately untested: CI has no credits. */

test.describe("POST /api/decode", () => {
  test("non-JSON body → 400", async ({ request }) => {
    const res = await request.post("/api/decode", {
      headers: { "content-type": "application/json" },
      data: Buffer.from("this is not json"),
    });
    expect(res.status()).toBe(400);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "Request body must be JSON." });
  });

  test("missing fields → 400", async ({ request }) => {
    for (const data of [{}, { imageBase64: "abc" }, { outputLang: "en" }, { imageBase64: 1, outputLang: "en" }]) {
      const res = await request.post("/api/decode", { data });
      expect(res.status(), JSON.stringify(data)).toBe(400);
      const body: { ok: boolean } = await res.json();
      expect(body.ok).toBe(false);
    }
  });

  test("oversized base64 → 413", async ({ request }) => {
    // 6 MiB decoded is the ceiling; 6.5 MiB of decoded bytes is ~8.7M base64 chars.
    const imageBase64 = "A".repeat(Math.ceil((6.5 * 1024 * 1024 * 4) / 3));
    const res = await request.post("/api/decode", { data: { imageBase64, outputLang: "en" } });
    expect(res.status()).toBe(413);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: /too large/ });
  });
});

test.describe("POST /api/reply", () => {
  const base = { recipient: "Class teacher", docType: "school_notice", documentSummary: "A trip." };

  test("non-JSON body → 400", async ({ request }) => {
    const res = await request.post("/api/reply", {
      headers: { "content-type": "application/json" },
      data: Buffer.from("{not json"),
    });
    expect(res.status()).toBe(400);
    await expect(res.text()).resolves.toBe("Request body must be JSON.");
  });

  test("empty intent → 400", async ({ request }) => {
    for (const intent of ["", "   "]) {
      const res = await request.post("/api/reply", { data: { ...base, intent } });
      expect(res.status(), JSON.stringify(intent)).toBe(400);
    }
  });

  test("intent over 1000 chars → 400", async ({ request }) => {
    const res = await request.post("/api/reply", { data: { ...base, intent: "x".repeat(1001) } });
    expect(res.status()).toBe(400);
    await expect(res.text()).resolves.toContain("Expected { intent, recipient, docType, documentSummary }");
  });

  test("missing recipient → 400", async ({ request }) => {
    const { recipient: _omitted, ...rest } = base;
    void _omitted;
    const res = await request.post("/api/reply", { data: { ...rest, intent: "hello" } });
    expect(res.status()).toBe(400);
  });
});
