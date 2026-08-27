/**
 * The deterministic pass.
 *
 * Pure functions over the OCR transcription: no I/O, no clock, no network.
 * It re-derives the dates and amounts itself so that `crossCheck` can hold
 * the vision model to what is actually printed on the page. The model is
 * the only thing here that can hallucinate; this file is the witness.
 */

import type {
  ExtractedAmount,
  ExtractedDate,
  Obligation,
  VisionResult,
} from "@/lib/types";

/* ------------------------------------------------------------------ *
 * Numerals
 * ------------------------------------------------------------------ */

const KANJI_DIGIT: Record<string, number> = {
  〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};
const KANJI_SMALL_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
const KANJI_BIG_UNIT: Record<string, number> = { 万: 10_000, 億: 100_000_000 };
const KANJI_UNITS = "十百千万億";
/** Formal (daiji) spellings, used on leases and receipts to resist alteration. */
const DAIJI: Record<string, string> = {
  壱: "一", 弐: "二", 参: "三", 肆: "四", 伍: "五", 陸: "六", 漆: "七", 捌: "八", 玖: "九", 拾: "十", 萬: "万",
};
const fromDaiji = (s: string): string => [...s].map((c) => DAIJI[c] ?? c).join("");
const KANJI_NUM = "〇零一二三四五六七八九十百千万億" + Object.keys(DAIJI).join("");
const KANJI_D = "〇零一二三四五六七八九十";

/**
 * Scans a number written with unit markers, in any mix of scripts:
 * "三千二百", "1万2千", "3千200", "3200" all resolve. Returns null on any
 * character it does not recognise rather than guessing a partial value.
 */
function scanUnitNumber(input: string): number | null {
  const s = input.replace(/,/g, "");
  let total = 0;
  let section = 0;
  let current = 0;
  let seen = false;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    // The fraction matters: rents are quoted 8.5万円, and reading that run
    // as a bare "5" would report 50,000 for an 85,000 yen obligation.
    const run = /^[0-9]+(?:\.[0-9]+)?/.exec(s.slice(i));
    if (run) {
      current = Number(run[0]);
      seen = true;
      i += run[0].length;
      continue;
    }
    if (c in KANJI_DIGIT) {
      current = KANJI_DIGIT[c];
      seen = true;
    } else if (c in KANJI_SMALL_UNIT) {
      // A bare 十 means ten, not zero-times-ten.
      section += (current || 1) * KANJI_SMALL_UNIT[c];
      current = 0;
      seen = true;
    } else if (c in KANJI_BIG_UNIT) {
      total += (section + current) * KANJI_BIG_UNIT[c];
      section = 0;
      current = 0;
      seen = true;
    } else {
      return null;
    }
    i += 1;
  }
  if (!seen) return null;
  // 8.3 * 10000 is 82999.999… in binary; snap back before the integer check.
  const value = total + section + current;
  return Math.abs(value - Math.round(value)) < 1e-6 ? Math.round(value) : value;
}

/**
 * Kanji numerals come in two incompatible spellings and only the presence
 * of a unit marker distinguishes them: 三千二百 is additive (3200) while
 * 二〇二六, used in vertical writing, is positional (2026).
 */
export function kanjiNumeralToInt(s: string): number | null {
  const t = fromDaiji(s.trim());
  if (!t || ![...t].every((c) => KANJI_NUM.includes(c))) return null;
  if (![...t].some((c) => KANJI_UNITS.includes(c))) {
    return [...t].reduce((n, c) => n * 10 + KANJI_DIGIT[c], 0);
  }
  return scanUnitNumber(t);
}

const parseNumberToken = (t: string): number | null =>
  [...t].every((c) => KANJI_NUM.includes(c))
    ? kanjiNumeralToInt(t)
    : scanUnitNumber(t);

const HALF: Record<string, string> = { "，": ",", "．": ".", "／": "/", "－": "-" };

/** Width-folds digits and separators. Length is preserved so that offsets
 *  still index into the original text for `raw` and for labels. */
const toAscii = (s: string): string =>
  s.replace(/[０-９，．／－]/g, (c) =>
    HALF[c] ?? String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/** Every pattern is run over the whole text, so matches nest. Keeping the
 *  earliest — and, at an equal start, the longest — absorbs 9月5日 inside
 *  令和8年9月5日 and 3,200円 inside ¥3,200円 instead of counting them twice. */
function dropOverlaps<T extends { start: number; end: number }>(spans: T[]): T[] {
  return [...spans]
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
    .reduce<T[]>(
      (kept, s) =>
        kept.some((k) => s.start < k.end && s.end > k.start) ? kept : [...kept, s],
      [],
    );
}

/* ------------------------------------------------------------------ *
 * Labels
 * ------------------------------------------------------------------ */

/** Whatever introduces the value on its own line: 締切, 提出期限, 参加費. */
function labelFor(original: string, start: number): string {
  const lineStart = original.lastIndexOf("\n", Math.max(start - 1, 0)) + 1;
  const prefix = original.slice(lineStart, start).replace(/[\s　：:・=＝>＞]+$/u, "");
  const tail = prefix.split(/[、。，,）)】\]]/).pop() ?? "";
  return tail.replace(/^[\s　・■●◆○◎※*＊-]+/u, "").trim().slice(-24);
}

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

/** Gregorian year of era year 1, minus 1; the letters are what date stamps
 *  print. 大正/明治 are here not because they are common but because without
 *  them 大正15年3月1日 falls through to the year-less rule and resolves to
 *  *this* year — a silently wrong date on old lease paperwork. */
const ERA_BASE: Record<string, number> = {
  令和: 2018, 平成: 1988, 昭和: 1925, 大正: 1911, 明治: 1867,
  R: 2018, H: 1988, S: 1925, T: 1911, M: 1867,
};

const ROLLOVER_GRACE_DAYS = 60;
const DAY_MS = 86_400_000;
/** Optional trailing weekday: 9月5日(金). Kept so `raw` reads as printed. */
const S = "[\\s\\u3000]*";
const WD = `(?:${S}[（(][月火水木金土日][）)])?`;
const N = `(?:[0-9]+|[${KANJI_D}]+)`;

interface DateMatch {
  start: number;
  end: number;
  /** null for the year-less 9月5日 / 9/5 forms. */
  year: number | null;
  month: number;
  day: number;
}

const num = (t: string): number | null =>
  /^[0-9]+$/.test(t) ? Number(t) : kanjiNumeralToInt(t);

type Builder = (m: RegExpExecArray) => Omit<DateMatch, "start" | "end"> | null;

const eraYear = (era: string, token: string): number | null => {
  const n = token === "元" ? 1 : num(token);
  return n === null || n < 1 ? null : ERA_BASE[era] + n;
};

const DATE_PATTERNS: Array<{ re: RegExp; build: Builder }> = [
  {
    re: new RegExp(`(令和|平成|昭和|大正|明治)${S}(元|${N})${S}年${S}(${N})${S}月${S}(${N})${S}日${WD}`, "g"),
    build: (m) => build(eraYear(m[1], m[2]), num(m[3]), num(m[4])),
  },
  {
    re: /(?<![A-Za-z0-9])([RHSTM])[\s　]*([0-9]+)[.\-/]([0-9]{1,2})[.\-/]([0-9]{1,2})(?![0-9])/g,
    build: (m) => build(eraYear(m[1], m[2]), num(m[3]), num(m[4])),
  },
  {
    re: new RegExp(`([0-9]{4})${S}年${S}(${N})${S}月${S}(${N})${S}日${WD}`, "g"),
    build: (m) => build(Number(m[1]), num(m[2]), num(m[3])),
  },
  {
    re: /(?<![0-9])([0-9]{4})[.\-/]([0-9]{1,2})[.\-/]([0-9]{1,2})(?![0-9])/g,
    build: (m) => build(Number(m[1]), num(m[2]), num(m[3])),
  },
  {
    re: new RegExp(`(${N})${S}月${S}(${N})${S}日${WD}`, "g"),
    build: (m) => build(undefined, num(m[1]), num(m[2])),
  },
  {
    re: /(?<![0-9./-])([0-9]{1,2})\/([0-9]{1,2})(?![0-9/])/g,
    build: (m) => build(undefined, num(m[1]), num(m[2])),
  },
];

/** `undefined` year means the document printed none (9月5日); `null` means
 *  a year was printed but could not be read, which voids the whole match. */
function build(
  year: number | null | undefined,
  month: number | null,
  day: number | null,
): Omit<DateMatch, "start" | "end"> | null {
  if (year === null || month === null || day === null) return null;
  return { year: year ?? null, month, day };
}

function collectDates(text: string): DateMatch[] {
  const found: DateMatch[] = [];
  for (const { re, build: b } of DATE_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const parts = b(m);
      if (parts) found.push({ ...parts, start: m.index, end: m.index + m[0].length });
    }
  }
  return dropOverlaps(found);
}

/** Calendar-validating formatter. Rejects 2月30日 instead of rolling it
 *  into March, because a silently shifted deadline is worse than none. */
function toIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${String(year).padStart(4, "0")}-${p(month)}-${p(day)}`;
}

const RANGE_SEP = /^[\s　]*(?:〜|～|~|ー|―|–|—|-|から|より)[\s　]*$/;

/**
 * @param referenceYear  Year assumed for the bare 9月5日 / 9/5 forms.
 * @param referenceDate  Optional day-level anchor for the roll-forward rule.
 *   When omitted, the first fully-qualified date printed on the document is
 *   used — that is the issue date on virtually every notice and ward letter,
 *   and keeping the anchor inside the document keeps this function pure.
 */
export function parseJapaneseDates(
  rawText: string,
  referenceYear: number,
  referenceDate?: Date,
): ExtractedDate[] {
  const text = toAscii(rawText);
  const matches = collectDates(text);

  const qualified = matches.find((m) => m.year !== null);
  const anchor = referenceDate
    ? Date.UTC(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate())
    : qualified
      ? Date.UTC(qualified.year as number, qualified.month - 1, qualified.day)
      : Date.UTC(referenceYear, 0, 1);

  const resolved = matches.flatMap((m) => {
    let year = m.year ?? referenceYear;
    if (m.year === null) {
      // School notices print bare 月日. One handed out in December saying
      // 1月10日 means the *next* January, so a year-less date that lands
      // well before the anchor is rolled forward. The grace window keeps a
      // deadline that has merely just passed in the current year.
      const candidate = Date.UTC(year, m.month - 1, m.day);
      if (candidate < anchor - ROLLOVER_GRACE_DAYS * DAY_MS) year += 1;
    }
    const iso = toIso(year, m.month, m.day);
    return iso ? [{ match: m, iso }] : [];
  });

  const out: ExtractedDate[] = [];
  for (let i = 0; i < resolved.length; i += 1) {
    const { match, iso } = resolved[i];
    const next = resolved[i + 1];
    const raw = rawText.slice(match.start, match.end).trim();
    const label = labelFor(rawText, match.start);
    // 9月5日〜9月7日: both endpoints matter, but the second one's preceding
    // text is only the separator, so the pair shares the opening label.
    if (next && RANGE_SEP.test(text.slice(match.end, next.match.start))) {
      out.push({ iso, raw, label: label ? `${label}（開始）` : "開始" });
      out.push({
        iso: next.iso,
        raw: rawText.slice(next.match.start, next.match.end).trim(),
        label: label ? `${label}（終了）` : "終了",
      });
      i += 1;
      continue;
    }
    out.push({ iso, raw, label });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Amounts
 * ------------------------------------------------------------------ */

const AMOUNT_NUM = `[0-9${KANJI_NUM}](?:[0-9,.${KANJI_NUM}]*[0-9${KANJI_NUM}])?`;

/** A figure counts as money only with a ¥ or a 円 attached — otherwise
 *  第2期 and 午前8時30分 would both read as amounts. */
const AMOUNT_PATTERNS = [
  new RegExp(`(?:金${S})?[¥￥]${S}(${AMOUNT_NUM})(?:${S}円)?`, "g"),
  new RegExp(`(?:金${S})?(${AMOUNT_NUM})${S}[円圓]`, "g"),
];

export function parseJapaneseAmounts(rawText: string): ExtractedAmount[] {
  const text = toAscii(rawText);
  const found: Array<{ start: number; end: number; yen: number }> = [];
  for (const re of AMOUNT_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const yen = parseNumberToken(m[1]);
      if (yen === null || !Number.isInteger(yen) || yen < 0) continue;
      found.push({ start: m.index, end: m.index + m[0].length, yen });
    }
  }
  return dropOverlaps(found).map((f) => ({
    yen: f.yen,
    raw: rawText.slice(f.start, f.end).trim(),
    label: labelFor(rawText, f.start),
  }));
}

/* ------------------------------------------------------------------ *
 * Cross-check
 * ------------------------------------------------------------------ */

const NOT_FOUND = "not found in document";

const showDate = (d: ExtractedDate): string => d.raw.trim() || d.iso;
const showAmount = (a: ExtractedAmount): string => a.raw.trim() || `${a.yen}円`;
const isoMs = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y || 0, (m || 1) - 1, d || 1);
};

function nearest<T>(items: T[], distance: (item: T) => number): T | null {
  return items.reduce<T | null>(
    (best, item) =>
      best === null || distance(item) < distance(best) ? item : best,
    null,
  );
}

/**
 * The model reports ISO years; the page often prints only 月日. Anchoring the
 * deterministic pass on a year the model itself reported keeps the two in the
 * same frame, so a match fails only on a real disagreement. Falls back to a
 * placeholder when the model reports no dates at all — in that case no date
 * comparison runs and the value is never read.
 */
function inferReferenceYear(vision: VisionResult): number {
  const iso =
    vision.dates.find((d) => /^\d{4}-/.test(d.iso))?.iso ??
    vision.obligations.find((o) => o.dueDate && /^\d{4}-/.test(o.dueDate.iso))
      ?.dueDate?.iso;
  return iso ? Number(iso.slice(0, 4)) : 1970;
}

/**
 * Verifies every obligation's date and amount against the document text.
 * Nothing is dropped and nothing is corrected: a disagreement is surfaced
 * on the obligation and left for the user to adjudicate. Returns new
 * objects; the input is never touched.
 */
export function crossCheck(vision: VisionResult, now: Date = new Date()): Obligation[] {
  // A page that prints no full date gives the model nothing to read a year
  // from, so its year is a guess. Resolve the bare 月日 against the clock
  // instead, and a wrong year becomes a visible conflict rather than a match.
  const pageHasYear = collectDates(toAscii(vision.rawText)).some((m) => m.year !== null);
  const dates = pageHasYear
    ? parseJapaneseDates(vision.rawText, inferReferenceYear(vision))
    : parseJapaneseDates(vision.rawText, now.getFullYear(), now);
  const amounts = parseJapaneseAmounts(vision.rawText);

  return vision.obligations.map((ob) => {
    // Only one conflict slot exists, and a wrong deadline costs more than a
    // wrong figure, so the date takes precedence when both disagree.
    if (ob.dueDate && !dates.some((d) => d.iso === ob.dueDate?.iso)) {
      const target = isoMs(ob.dueDate.iso);
      const near = nearest(dates, (d) => Math.abs(isoMs(d.iso) - target));
      return {
        ...ob,
        conflict: {
          field: "dueDate" as const,
          modelSaw: showDate(ob.dueDate),
          documentSaid: near ? showDate(near) : NOT_FOUND,
        },
      };
    }
    if (ob.amount && !amounts.some((a) => a.yen === ob.amount?.yen)) {
      const target = ob.amount.yen;
      const near = nearest(amounts, (a) => Math.abs(a.yen - target));
      return {
        ...ob,
        conflict: {
          field: "amount" as const,
          modelSaw: showAmount(ob.amount),
          documentSaid: near ? showAmount(near) : NOT_FOUND,
        },
      };
    }
    return { ...ob, conflict: null };
  });
}
