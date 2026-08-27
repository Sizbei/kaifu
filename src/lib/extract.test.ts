import { describe, expect, it } from "vitest";
import {
  crossCheck,
  kanjiNumeralToInt,
  parseJapaneseAmounts,
  parseJapaneseDates,
} from "@/lib/extract";
import type { Obligation, VisionResult } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * Fixtures — transcriptions of the three document shapes v0 targets.
 * Toy strings hide the failures that matter (labels sharing a line with
 * a value, weekday parentheses, 年度 that is not a date), so these are
 * shaped like the real prints.
 * ------------------------------------------------------------------ */

const SCHOOL_NOTICE = `○○市立第三小学校
令和8年9月1日

秋の遠足のお知らせ

保護者各位
日時：9月5日(金) 午前8時30分に校門前集合
参加費：3,200円（税込）
提出期限：9月3日(水)
予備日：9月8日(月)
`;

const WARD_LETTER = `渋谷区役所 税務課
令和8年6月10日
令和8年度 特別区民税・都民税 納税通知書
納付期限：令和8年6月30日
納付額：金52,400円
第2期納期限：8月31日
`;

/** Handed out in December; its deadline falls in the following January. */
const WINTER_NOTICE = `令和7年12月15日
冬休みの課題について
提出期限：1月10日(金)
`;

const isos = (text: string, year: number, ref?: Date): string[] =>
  parseJapaneseDates(text, year, ref).map((d) => d.iso);

const yens = (text: string): number[] =>
  parseJapaneseAmounts(text).map((a) => a.yen);

describe("kanjiNumeralToInt", () => {
  it("reads single digits", () => {
    expect(kanjiNumeralToInt("八")).toBe(8);
    expect(kanjiNumeralToInt("〇")).toBe(0);
  });

  it("reads unit-based numerals", () => {
    expect(kanjiNumeralToInt("十")).toBe(10);
    expect(kanjiNumeralToInt("二十五")).toBe(25);
    expect(kanjiNumeralToInt("三千二百")).toBe(3200);
    expect(kanjiNumeralToInt("五万")).toBe(50000);
    expect(kanjiNumeralToInt("一万二千")).toBe(12000);
  });

  it("reads 億", () => {
    expect(kanjiNumeralToInt("一億二千万")).toBe(120_000_000);
  });

  it("reads positional numerals used in vertical writing", () => {
    expect(kanjiNumeralToInt("二〇二六")).toBe(2026);
  });

  it("rejects anything that is not a kanji numeral", () => {
    expect(kanjiNumeralToInt("")).toBeNull();
    expect(kanjiNumeralToInt("abc")).toBeNull();
    expect(kanjiNumeralToInt("9月")).toBeNull();
  });
});

describe("parseJapaneseDates — era dates", () => {
  it("reads 令和 with arabic numerals", () => {
    const [d] = parseJapaneseDates("発行日：令和8年9月5日", 2026);
    expect(d.iso).toBe("2026-09-05");
    expect(d.raw).toBe("令和8年9月5日");
    expect(d.label).toBe("発行日");
  });

  it("keeps the weekday in raw", () => {
    const [d] = parseJapaneseDates("令和8年9月5日(金)", 2026);
    expect(d.iso).toBe("2026-09-05");
    expect(d.raw).toBe("令和8年9月5日(金)");
  });

  it("reads the R8.9.5 abbreviation", () => {
    expect(isos("納期限 R8.9.5 まで", 2026)).toEqual(["2026-09-05"]);
    expect(isos("H31.4.30", 2019)).toEqual(["2019-04-30"]);
  });

  it("reads kanji-numeral era dates", () => {
    expect(isos("令和八年九月五日", 2026)).toEqual(["2026-09-05"]);
  });

  it("reads 元年", () => {
    expect(isos("令和元年5月1日", 2019)).toEqual(["2019-05-01"]);
  });

  it("handles the Heisei/Reiwa boundary", () => {
    // 平成 ended 2019-04-30 and 令和 began the next day. Both eras therefore
    // map into 2019 and the offsets must not be off by one.
    expect(isos("平成31年4月30日", 2019)).toEqual(["2019-04-30"]);
    expect(isos("令和1年5月1日", 2019)).toEqual(["2019-05-01"]);
  });

  it("reads 昭和 on old lease paperwork", () => {
    expect(isos("昭和60年3月1日", 2026)).toEqual(["1985-03-01"]);
  });

  it("reads 大正 and 明治 rather than mistaking them for year-less dates", () => {
    expect(isos("大正15年3月1日", 2026)).toEqual(["1926-03-01"]);
    expect(isos("明治45年7月30日", 2026)).toEqual(["1912-07-30"]);
  });
});

describe("parseJapaneseDates — western dates", () => {
  it("reads 年月日, slashes and dots", () => {
    expect(isos("2026年9月5日", 2026)).toEqual(["2026-09-05"]);
    expect(isos("2026/9/5", 2026)).toEqual(["2026-09-05"]);
    expect(isos("2026.9.5", 2026)).toEqual(["2026-09-05"]);
    expect(isos("2026-09-05", 2026)).toEqual(["2026-09-05"]);
  });

  it("does not double-count the month/day inside a full date", () => {
    expect(isos("2026/9/5", 2026)).toHaveLength(1);
    expect(isos("令和8年9月5日", 2026)).toHaveLength(1);
  });

  it("normalises full-width digits", () => {
    expect(isos("２０２６年９月５日", 2026)).toEqual(["2026-09-05"]);
  });
});

describe("parseJapaneseDates — year-less dates", () => {
  it("resolves against the reference year", () => {
    expect(isos("9月5日", 2026)).toEqual(["2026-09-05"]);
    expect(isos("9/5", 2026)).toEqual(["2026-09-05"]);
    expect(isos("9月5日(金)", 2026)).toEqual(["2026-09-05"]);
  });

  it("rolls forward when the date would land far in the past", () => {
    // A notice dated 令和7年12月15日 that says 1月10日 means the January
    // *after* the printing, not the one ten months before it.
    expect(isos(WINTER_NOTICE, 2025)).toEqual(["2025-12-15", "2026-01-10"]);
  });

  it("rolls forward against an explicit reference date", () => {
    expect(isos("提出期限：1月10日", 2025, new Date(2025, 11, 15))).toEqual([
      "2026-01-10",
    ]);
  });

  it("does not roll a date only slightly in the past", () => {
    expect(isos("9月5日", 2026, new Date(2026, 9, 1))).toEqual(["2026-09-05"]);
  });

  it("does not roll a future date", () => {
    expect(isos("9月5日", 2026, new Date(2026, 7, 1))).toEqual(["2026-09-05"]);
  });
});

describe("parseJapaneseDates — ranges", () => {
  it("emits both endpoints with distinct labels", () => {
    const found = parseJapaneseDates("夏季休業：8月1日〜8月31日", 2026);
    expect(found.map((d) => d.iso)).toEqual(["2026-08-01", "2026-08-31"]);
    expect(found[0].label).toBe("夏季休業（開始）");
    expect(found[1].label).toBe("夏季休業（終了）");
  });

  it("falls back to bare markers when the range has no label", () => {
    const found = parseJapaneseDates("8月1日〜8月31日", 2026);
    expect(found.map((d) => d.label)).toEqual(["開始", "終了"]);
  });

  it("accepts the other separators OCR produces", () => {
    expect(isos("9月5日～9月7日", 2026)).toEqual(["2026-09-05", "2026-09-07"]);
    expect(isos("9月5日から9月7日", 2026)).toEqual([
      "2026-09-05",
      "2026-09-07",
    ]);
  });
});

describe("parseJapaneseDates — rejection and labelling", () => {
  it("drops impossible dates rather than clamping them", () => {
    expect(isos("2月30日", 2026)).toEqual([]);
    expect(isos("13月1日", 2026)).toEqual([]);
  });

  it("returns nothing for text with no dates", () => {
    expect(isos("保護者各位", 2026)).toEqual([]);
    expect(isos("", 2026)).toEqual([]);
  });

  it("does not read 年度 as a date", () => {
    expect(isos("令和8年度 特別区民税", 2026)).toEqual([]);
  });

  it("labels each date with the text preceding it on its line", () => {
    const found = parseJapaneseDates(SCHOOL_NOTICE, 2026);
    expect(found.map((d) => d.iso)).toEqual([
      "2026-09-01",
      "2026-09-05",
      "2026-09-03",
      "2026-09-08",
    ]);
    expect(found.map((d) => d.label)).toEqual(["", "日時", "提出期限", "予備日"]);
  });

  it("reads the ward letter end to end", () => {
    const found = parseJapaneseDates(WARD_LETTER, 2026);
    expect(found.map((d) => d.iso)).toEqual([
      "2026-06-10",
      "2026-06-30",
      "2026-08-31",
    ]);
    expect(found[1].label).toBe("納付期限");
    expect(found[2].label).toBe("第2期納期限");
  });
});

describe("parseJapaneseAmounts", () => {
  it("reads the printed forms", () => {
    expect(yens("¥3,200")).toEqual([3200]);
    expect(yens("￥3,200")).toEqual([3200]);
    expect(yens("3,200円")).toEqual([3200]);
    expect(yens("3200円")).toEqual([3200]);
    expect(yens("金3,200円")).toEqual([3200]);
    expect(yens("3,200円(税込)")).toEqual([3200]);
    expect(yens("３，２００円")).toEqual([3200]);
  });

  it("reads kanji numerals", () => {
    expect(yens("三千二百円")).toEqual([3200]);
    expect(yens("金五万円也")).toEqual([50000]);
  });

  it("reads 万 and 千 units", () => {
    expect(yens("1万2千円")).toEqual([12000]);
    expect(yens("5万円")).toEqual([50000]);
    expect(yens("12万3千円")).toEqual([123000]);
  });

  it("reads fractional 万 as used for rent", () => {
    expect(yens("家賃 8.5万円")).toEqual([85000]);
    expect(yens("8.3万円")).toEqual([83000]);
  });

  it("drops a sub-yen figure rather than reading part of it", () => {
    expect(yens("3,200.50円")).toEqual([]);
  });

  it("keeps raw and label", () => {
    const [a] = parseJapaneseAmounts("参加費：3,200円（税込）");
    expect(a.raw).toBe("3,200円");
    expect(a.label).toBe("参加費");
    expect(Number.isInteger(a.yen)).toBe(true);
  });

  it("does not count a yen figure twice", () => {
    expect(yens("¥3,200円")).toEqual([3200]);
  });

  it("ignores numbers that are not money", () => {
    expect(yens("第3学年2組 午前8時30分")).toEqual([]);
    expect(yens("令和8年度 第2期")).toEqual([]);
    expect(yens("")).toEqual([]);
  });

  it("reads every amount in the fixtures", () => {
    expect(yens(SCHOOL_NOTICE)).toEqual([3200]);
    const ward = parseJapaneseAmounts(WARD_LETTER);
    expect(ward.map((a) => a.yen)).toEqual([52400]);
    expect(ward[0].raw).toBe("金52,400円");
    expect(ward[0].label).toBe("納付額");
  });
});

/* ------------------------------------------------------------------ *
 * crossCheck
 * ------------------------------------------------------------------ */

const vision = (over: Partial<VisionResult> = {}): VisionResult => ({
  docType: "school_notice",
  confidence: 0.9,
  titleJa: "秋の遠足のお知らせ",
  rawText: SCHOOL_NOTICE,
  issuer: "○○市立第三小学校",
  dates: [],
  amounts: [],
  obligations: [],
  ...over,
});

const obligation = (over: Partial<Obligation> = {}): Obligation => ({
  action: "Pay ¥3,200 and hand in the reply slip.",
  dueDate: null,
  amount: null,
  conflict: null,
  ...over,
});

const DUE = { iso: "2026-09-03", raw: "9月3日(水)", label: "提出期限" };
const FEE = { yen: 3200, raw: "3,200円", label: "参加費" };

describe("crossCheck", () => {
  it("clears an obligation whose date and amount are both in the document", () => {
    const out = crossCheck(
      vision({ obligations: [obligation({ dueDate: DUE, amount: FEE })] }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].conflict).toBeNull();
    expect(out[0].action).toBe("Pay ¥3,200 and hand in the reply slip.");
  });

  it("flags a date the document does not contain", () => {
    const out = crossCheck(
      vision({
        obligations: [
          obligation({
            dueDate: { iso: "2026-09-13", raw: "9月13日", label: "提出期限" },
            amount: FEE,
          }),
        ],
      }),
    );
    expect(out[0].conflict).toEqual({
      field: "dueDate",
      modelSaw: "9月13日",
      documentSaid: "9月8日(月)",
    });
  });

  it("flags an amount the document does not contain", () => {
    const out = crossCheck(
      vision({
        obligations: [
          obligation({
            dueDate: DUE,
            amount: { yen: 5000, raw: "5,000円", label: "参加費" },
          }),
        ],
      }),
    );
    expect(out[0].conflict).toEqual({
      field: "amount",
      modelSaw: "5,000円",
      documentSaid: "3,200円",
    });
  });

  it("reports the date when both fields disagree", () => {
    // A wrong deadline costs more than a wrong figure, so it is the one
    // surfaced when only a single conflict slot is available.
    const out = crossCheck(
      vision({
        obligations: [
          obligation({
            dueDate: { iso: "2026-12-25", raw: "12月25日", label: "" },
            amount: { yen: 9999, raw: "9,999円", label: "" },
          }),
        ],
      }),
    );
    expect(out[0].conflict?.field).toBe("dueDate");
  });

  it("says so when the document yields no candidates at all", () => {
    const out = crossCheck(
      vision({
        rawText: "保護者各位",
        obligations: [obligation({ dueDate: DUE, amount: FEE })],
      }),
    );
    expect(out[0].conflict).toEqual({
      field: "dueDate",
      modelSaw: "9月3日(水)",
      documentSaid: "not found in document",
    });
  });

  it("passes through obligations that carry no date or amount", () => {
    const out = crossCheck(vision({ obligations: [obligation()] }));
    expect(out[0].conflict).toBeNull();
  });

  it("never drops an obligation", () => {
    const out = crossCheck(
      vision({
        obligations: [
          obligation({ dueDate: DUE }),
          obligation({ amount: { yen: 1, raw: "1円", label: "" } }),
          obligation(),
        ],
      }),
    );
    expect(out).toHaveLength(3);
  });

  it("checks an amount-only obligation on a document with no dates", () => {
    const out = crossCheck(
      vision({ rawText: "参加費：3,200円", obligations: [obligation({ amount: FEE })] }),
    );
    expect(out[0].conflict).toBeNull();
  });

  it("does not mutate its input", () => {
    const input = vision({
      obligations: [
        obligation({
          dueDate: { iso: "2026-09-13", raw: "9月13日", label: "提出期限" },
          amount: FEE,
        }),
      ],
    });
    const snapshot = structuredClone(input);
    const out = crossCheck(input);
    expect(input).toEqual(snapshot);
    expect(out[0]).not.toBe(input.obligations[0]);
  });

  it("resolves year-less document dates in the model's own year frame", () => {
    // The model reports ISO years; the document prints bare 月日. The
    // cross-check must not fire simply because the two use different forms.
    const out = crossCheck(
      vision({
        rawText: WINTER_NOTICE,
        dates: [{ iso: "2025-12-15", raw: "令和7年12月15日", label: "" }],
        obligations: [
          obligation({
            dueDate: { iso: "2026-01-10", raw: "1月10日(金)", label: "提出期限" },
          }),
        ],
      }),
    );
    expect(out[0].conflict).toBeNull();
  });
});
