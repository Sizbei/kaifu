#!/usr/bin/env -S npx tsx
/**
 * KAIFŪ register evaluation harness.
 *
 * Generates the same reply at four Japanese politeness registers for a suite of
 * realistic scenarios, scores register separation with deterministic Japanese
 * linguistic checks, and emits docs/register-eval.md as a mark-up sheet for a
 * native-speaker reviewer.
 *
 * It drives the REAL register engine — `streamRegisters` in src/lib/shisa.ts,
 * which reads its prompts from src/lib/prompts — so the numbers describe what
 * the app ships: one completion per register, the app's temperature, the
 * gloss split and the meta-commentary stripping included. Run with
 * `pnpm eval:registers [--runs N]`. Scenarios run one at a time, so exactly
 * four requests are ever in flight.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { streamRegisters } from "@/lib/shisa";
import {
  REGISTERS,
  type DocType,
  type RegisterId,
  type ReplyEvent,
  type ReplyRequest,
} from "@/lib/types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = resolve(ROOT, "docs/register-eval.md");
const MAX_ATTEMPTS = 3;
const SCENARIO_TIMEOUT_MS = 240_000;

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/** Fill process.env from .env.local without overriding anything already set. */
function loadEnvLocal(): void {
  const path = resolve(ROOT, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

interface Config {
  readonly model: string;
  readonly host: string;
  readonly runs: number;
}

function readConfig(): Config {
  loadEnvLocal();
  const baseUrl = process.env.SHISA_BASE_URL;
  const model = process.env.SHISA_MODEL;
  const missing = [
    !baseUrl && "SHISA_BASE_URL",
    !process.env.SHISA_API_KEY && "SHISA_API_KEY",
    !model && "SHISA_MODEL",
  ].filter((k): k is string => typeof k === "string");

  if (missing.length > 0 || !baseUrl || !model) {
    console.error(
      `\nMissing required environment variable(s): ${missing.join(", ")}\n\n` +
        `Set them in ${resolve(ROOT, ".env.local")} (see .env.example).\n` +
        `This harness only evaluates the Japan-hosted Shisa endpoint. There is no\n` +
        `fallback provider: KAIFŪ guarantees Japan-hosted inference for Japanese\n` +
        `generation, so a run against any other gateway would be meaningless.\n`,
    );
    process.exit(1);
  }

  const runsArg = process.argv.indexOf("--runs");
  const runs = runsArg === -1 ? 1 : Math.max(1, Number.parseInt(process.argv[runsArg + 1] ?? "1", 10) || 1);
  return { model, host: new URL(baseUrl).host, runs };
}

// ---------------------------------------------------------------------------
// Registers
// ---------------------------------------------------------------------------

const REGISTER_KEYS: readonly RegisterId[] = REGISTERS.map((r) => r.id);
const ADJACENT_PAIRS: readonly (readonly [RegisterId, RegisterId])[] = [
  ["casual", "polite"],
  ["polite", "keigo"],
  ["keigo", "formal"],
];

const jaOf = (id: RegisterId): string => REGISTERS.find((r) => r.id === id)?.ja ?? id;
const enOf = (id: RegisterId): string => REGISTERS.find((r) => r.id === id)?.en ?? id;

// ---------------------------------------------------------------------------
// Scenarios: KAIFŪ's actual use cases. Each is a document a resident of Japan
// receives and must answer, where getting the register wrong has real cost.
// ---------------------------------------------------------------------------

interface Scenario {
  readonly id: string;
  readonly label: string;
  readonly recipient: string;
  readonly document: string;
  readonly intent: string;
  readonly docType: DocType;
  readonly latinAllowed: readonly string[];
}

const SCENARIOS: readonly Scenario[] = [
  {
    id: "allergy-teacher",
    label: "Child's food allergy — homeroom teacher",
    recipient: "小学一年生の担任の先生（初めて連絡する）",
    document: "小学校から配布された「給食申込書・食物アレルギー調査票」。提出期限は今週金曜日。",
    intent:
      "子どもに落花生とくるみの重いアレルギーがあること、誤食すると救急搬送が必要になること、給食での除去対応をお願いしたいこと、必要なら診断書を提出できることを伝える。",
    docType: "school_notice",
    latinAllowed: [],
  },
  {
    id: "pta-decline",
    label: "Declining a PTA committee request",
    recipient: "PTA本部役員（面識はあるが親しくはない保護者）",
    document: "PTAから届いた「来年度学級委員のお願い」。引き受けるか辞退するかを返信する必要がある。",
    intent:
      "平日の日中は仕事で在宅できず、月例の集まりに継続して出席できないため、来年度の学級委員は辞退したいと伝える。断りつつ、可能な範囲で行事の当日手伝いには協力したいと添える。",
    docType: "school_notice",
    latinAllowed: ["PTA"],
  },
  {
    id: "ward-tax",
    label: "Ward office — clarify a residence tax bill",
    recipient: "区役所 税務課の担当者",
    document: "区役所から届いた住民税の納税通知書。前年より税額が大幅に上がっており、内訳が理解できない。",
    intent:
      "昨年度と比べて税額が約二倍になっている理由を確認したい。算定の内訳（所得の区分と控除の適用状況）を教えてほしい。窓口に行くべきか、電話や郵送で確認できるかも知りたい。",
    docType: "ward_tax_letter",
    latinAllowed: [],
  },
  {
    id: "deposit-dispute",
    label: "Disputing a deposit deduction with a landlord",
    recipient: "退去した賃貸物件の大家（管理会社を通さず直接やり取りしている）",
    document: "退去後に届いた敷金精算書。敷金二十万円のうち十八万円が原状回復費として差し引かれている。",
    intent:
      "クロスの張り替えと床の補修は経年劣化にあたり、国土交通省のガイドラインでは借主負担にならないはずだと伝える。内訳の明細と写真の提示を求め、金額の再計算をお願いする。感情的にならず、しかし引き下がらない姿勢で。",
    docType: "lease_clause",
    latinAllowed: [],
  },
  {
    id: "school-absence",
    label: "Notifying school of an absence",
    recipient: "子どもの通う小学校の担任の先生",
    document: "学校の欠席連絡フォーム。当日の朝八時までに連絡する必要がある。",
    intent:
      "子どもが昨夜から三十八度五分の熱を出しており、本日は欠席させること、これから小児科を受診すること、インフルエンザだった場合は改めて連絡することを伝える。",
    docType: "school_notice",
    latinAllowed: [],
  },
  {
    id: "neighbour-noise",
    label: "Asking a neighbour about late-night noise",
    recipient: "同じマンションの上階に住む隣人（挨拶程度の面識のみ）",
    document: "直接の文書はない。上階から深夜零時過ぎに続く物音について、投函する手紙を書く。",
    intent:
      "平日の深夜零時から二時ごろに響く物音で、子どもが起きてしまうことを伝える。責める意図はなく、時間帯を少し配慮してもらえないかとお願いする。関係を壊さないことが最優先。",
    docType: "unknown",
    latinAllowed: [],
  },
  {
    id: "payment-extension",
    label: "Requesting a payment extension",
    recipient: "国民健康保険料を担当する市役所 保険年金課",
    document: "市役所から届いた国民健康保険料の督促状。納期限を二週間過ぎている。",
    intent:
      "転職の間に収入が途切れたため、今月末までの一括納付が難しいこと、来月から三回に分けての分割納付を希望すること、支払う意思はあることを伝え、相談の窓口と必要書類を尋ねる。",
    docType: "ward_tax_letter",
    latinAllowed: [],
  },
  {
    id: "appliance-repair",
    label: "Asking a landlord to fix a broken appliance",
    recipient: "賃貸マンションの管理会社の担当者",
    document: "賃貸借契約書に「設備の故障は速やかに管理会社へ連絡すること」とある。",
    intent:
      "備え付けのエアコンが三日前から冷風を出さなくなったこと、室温が三十四度に達し乳児がいるため早急に対応してほしいこと、修理業者の手配と訪問可能な日程を知らせてほしいことを伝える。",
    docType: "lease_clause",
    latinAllowed: [],
  },
  {
    id: "bank-resubmission",
    label: "Bank — rejected form, asking what to correct",
    recipient: "取引銀行の窓口担当者",
    document: "銀行から返送された口座名義変更の申請書。「記入不備のため再提出をお願いします」とだけ書かれている。",
    intent:
      "どの欄がどのように不備なのかを具体的に教えてほしいこと、届出印は変更していないこと、再提出の期限があるなら知らせてほしいことを伝える。",
    docType: "unknown",
    latinAllowed: [],
  },
  {
    id: "clinic-reschedule",
    label: "Rescheduling a clinic appointment",
    recipient: "通院している耳鼻科クリニックの受付",
    document: "クリニックから届いた予約確認のはがき。来週火曜日の午後二時に予約が入っている。",
    intent:
      "仕事の都合で来週火曜日に伺えなくなったため、予約を翌週の同じ時間帯に変更したいこと、直前のキャンセルになって申し訳ないこと、変更が難しければ空いている日を教えてほしいことを伝える。",
    docType: "unknown",
    latinAllowed: [],
  },
];

// ---------------------------------------------------------------------------
// Japanese linguistic analysis
// ---------------------------------------------------------------------------

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

interface Analysis {
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

function analyse(text: string, latinAllowed: readonly string[]): Analysis {
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

function diceSimilarity(a: string, b: string): number {
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

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

const NEAR_IDENTICAL_THRESHOLD = 0.8;
const MIN_FORMALITY_GAIN = 4;

type Severity = "error" | "warn";

interface Flag {
  readonly code: string;
  readonly severity: Severity;
  readonly detail: string;
  readonly register: string;
}

const flag = (code: string, severity: Severity, detail: string, register: string): Flag => ({
  code, severity, detail, register,
});

function flagRegister(key: RegisterId, a: Analysis): Flag[] {
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

interface PairResult {
  readonly lower: RegisterId;
  readonly upper: RegisterId;
  readonly similarity: number;
  readonly formalityGain: number;
  readonly charDelta: number;
  readonly flags: readonly Flag[];
}

function flagPair(lower: RegisterId, upper: RegisterId, lo: Analysis, hi: Analysis, similarity: number): Flag[] {
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

// ---------------------------------------------------------------------------
// Generation — through the app's own register engine.
// ---------------------------------------------------------------------------

interface Generated {
  readonly texts: Readonly<Record<RegisterId, string>>;
  readonly glosses: Readonly<Record<RegisterId, string>>;
  readonly errors: readonly string[];
}

const emptyByRegister = (): Record<RegisterId, string> => ({ casual: "", polite: "", keigo: "", formal: "" });

async function generateOnce(scenario: Scenario): Promise<Generated> {
  const req: ReplyRequest = {
    intent: scenario.intent,
    recipient: scenario.recipient,
    docType: scenario.docType,
    documentSummary: scenario.document,
  };
  const texts = emptyByRegister();
  const glosses = emptyByRegister();
  const errors: string[] = [];
  const onEvent = (e: ReplyEvent): void => {
    if (e.type === "delta") texts[e.register] += e.text;
    else if (e.type === "gloss") glosses[e.register] = e.glossEn;
    else if (e.type === "error") errors.push(`${e.register}: ${e.message}`);
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCENARIO_TIMEOUT_MS);
  try {
    await streamRegisters(req, onEvent, controller.signal);
  } finally {
    clearTimeout(timer);
  }
  if (controller.signal.aborted) errors.push("scenario timed out");
  return { texts, glosses, errors };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function generate(scenario: Scenario): Promise<Generated> {
  let last: Generated | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    last = await generateOnce(scenario);
    if (last.errors.length === 0) return last;
    if (attempt < MAX_ATTEMPTS) await sleep(/429|rate/i.test(last.errors.join(" ")) ? 6000 * attempt : 1500 * attempt);
  }
  if (!last) throw new Error("unreachable: no attempt ran");
  return last;
}

// ---------------------------------------------------------------------------
// Scenario run
// ---------------------------------------------------------------------------

interface RegisterResult {
  readonly text: string;
  readonly gloss: string;
  readonly analysis: Analysis;
  readonly flags: readonly Flag[];
}

interface ScenarioOk {
  readonly ok: true;
  readonly scenario: Scenario;
  readonly registers: Readonly<Record<RegisterId, RegisterResult>>;
  readonly pairs: readonly PairResult[];
  readonly allFlags: readonly Flag[];
  readonly errorCount: number;
  readonly warnCount: number;
  readonly durationMs: number;
}

interface ScenarioFailed {
  readonly ok: false;
  readonly scenario: Scenario;
  readonly error: string;
  readonly durationMs: number;
}

type ScenarioResult = ScenarioOk | ScenarioFailed;

async function runScenario(scenario: Scenario): Promise<ScenarioResult> {
  const started = Date.now();
  try {
    const gen = await generate(scenario);
    if (gen.errors.length > 0) {
      return { ok: false, scenario, error: gen.errors.join("; "), durationMs: Date.now() - started };
    }

    const build = (key: RegisterId): RegisterResult => {
      const text = gen.texts[key].trim();
      const analysis = analyse(text, scenario.latinAllowed);
      return { text, gloss: gen.glosses[key], analysis, flags: flagRegister(key, analysis) };
    };
    const registers: Record<RegisterId, RegisterResult> = {
      casual: build("casual"), polite: build("polite"), keigo: build("keigo"), formal: build("formal"),
    };

    const pairs = ADJACENT_PAIRS.map(([lower, upper]): PairResult => {
      const similarity = diceSimilarity(registers[lower].text, registers[upper].text);
      const lo = registers[lower].analysis;
      const hi = registers[upper].analysis;
      return {
        lower, upper, similarity,
        formalityGain: hi.formality - lo.formality,
        charDelta: hi.chars - lo.chars,
        flags: flagPair(lower, upper, lo, hi, similarity),
      };
    });

    const allFlags = [...REGISTER_KEYS.flatMap((k) => registers[k].flags), ...pairs.flatMap((p) => p.flags)];
    return {
      ok: true, scenario, registers, pairs, allFlags,
      errorCount: allFlags.filter((f) => f.severity === "error").length,
      warnCount: allFlags.filter((f) => f.severity === "warn").length,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return { ok: false, scenario, error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - started };
  }
}

// ---------------------------------------------------------------------------
// Per-run statistics — the numbers the tuning loop steers by.
// ---------------------------------------------------------------------------

interface PairStat {
  readonly lower: RegisterId;
  readonly upper: RegisterId;
  readonly meanSim: number;
  readonly meanGain: number;
  readonly collapses: number;
  readonly flat: number;
  readonly n: number;
}

interface RunStats {
  readonly total: number;
  readonly okCount: number;
  readonly clean: number;
  readonly passRate: number;
  /** Scenarios whose カジュアル rendering is plain form (no POLITE_IN_CASUAL). */
  readonly casualPlain: number;
  /** Scenarios whose 敬語 rendering carries at least one 尊敬語 marker. */
  readonly keigoSonkeigo: number;
  readonly formalSonkeigo: number;
  readonly nearIdentical: number;
  readonly registerErrors: Readonly<Record<RegisterId, number>>;
  readonly codeCounts: ReadonlyMap<string, number>;
  readonly pairStats: readonly PairStat[];
  readonly failed: readonly ScenarioFailed[];
  readonly worstScenario: ScenarioOk | null;
}

const isOk = (r: ScenarioResult): r is ScenarioOk => r.ok;
const isFailed = (r: ScenarioResult): r is ScenarioFailed => !r.ok;

function computeStats(results: readonly ScenarioResult[]): RunStats {
  const ok = results.filter(isOk);
  const failed = results.filter(isFailed);
  const clean = ok.filter((r) => r.errorCount === 0).length;

  const registerErrors: Record<RegisterId, number> = { casual: 0, polite: 0, keigo: 0, formal: 0 };
  const codeCounts = new Map<string, number>();
  for (const r of ok) {
    for (const f of r.allFlags) {
      codeCounts.set(f.code, (codeCounts.get(f.code) ?? 0) + 1);
      if (f.severity === "error" && (REGISTER_KEYS as readonly string[]).includes(f.register)) {
        registerErrors[f.register as RegisterId] += 1;
      }
    }
  }

  const lacks = (r: ScenarioOk, key: RegisterId, code: string): boolean =>
    !r.registers[key].flags.some((f) => f.code === code);

  const pairStats = ADJACENT_PAIRS.map(([lower, upper]): PairStat => {
    const rows = ok.flatMap((r) => r.pairs.filter((p) => p.lower === lower && p.upper === upper));
    const n = rows.length || 1;
    return {
      lower, upper,
      meanSim: rows.reduce((s, p) => s + p.similarity, 0) / n,
      meanGain: rows.reduce((s, p) => s + p.formalityGain, 0) / n,
      collapses: rows.filter((p) => p.similarity >= NEAR_IDENTICAL_THRESHOLD).length,
      flat: rows.filter((p) => p.formalityGain < MIN_FORMALITY_GAIN).length,
      n: rows.length,
    };
  });

  return {
    total: results.length,
    okCount: ok.length,
    clean,
    passRate: results.length ? (clean / results.length) * 100 : 0,
    casualPlain: ok.filter((r) => lacks(r, "casual", "POLITE_IN_CASUAL")).length,
    keigoSonkeigo: ok.filter((r) => lacks(r, "keigo", "NO_SONKEIGO")).length,
    formalSonkeigo: ok.filter((r) => lacks(r, "formal", "NO_SONKEIGO")).length,
    nearIdentical: codeCounts.get("NEAR_IDENTICAL") ?? 0,
    registerErrors,
    codeCounts,
    pairStats,
    failed,
    worstScenario: ok.length ? ok.reduce((a, b) => (b.errorCount > a.errorCount ? b : a)) : null,
  };
}

interface Run {
  readonly index: number;
  readonly results: readonly ScenarioResult[];
  readonly stats: RunStats;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const cell = (text: string): string =>
  text ? text.replace(/\|/g, "\\|").replace(/\n/g, "<br>") : "_(empty)_";

const flagList = (flags: readonly Flag[]): string =>
  flags.length === 0 ? "—" : flags.map((f) => `\`${f.code}\``).join(" ");

const signed = (n: number, digits = 1): string => `${n >= 0 ? "+" : ""}${n.toFixed(digits)}`;

function reportHeader(L: string[], runs: readonly Run[], config: Config, startedAt: Date): void {
  const last = runs[runs.length - 1];
  L.push("# KAIFŪ register evaluation", "");
  L.push(
    "Generated by `scripts/eval-registers.ts`. Each scenario is a real document a resident of Japan " +
      "receives and must answer. The harness drives the app's own register engine (`streamRegisters` in " +
      "`src/lib/shisa.ts`, prompts from `src/lib/prompts`): four independent completions per scenario, " +
      "exactly as the product makes them, so the only variable across the four drafts is the register prompt.",
    "",
  );
  L.push("| Run | |", "|---|---|");
  L.push(`| Generated | ${startedAt.toISOString()} |`);
  L.push(`| Model | \`${config.model}\` |`);
  L.push(`| Endpoint host | \`${config.host}\` (Japan-hosted) |`);
  L.push(`| Scenarios | ${last.results.length} × ${runs.length} run${runs.length === 1 ? "" : "s"} |`);
  L.push("| Temperature | app default (`REGISTER_TEMPERATURE` in `src/lib/shisa.ts`) |", "");
}

function reportReviewerGuide(L: string[]): void {
  L.push("## For the native reviewer", "");
  L.push(
    "You do not need to read the code or the scores. For each of the four drafts in every scenario, " +
      "fill the **Verdict** column with one mark and add a short note if it is not ✓:",
    "",
  );
  L.push("| Mark | Meaning |", "|---|---|");
  L.push("| ✓ | Natural. A native speaker could send this to this recipient as-is. |");
  L.push("| △ | Stilted or awkward, but the politeness level is right. Say what you would change. |");
  L.push("| ✗ | Wrong register — too casual, too stiff, or the honorifics are misapplied (e.g. 尊敬語 used about oneself). |", "");
  L.push("### What the automatic checks cannot catch", "");
  L.push(
    "The scores below count honorific *markers*. They cannot tell whether a marker points at the right " +
      "person, which is where keigo actually goes wrong and where your eye is the only instrument. " +
      "Please watch specifically for:",
    "",
  );
  L.push("| Error class | What it looks like |", "|---|---|");
  L.push("| 尊敬語 aimed at the writer | ご参加する / ご存じなくて困っております — elevating one's own action or knowledge |");
  L.push("| 謙譲語 aimed at the recipient | 相手に対して「伺う」「拝見する」を使う |");
  L.push("| Honorifics on one's own family | お子さん / ご主人 used for the writer's own child or spouse |");
  L.push("| 二重敬語 | おっしゃられる / ご覧になられる — stacked honorifics |");
  L.push("| Wrong-person hearsay | 〜と伺っております used for the writer's own circumstances |");
  L.push("| Envelope-only formality | 最敬語 that is the 敬語 body with 拝啓/敬具 bolted on, unchanged inside |", "");
  L.push(
    "The two questions that matter most: **(a)** would you send this to *this specific recipient*, and " +
      "**(b)** is each step up the ladder a real step — does 敬語 actually read as more deferential than 丁寧, " +
      "or do they feel the same? The automatic scores below are a first pass only; they cannot judge naturalness.",
    "",
  );
}

function reportSummary(L: string[], runs: readonly Run[]): void {
  const last = runs[runs.length - 1];
  const s = last.stats;
  L.push("## Summary", "");
  if (runs.length > 1) {
    L.push("Per-run targets (temperature makes single runs noisy; read the pattern across runs):", "");
    L.push("| Run | Pass rate | カジュアル plain | 敬語 has 尊敬語 | 最敬語 has 尊敬語 | NEAR_IDENTICAL | Failed |");
    L.push("|---|---|---|---|---|---|---|");
    for (const r of runs) {
      const t = r.stats;
      L.push(`| ${r.index} | ${t.passRate.toFixed(0)}% (${t.clean}/${t.total}) | ${t.casualPlain}/${t.okCount} | ${t.keigoSonkeigo}/${t.okCount} | ${t.formalSonkeigo}/${t.okCount} | ${t.nearIdentical} | ${t.failed.length} |`);
    }
    L.push("", `The scenario detail below is from run ${last.index}.`, "");
  }
  L.push(`- **Pass rate: ${s.passRate.toFixed(0)}%** (${s.clean}/${s.total} scenarios with zero error-level flags)`);
  L.push(`- **カジュアル in plain form:** ${s.casualPlain}/${s.okCount}`);
  L.push(`- **敬語 with 尊敬語 markers:** ${s.keigoSonkeigo}/${s.okCount} · **最敬語:** ${s.formalSonkeigo}/${s.okCount}`);
  L.push(`- **NEAR_IDENTICAL across all steps:** ${s.nearIdentical}`);
  if (s.worstScenario) {
    L.push(`- **Worst scenario:** \`${s.worstScenario.scenario.id}\` — ${s.worstScenario.errorCount} errors, ${s.worstScenario.warnCount} warnings`);
  }
  const worst = REGISTER_KEYS.reduce((a, b) => (s.registerErrors[b] > s.registerErrors[a] ? b : a));
  L.push(`- **Worst register:** ${jaOf(worst)} (\`${worst}\`) — ${s.registerErrors[worst]} error-level flags across the suite`);
  L.push(`- **Meta-commentary:** ${s.codeCounts.get("META_COMMENTARY") ?? 0} occurrences`);
  if (s.failed.length > 0) L.push(`- **Generation failures:** ${s.failed.map((f) => `\`${f.scenario.id}\``).join(", ")}`);
  L.push("");

  L.push("### Are adjacent registers distinguishable?", "");
  L.push("| Step | Mean text similarity | Mean formality gain | Near-identical | No formality gain |", "|---|---|---|---|---|");
  for (const p of s.pairStats) {
    L.push(`| ${jaOf(p.lower)} → ${jaOf(p.upper)} | ${p.meanSim.toFixed(2)} | ${signed(p.meanGain)} | ${p.collapses}/${p.n} | ${p.flat}/${p.n} |`);
  }
  L.push("");
  L.push(
    `Similarity is a character-bigram Dice coefficient (1.00 = identical text). ` +
      `\`NEAR_IDENTICAL\` fires at ≥ ${NEAR_IDENTICAL_THRESHOLD.toFixed(2)}; \`NO_FORMALITY_GAIN\` fires when the ` +
      `formality index moves less than ${MIN_FORMALITY_GAIN} points. If a step shows high similarity and a flat ` +
      `index, the slider has no visible effect at that position and the demo falls flat there.`,
    "",
  );

  if (s.codeCounts.size > 0) {
    L.push("### Flag frequency", "", "| Flag | Count |", "|---|---|");
    for (const [code, count] of [...s.codeCounts].sort((a, b) => b[1] - a[1])) L.push(`| \`${code}\` | ${count} |`);
    L.push("");
  }
}

function reportScenario(L: string[], r: ScenarioResult, i: number): void {
  const s = r.scenario;
  L.push(`### ${i + 1}. \`${s.id}\` — ${s.label}`, "");
  L.push(`**送信先:** ${s.recipient}  `, `**受け取った文書:** ${s.document}  `, `**伝えたいこと:** ${s.intent}`, "");

  if (!r.ok) {
    L.push(`> **Generation failed:** ${r.error}`, "");
    return;
  }

  L.push("#### Drafts — reviewer sheet", "");
  L.push("| Register | Draft (textJa) | Verdict (✓ / △ / ✗) | Notes |", "|---|---|---|---|");
  for (const key of REGISTER_KEYS) {
    L.push(`| **${jaOf(key)}**<br>_${enOf(key)}_ | ${cell(r.registers[key].text)} |  |  |`);
  }
  L.push("");
  L.push("<details><summary>Glosses (the English teaching line shown under each draft)</summary>", "");
  for (const key of REGISTER_KEYS) L.push(`- **${jaOf(key)}** — ${r.registers[key].gloss || "_(none)_"}`);
  L.push("", "</details>", "");

  L.push("#### Automatic metrics", "");
  L.push("| Register | 字数 | 文数 | です・ます率 | 尊敬語 | 謙譲語 | 美化語/100字 | 書簡枠 | Formality | Flags |");
  L.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const key of REGISTER_KEYS) {
    const a = r.registers[key].analysis;
    L.push(`| ${jaOf(key)} | ${a.chars} | ${a.sentenceCount} | ${Math.round(a.politeRatio * 100)}% | ${a.sonkeigo} | ${a.kenjougo} | ${a.bikagoPer100.toFixed(1)} | ${a.letterHard} | **${a.formality.toFixed(1)}** | ${flagList(r.registers[key].flags)} |`);
  }
  L.push("");
  L.push("| Step | Similarity | Formality Δ | 字数 Δ | Flags |", "|---|---|---|---|---|");
  for (const p of r.pairs) {
    L.push(`| ${jaOf(p.lower)} → ${jaOf(p.upper)} | ${p.similarity.toFixed(2)} | ${signed(p.formalityGain)} | ${signed(p.charDelta, 0)} | ${flagList(p.flags)} |`);
  }
  L.push("");
  if (r.allFlags.length > 0) {
    L.push("<details><summary>Flag detail</summary>", "");
    for (const f of r.allFlags) L.push(`- \`${f.code}\` (${f.severity}) — ${f.register}: ${f.detail}`);
    L.push("", "</details>", "");
  }
}

function reportMethod(L: string[]): void {
  L.push("---", "", "## How the automatic checks work", "");
  L.push(
    "- **です・ます率** — only *sentence-final* predicates are classified. Japanese uses plain forms mid-sentence " +
      "(relative and subordinate clauses) even in the most formal writing, so a mid-sentence 〜する carries no " +
      "register information and is deliberately ignored.",
  );
  L.push("- **尊敬語** — いらっしゃる / おっしゃる / ご覧になる / なさる / 召し上がる / くださる / お〜になる / ご〜くださる / ご〜いただく / 賜る / 貴社.");
  L.push("- **謙譲語** — いたす / 申し上げる / 伺う / 拝見 / 存じる / 承る / 頂戴 / させていただく / おります / 参る / お〜いたす / 弊社.");
  L.push("- **美化語** — お・ご・御 immediately followed by a kanji, normalised per 100 characters.");
  L.push(
    "- **書簡枠** — hard letter-form markers only (拝啓 / 敬具 / 謹啓 / 謹白 / 前略 / 草々 / 時下 / 〜の候 / ご清栄). " +
      "These are legitimate **only** in 最敬語; anywhere below that they are an error. Softer markers " +
      "(何卒 / 平素より / 申し上げます) feed the formality index but are not flagged, because they are normal business 敬語.",
  );
  L.push(
    "- **Formality index (0–100)** — です・ます率 ×25 + 尊敬語 ×12 + 謙譲語 ×23 + 美化語密度 ×12 + 改まり表現 ×8 + 書簡枠 ×20, each capped. " +
      "It is a separation metric, not a quality metric: a high score means the rendering is *marked* as formal, " +
      "not that it is correct or natural. Only the native reviewer can judge that.",
    "",
  );
  L.push("### Flag reference", "", "| Flag | Severity | Meaning |", "|---|---|---|");
  const FLAG_DOCS: readonly (readonly [string, Severity, string])[] = [
    ["PLAIN_IN_POLITE", "error", "Plain-form sentence ending in a register that requires です・ます."],
    ["POLITE_IN_CASUAL", "error", "More than 25% です・ます endings in カジュアル."],
    ["LETTER_FRAME_BELOW_FORMAL", "error", "拝啓/敬具/時候の挨拶 etc. appearing below 最敬語."],
    ["NO_SONKEIGO", "error", "敬語 or 最敬語 with zero 尊敬語 markers."],
    ["NO_KENJOUGO", "error", "敬語 or 最敬語 with zero 謙譲語 markers."],
    ["LATIN_IN_TEXT", "error", "Latin characters in textJa outside the allowlist (PTA, FAX, …)."],
    ["META_COMMENTARY", "error", "English commentary or ※ trailers surviving into textJa."],
    ["NEAR_IDENTICAL", "error", `Adjacent registers ≥ ${NEAR_IDENTICAL_THRESHOLD} bigram similarity — the slider does nothing here.`],
    ["EMPTY_OUTPUT", "error", "No Japanese text produced for this register."],
    ["MISSING_LETTER_FRAME", "warn", "最敬語 lacks a 頭語/結語 pair."],
    ["NO_SEASONAL_GREETING", "warn", "最敬語 lacks a 時候の挨拶."],
    ["KEIGO_IN_CASUAL", "warn", "Three or more honorific markers in カジュアル."],
    ["NO_FORMALITY_GAIN", "warn", `Formality index moved less than ${MIN_FORMALITY_GAIN} points between adjacent registers.`],
    ["LENGTH_INVERSION", "warn", "A register is shorter than the one below it — politeness in Japanese correlates with length."],
  ];
  for (const [code, sev, desc] of FLAG_DOCS) L.push(`| \`${code}\` | ${sev} | ${desc} |`);
  L.push("");
}

function buildReport(runs: readonly Run[], config: Config, startedAt: Date): string {
  const L: string[] = [];
  reportHeader(L, runs, config, startedAt);
  reportReviewerGuide(L);
  reportSummary(L, runs);
  L.push("---", "", "## Scenarios", "");
  runs[runs.length - 1].results.forEach((r, i) => reportScenario(L, r, i));
  reportMethod(L);
  return L.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function printRunSummary(run: Run): void {
  const s = run.stats;
  console.log("\n" + "=".repeat(64));
  console.log(`Run ${run.index}`);
  console.log(`Pass rate:       ${s.passRate.toFixed(0)}%  (${s.clean}/${s.total} scenarios with zero error flags)`);
  console.log(`カジュアル plain:  ${s.casualPlain}/${s.okCount}   敬語 w/ 尊敬語: ${s.keigoSonkeigo}/${s.okCount}   最敬語 w/ 尊敬語: ${s.formalSonkeigo}/${s.okCount}   NEAR_IDENTICAL: ${s.nearIdentical}`);
  if (s.worstScenario) {
    console.log(`Worst scenario:  ${s.worstScenario.scenario.id} — ${s.worstScenario.errorCount} errors, ${s.worstScenario.warnCount} warnings`);
  }
  const flags = [...s.codeCounts].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}×${n}`).join("  ");
  console.log(`Flags:           ${flags || "none"}`);
  console.log("Adjacent register separation:");
  for (const p of s.pairStats) {
    const verdict =
      p.collapses >= p.n / 2 ? "NOT DISTINGUISHABLE"
        : p.collapses > 0 || p.flat > 0 ? `inconsistent (${p.collapses}/${p.n} collapsed)`
          : "distinguishable";
    console.log(`  ${jaOf(p.lower)} → ${jaOf(p.upper)}`.padEnd(22) + `sim ${p.meanSim.toFixed(2)}  Δformality ${signed(p.meanGain).padStart(6)}  ${verdict}`);
  }
  if (s.failed.length > 0) console.log(`Generation failures: ${s.failed.map((f) => f.scenario.id).join(", ")}`);
  console.log("=".repeat(64));
}

async function main(): Promise<void> {
  const config = readConfig();
  const startedAt = new Date();
  console.log(`Register eval — ${SCENARIOS.length} scenarios × ${REGISTERS.length} registers × ${config.runs} run(s)`);
  console.log(`Model: ${config.model} @ ${config.host}\n`);

  const runs: Run[] = [];
  for (let index = 1; index <= config.runs; index += 1) {
    if (config.runs > 1) console.log(`--- run ${index}/${config.runs} ---`);
    const results: ScenarioResult[] = [];
    for (const scenario of SCENARIOS) {
      const r = await runScenario(scenario);
      const mark = r.ok ? (r.errorCount === 0 ? "PASS" : `FAIL(${r.errorCount})`) : "ERROR";
      console.log(`  ${mark.padEnd(8)} ${scenario.id} (${(r.durationMs / 1000).toFixed(1)}s)`);
      if (!r.ok) console.log(`           ${r.error}`);
      results.push(r);
    }
    const run: Run = { index, results, stats: computeStats(results) };
    printRunSummary(run);
    runs.push(run);
  }

  writeFileSync(OUT_PATH, buildReport(runs, config, startedAt), "utf8");
  console.log(`\nReport written to ${OUT_PATH}`);
}

main().catch((err: unknown) => {
  console.error("\nEval run aborted:", err instanceof Error ? err.message : err);
  process.exit(1);
});
