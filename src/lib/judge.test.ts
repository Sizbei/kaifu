import { describe, expect, it } from "vitest";
import type { JudgeFinding, VisionResult } from "@/lib/types";
import { GROUND_TRUTH, type GroundTruthEntry } from "@/lib/groundtruth";
import {
  assertNoAdviceLanguage,
  judgeClause,
  retrieveEntries,
  type Completer,
} from "@/lib/judge";

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const RESTORATION_CLAUSE =
  "第12条（原状回復）賃借人は、退去時に、経年変化及び通常損耗を含め、" +
  "壁クロスの日焼け、家具の設置によるフローリングのへこみ、" +
  "画鋲の穴の補修費用を負担するものとする。";

function vision(overrides: Partial<VisionResult> = {}): VisionResult {
  return {
    docType: "lease_clause",
    confidence: 0.9,
    titleJa: "賃貸借契約書",
    rawText: RESTORATION_CLAUSE,
    issuer: "株式会社サンプル不動産",
    dates: [],
    amounts: [],
    obligations: [],
    ...overrides,
  };
}

function entryById(id: string): GroundTruthEntry {
  const found = GROUND_TRUTH.find((e) => e.id === id);
  if (!found) throw new Error(`fixture references unknown entry: ${id}`);
  return found;
}

/** A completer that ignores its input and replays a canned model reply. */
function replay(body: unknown): Completer {
  return async () => JSON.stringify(body);
}

const WEAR = entryById("genjo-kaifuku-wear-examples");

const GOOD_FINDING: JudgeFinding = {
  clauseJa: "壁クロスの日焼け、家具の設置によるフローリングのへこみ",
  clausePlain:
    "The clause places the cost of sun-fading of the wallpaper and of furniture dents in the flooring on the tenant.",
  guidelineSays:
    "MLIT's schedule of repair-cost allocation lists dents from placing furniture and fading of wallpaper from sunlight on the landlord's side.",
  citation: WEAR.citation,
  status: "differs",
};

/* ------------------------------------------------------------------ *
 * Retrieval
 * ------------------------------------------------------------------ */

describe("retrieveEntries", () => {
  it("routes a 原状回復 clause to the restoration entries", () => {
    const ids = retrieveEntries(RESTORATION_CLAUSE).map((e) => e.id);
    expect(ids).toContain("genjo-kaifuku-wear-examples");
    expect(ids).toContain("genjo-kaifuku-definition");
  });

  it("does not route a 原状回復 clause to unrelated entries", () => {
    const ids = retrieveEntries(RESTORATION_CLAUSE).map((e) => e.id);
    expect(ids).not.toContain("shikikin-return");
    expect(ids).not.toContain("koshinryo-not-in-model-lease");
  });

  it("routes a 更新料 clause to the renewal-fee entry", () => {
    const ids = retrieveEntries(
      "第3条 契約を更新する場合、賃借人は更新料として賃料1か月分を支払うものとする。",
    ).map((e) => e.id);
    expect(ids[0]).toBe("koshinryo-not-in-model-lease");
  });

  it("returns nothing for a clause that matches no hint", () => {
    expect(retrieveEntries("本物件にはペットを飼育できません。")).toHaveLength(0);
  });

  it("is deterministic", () => {
    const a = retrieveEntries(RESTORATION_CLAUSE).map((e) => e.id);
    const b = retrieveEntries(RESTORATION_CLAUSE).map((e) => e.id);
    expect(a).toEqual(b);
  });
});

/* ------------------------------------------------------------------ *
 * Advice-language guard (弁護士法 72条)
 * ------------------------------------------------------------------ */

describe("assertNoAdviceLanguage", () => {
  it("accepts a neutral comparative finding", () => {
    expect(() => assertNoAdviceLanguage(GOOD_FINDING)).not.toThrow();
  });

  it.each([
    "This clause is illegal under Japanese law.",
    "You should refuse to pay this amount.",
    "The tenant must not accept this charge.",
    "You are entitled to the full deposit back.",
    "We recommend that you negotiate this clause.",
    "The clause is unenforceable and unfair.",
  ])("rejects English advice language: %s", (text) => {
    expect(() =>
      assertNoAdviceLanguage({ ...GOOD_FINDING, guidelineSays: text }),
    ).toThrow(/advice language/i);
  });

  it.each([
    "この条項は違法です。",
    "支払いを拒否する権利があります。",
    "返還を請求できます。",
    "大家さんと交渉しましょう。",
  ])("rejects Japanese advice language: %s", (text) => {
    expect(() =>
      assertNoAdviceLanguage({ ...GOOD_FINDING, clausePlain: text }),
    ).toThrow(/advice language/i);
  });

  it("does not scan clauseJa, which is a verbatim quote of the document", () => {
    expect(() =>
      assertNoAdviceLanguage({
        ...GOOD_FINDING,
        clauseJa: "賃借人は原状回復費用を負担しなければならない。",
      }),
    ).not.toThrow();
  });
});

/* ------------------------------------------------------------------ *
 * judgeClause
 * ------------------------------------------------------------------ */

describe("judgeClause", () => {
  it("returns [] for a non-lease document without calling the model", async () => {
    let called = false;
    const completer: Completer = async () => {
      called = true;
      return "[]";
    };
    const out = await judgeClause(
      vision({ docType: "school_notice" }),
      "en",
      completer,
    );
    expect(out).toEqual([]);
    expect(called).toBe(false);
  });

  it("returns [] when no ground-truth entry matches the clause", async () => {
    const out = await judgeClause(
      vision({ rawText: "本物件にはペットを飼育できません。" }),
      "en",
      replay([GOOD_FINDING]),
    );
    expect(out).toEqual([]);
  });

  it("keeps a legitimate differs finding intact", async () => {
    const out = await judgeClause(vision(), "en", replay([GOOD_FINDING]));
    expect(out).toEqual([GOOD_FINDING]);
  });

  it("tolerates a fenced JSON reply", async () => {
    const fenced: Completer = async () =>
      "```json\n" + JSON.stringify([GOOD_FINDING]) + "\n```";
    const out = await judgeClause(vision(), "en", fenced);
    expect(out).toHaveLength(1);
  });

  it("drops a finding whose citation is fabricated", async () => {
    const fabricated: JudgeFinding = {
      ...GOOD_FINDING,
      citation: {
        source: "国土交通省「原状回復をめぐるトラブルとガイドライン」",
        section: "第9章 第4節",
        url: "https://www.mlit.go.jp/common/999999999.pdf",
      },
    };
    const out = await judgeClause(vision(), "en", replay([fabricated]));
    expect(out).toEqual([]);
  });

  it("drops a finding whose citation url is subtly altered", async () => {
    const tampered: JudgeFinding = {
      ...GOOD_FINDING,
      citation: { ...WEAR.citation, url: "https://example.com/mlit.pdf" },
    };
    const out = await judgeClause(vision(), "en", replay([tampered]));
    expect(out).toEqual([]);
  });

  it("drops a finding that carries advice language", async () => {
    const advisory: JudgeFinding = {
      ...GOOD_FINDING,
      guidelineSays:
        "This charge is unlawful and you can demand that the landlord withdraw it.",
    };
    const out = await judgeClause(vision(), "en", replay([advisory]));
    expect(out).toEqual([]);
  });

  it("keeps the clean finding when only one of two findings is advisory", async () => {
    const advisory: JudgeFinding = {
      ...GOOD_FINDING,
      clausePlain: "You should refuse to sign this.",
    };
    const out = await judgeClause(vision(), "en", replay([advisory, GOOD_FINDING]));
    expect(out).toEqual([GOOD_FINDING]);
  });

  it("drops a finding that fails schema validation", async () => {
    const out = await judgeClause(
      vision(),
      "en",
      replay([{ ...GOOD_FINDING, status: "unenforceable" }]),
    );
    expect(out).toEqual([]);
  });

  it("returns [] when the model reply is not JSON", async () => {
    const out = await judgeClause(vision(), "en", async () => "I cannot help.");
    expect(out).toEqual([]);
  });

  it("passes the clause and the candidate guidance to the model", async () => {
    let seen = "";
    const spy: Completer = async (_system, user) => {
      seen = user;
      return "[]";
    };
    await judgeClause(vision(), "en", spy);
    expect(seen).toContain(RESTORATION_CLAUSE);
    expect(seen).toContain(WEAR.citation.url);
  });
});

/* ------------------------------------------------------------------ *
 * Corpus invariants — a bad citation here poisons every finding.
 * ------------------------------------------------------------------ */

describe("GROUND_TRUTH", () => {
  it("covers the clauses that most often bite foreign tenants", () => {
    const ids = GROUND_TRUTH.map((e) => e.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "genjo-kaifuku-definition",
        "genjo-kaifuku-wear-examples",
        "tsujo-sonmo-tokuyaku",
        "shikikin-return",
        "koshinryo-not-in-model-lease",
        "house-cleaning-tokuyaku",
      ]),
    );
  });

  it("has unique ids", () => {
    const ids = GROUND_TRUTH.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cites only mlit.go.jp over https", () => {
    for (const e of GROUND_TRUTH) {
      expect(e.citation.url).toMatch(/^https:\/\/www\.mlit\.go\.jp\//);
      expect(e.citation.section.length).toBeGreaterThan(0);
      expect(e.citation.source.length).toBeGreaterThan(0);
    }
  });

  it("has routable hints and both language renderings", () => {
    for (const e of GROUND_TRUTH) {
      expect(e.hints.length).toBeGreaterThan(0);
      expect(e.guidanceJa.length).toBeGreaterThan(0);
      expect(e.guidanceEn.length).toBeGreaterThan(0);
    }
  });

  it("states its own guidance without advice language", () => {
    // The corpus is what the model paraphrases. If the source rendering
    // trips the guard, every finding built from it dies downstream.
    for (const e of GROUND_TRUTH) {
      expect(() =>
        assertNoAdviceLanguage({
          clauseJa: "",
          clausePlain: e.guidanceEn,
          guidelineSays: e.guidanceEn,
          citation: e.citation,
          status: "not_addressed",
        }),
      ).not.toThrow();
    }
  });
});
