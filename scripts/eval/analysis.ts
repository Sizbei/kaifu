/**
 * Deterministic Japanese register analysis and the flags derived from it.
 *
 * These count honorific *markers*. They cannot tell whether a marker points
 * at the right person — that judgement is the native reviewer's.
 */

import type { RegisterId } from "@/lib/types";

/* ------------------------------ endings ---------------------------- */

type Ending = "polite" | "plain" | "neutral";

/**
 * Sentence-final politeness. Japanese uses plain forms mid-sentence (relative
 * clauses, subordinate clauses) even in the most formal writing, so only the
 * sentence-final predicate carries register information.
 */
function classifyEnding(sentence: string): Ending {
  const s = sentence.replace(/[」』）)】\]”"'。、\s　]+$/g, "");
  if (!s) return "neutral";
  if (/(?:です|ます|ました|ません|でした|ましょ|ませ|でしょう|ください|下さい)$/.test(s)) return "polite";
  if (/(?:だ|である|だった|であった|た|ない|なかった|る|う|く|ぐ|す|つ|ぬ|ぶ|む|よ|ね|な|さ|ん|かな|ろう)$/.test(s)) return "plain";
  return "neutral";
}

function splitSentences(text: string): string[] {
  return text
    .split(/[。！？!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/* ------------------------------ patterns --------------------------- */

const SONKEIGO_PATTERNS: readonly RegExp[] = [
  /いらっしゃ/g,
  /おっしゃ/g,
  /ご覧/g,
  /召し上が/g,
  /なさ(?:い|る|っ|れ|ら|いま)/g,
  /(?:くださ|下さ)(?:い|る|いま|れ)/g,
  /お[ぁ-ゖァ-ヺ一-龯]{1,4}(?:になら|になり|になる|になっ|くださ)/g,
  /ご[一-龯]{1,4}(?:になら|になり|になる|くださ|いただ)/g,
  /賜(?:り|る|わ)/g,
  /(?:ご多忙|お忙しい|ご高配|ご厚情|ご配慮|ご了承|ご理解)/g,
  /(?:貴|御)(?:社|校|園|殿|台|行)/g,
];

const KENJOUGO_PATTERNS: readonly RegExp[] = [
  /(?:いた|致)し/g,
  /申し上げ/g,
  /申し(?!上げ)/g,
  /伺(?:い|う|っ|わ)/g,
  /拝(?:見|聴|受|読|借|察)/g,
  /存じ/g,
  /承(?:り|る|知|っ)/g,
  /頂戴/g,
  /させて(?:いただ|頂)/g,
  /(?:いただ|頂)(?:き|く|け|い|ま)/g,
  /おり(?:ま|、)/g,
  /参り/g,
  /お[ぁ-ゖァ-ヺ一-龯]{1,4}(?:いたし|申し上げ)/g,
  /(?:弊社|小社|当方|小生)/g,
];

// Hard letter-form markers: legitimate ONLY in 最敬語.
const LETTER_HARD_PATTERNS: readonly RegExp[] = [
  /拝啓/g, /敬具/g, /謹啓/g, /謹白/g, /前略/g, /草々/g,
  /時下/g, /の候/g, /のみぎり/g, /ご清栄/g, /ご清祥/g, /ご健勝/g,
];

// Soft formality markers: elevated, but legitimate in business 敬語 too.
const SOFT_FORMALITY_PATTERNS: readonly RegExp[] = [
  /何卒/g,
  /(?:平素|日頃)(?:は|より)/g,
  /(?:まずは|略儀ながら)/g,
  /(?:誠に|甚だ)/g,
  /(?:お願い申し上げ|申し上げます)/g,
];

const SEASONAL_GREETING =
  /(?:時下|の候|のみぎり|ご清栄|ご清祥|ご健勝|春暖|陽春|新緑|盛夏|残暑|初秋|晩秋|向寒|厳寒|酷暑|立春)/;

const BIKAGO = /(?:お|ご|御)[一-龯]/g;

const LATIN_RUN = /[A-Za-z][A-Za-z'’\-.]*/g;
const GENERAL_LATIN_ALLOWLIST: ReadonlySet<string> = new Set([
  "PTA", "LINE", "FAX", "TEL", "URL", "ID", "ATM", "JR", "NHK", "No", "OK", "Wi", "Fi",
]);

const META_JA_PATTERNS: readonly RegExp[] = [
  /※/g,
  /注[：:]/g,
  /(?:ご)?調整(?:して)?ください/g,
  /(?:ご)?修正(?:して)?ください/g,
  /置き換えて/g,
  /参考にしてください/g,
  /(?:または|あるいは)、?より丁寧/g,
  /状況に応じて(?:使い分け|お選び)/g,
  /必要に応じて(?:変更|修正|追加)/g,
];

const META_EN_PATTERNS: readonly RegExp[] = [
  /let me know/gi,
  /if you(?:'d| would)? (?:like|want|prefer)/gi,
  /feel free/gi,
  /adjust(?:ed|ment|ments)?\b/gi,
  /\bnote:/gi,
  /here(?:'s| is| are)\b/gi,
  /\btranslation\b/gi,
  /\bversion\b/gi,
];

interface MatchCount {
  readonly total: number;
  readonly found: readonly string[];
}

function countMatches(text: string, patterns: readonly RegExp[]): MatchCount {
  const found: string[] = [];
  let total = 0;
  for (const re of patterns) {
    const hits = text.match(re);
    if (hits) {
      total += hits.length;
      found.push(...hits);
    }
  }
  return { total, found: [...new Set(found)] };
}

/* ------------------------------ analysis --------------------------- */

export interface Analysis {
  readonly chars: number;
  readonly sentenceCount: number;
  readonly politeRatio: number;
  readonly politeEndings: number;
  readonly plainEndings: number;
  readonly sonkeigo: number;
  readonly sonkeigoFound: readonly string[];
  readonly kenjougo: number;
  readonly letterHard: number;
  readonly letterHardFound: readonly string[];
  readonly bikagoPer100: number;
  readonly hasSeasonalGreeting: boolean;
  readonly hasOpeningWord: boolean;
  readonly hasClosingWord: boolean;
  readonly latin: readonly string[];
  readonly meta: readonly string[];
  readonly formality: number;
}

export function analyse(text: string, latinAllowed: readonly string[]): Analysis {
  const chars = text.replace(/\s/g, "").length;
  const sentences = splitSentences(text);
  const endings = sentences.map(classifyEnding);
  const polite = endings.filter((e) => e === "polite").length;
  const plain = endings.filter((e) => e === "plain").length;
  const classified = polite + plain;

  const sonkeigo = countMatches(text, SONKEIGO_PATTERNS);
  const kenjougo = countMatches(text, KENJOUGO_PATTERNS);
  const letterHard = countMatches(text, LETTER_HARD_PATTERNS);
  const soft = countMatches(text, SOFT_FORMALITY_PATTERNS);
  const bikagoHits = (text.match(BIKAGO) ?? []).length;
  const bikagoPer100 = chars > 0 ? (bikagoHits / chars) * 100 : 0;

  const allow = new Set([...GENERAL_LATIN_ALLOWLIST, ...latinAllowed]);
  const latin = (text.match(LATIN_RUN) ?? []).filter(
    (w) => w.length > 1 && !allow.has(w) && !allow.has(w.toUpperCase()),
  );

  const politeRatio = classified > 0 ? polite / classified : 0;

  // Weights are tuned so each rung of the ladder has headroom above the one
  // below it. Hard letter-form markers are worth the most and are legitimate
  // only in 最敬語, which is what separates it from business 敬語; 謙譲語 gets a
  // high cap because formal writing stacks humble forms densely.
  const formality =
    politeRatio * 25 +
    (Math.min(sonkeigo.total, 4) / 4) * 12 +
    (Math.min(kenjougo.total, 10) / 10) * 23 +
    (Math.min(bikagoPer100, 6) / 6) * 12 +
    (Math.min(soft.total, 4) / 4) * 8 +
    (Math.min(letterHard.total, 4) / 4) * 20;

  return {
    chars,
    sentenceCount: sentences.length,
    politeRatio,
    politeEndings: polite,
    plainEndings: plain,
    sonkeigo: sonkeigo.total,
    sonkeigoFound: sonkeigo.found,
    kenjougo: kenjougo.total,
    letterHard: letterHard.total,
    letterHardFound: letterHard.found,
    bikagoPer100,
    hasSeasonalGreeting: SEASONAL_GREETING.test(text),
    hasOpeningWord: /(?:拝啓|謹啓|前略)/.test(text),
    hasClosingWord: /(?:敬具|謹白|草々)/.test(text),
    latin,
    meta: [...countMatches(text, META_JA_PATTERNS).found, ...countMatches(text, META_EN_PATTERNS).found],
    formality: Math.round(formality * 10) / 10,
  };
}

// Character-bigram Dice coefficient: near-1 means the two renderings are the
// same text, i.e. the register slider moved but nothing visible happened.
function bigramCounts(text: string): Map<string, number> {
  const t = text.replace(/[\s　。、！？!?,.「」『』（）()]/g, "");
  const map = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i += 1) {
    const g = t.slice(i, i + 2);
    map.set(g, (map.get(g) ?? 0) + 1);
  }
  return map;
}

export function diceSimilarity(a: string, b: string): number {
  const A = bigramCounts(a);
  const B = bigramCounts(b);
  let totalA = 0;
  let totalB = 0;
  let inter = 0;
  for (const v of A.values()) totalA += v;
  for (const v of B.values()) totalB += v;
  for (const [k, v] of A) inter += Math.min(v, B.get(k) ?? 0);
  return totalA + totalB === 0 ? 0 : (2 * inter) / (totalA + totalB);
}

/* ------------------------------- flags ----------------------------- */

export const NEAR_IDENTICAL_THRESHOLD = 0.8;
export const MIN_FORMALITY_GAIN = 4;

export type Severity = "error" | "warn";

export interface Flag {
  readonly code: string;
  readonly severity: Severity;
  readonly detail: string;
  readonly register: string;
}

const flag = (code: string, severity: Severity, detail: string, register: string): Flag => ({
  code, severity, detail, register,
});

export function flagRegister(key: RegisterId, a: Analysis): Flag[] {
  const flags: Flag[] = [];
  const needsPolite = key !== "casual";

  if (a.chars === 0) return [flag("EMPTY_OUTPUT", "error", "no Japanese text produced", key)];

  if (needsPolite && a.plainEndings > 0) {
    flags.push(flag("PLAIN_IN_POLITE", "error",
      `${a.plainEndings}/${a.plainEndings + a.politeEndings} sentence-final predicates are plain form`, key));
  }
  if (key === "casual" && a.politeRatio > 0.25) {
    flags.push(flag("POLITE_IN_CASUAL", "error", `${Math.round(a.politeRatio * 100)}% です・ます endings in カジュアル`, key));
  }
  if (key !== "formal" && a.letterHard > 0) {
    flags.push(flag("LETTER_FRAME_BELOW_FORMAL", "error", `letter-form markers in ${key}: ${a.letterHardFound.join(" ")}`, key));
  }
  if (key === "casual" && a.sonkeigo + a.kenjougo >= 3) {
    flags.push(flag("KEIGO_IN_CASUAL", "warn", `${a.sonkeigo + a.kenjougo} honorific markers in カジュアル`, key));
  }
  if ((key === "keigo" || key === "formal") && a.sonkeigo === 0) {
    flags.push(flag("NO_SONKEIGO", "error", "zero 尊敬語 markers", key));
  }
  if ((key === "keigo" || key === "formal") && a.kenjougo === 0) {
    flags.push(flag("NO_KENJOUGO", "error", "zero 謙譲語 markers", key));
  }
  if (key === "formal" && !(a.hasOpeningWord && a.hasClosingWord)) {
    flags.push(flag("MISSING_LETTER_FRAME", "warn",
      `頭語 ${a.hasOpeningWord ? "ok" : "missing"} / 結語 ${a.hasClosingWord ? "ok" : "missing"}`, key));
  }
  if (key === "formal" && !a.hasSeasonalGreeting) {
    flags.push(flag("NO_SEASONAL_GREETING", "warn", "時候の挨拶 absent from 最敬語", key));
  }
  if (a.latin.length > 0) {
    flags.push(flag("LATIN_IN_TEXT", "error", `Latin text in textJa: ${a.latin.slice(0, 6).join(" ")}`, key));
  }
  if (a.meta.length > 0) {
    flags.push(flag("META_COMMENTARY", "error", `commentary markers: ${a.meta.slice(0, 6).join(" ")}`, key));
  }
  return flags;
}

export interface PairResult {
  readonly lower: RegisterId;
  readonly upper: RegisterId;
  readonly similarity: number;
  readonly formalityGain: number;
  readonly charDelta: number;
  readonly flags: readonly Flag[];
}

export function flagPair(lower: RegisterId, upper: RegisterId, lo: Analysis, hi: Analysis, similarity: number): Flag[] {
  const step = `${lower}→${upper}`;
  const flags: Flag[] = [];
  const gain = hi.formality - lo.formality;
  if (similarity >= NEAR_IDENTICAL_THRESHOLD) {
    flags.push(flag("NEAR_IDENTICAL", "error", `${step} bigram similarity ${similarity.toFixed(2)}`, step));
  }
  if (gain < MIN_FORMALITY_GAIN) {
    flags.push(flag("NO_FORMALITY_GAIN", "warn", `${step} formality moved only ${gain.toFixed(1)} pts`, step));
  }
  if (hi.chars < lo.chars) {
    flags.push(flag("LENGTH_INVERSION", "warn", `${upper} (${hi.chars}字) shorter than ${lower} (${lo.chars}字)`, step));
  }
  return flags;
}
