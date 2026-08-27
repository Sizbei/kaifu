#!/usr/bin/env node
/**
 * KAIFU register evaluation harness.
 *
 * Generates the same reply at four Japanese politeness registers for a suite of
 * realistic scenarios, scores register separation with deterministic Japanese
 * linguistic checks, and emits docs/register-eval.md as a mark-up sheet for a
 * native-speaker reviewer.
 *
 * Standalone by design: no imports from src/, so it stays independent of the
 * application modules. Run with `pnpm eval:registers`.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = resolve(ROOT, 'docs/register-eval.md');
const CONCURRENCY = 4;
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 180_000;
const TEMPERATURE = 0.3;
const MAX_TOKENS = 2500;

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/** Fill process.env from .env.local without overriding anything already set. */
function loadEnvLocal() {
  const path = resolve(ROOT, '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
}

function readConfig() {
  loadEnvLocal();
  const baseUrl = process.env.SHISA_BASE_URL;
  const apiKey = process.env.SHISA_API_KEY;
  const model = process.env.SHISA_MODEL;
  const missing = [
    !baseUrl && 'SHISA_BASE_URL',
    !apiKey && 'SHISA_API_KEY',
    !model && 'SHISA_MODEL',
  ].filter(Boolean);

  if (missing.length > 0) {
    console.error(
      `\nMissing required environment variable(s): ${missing.join(', ')}\n\n` +
        `Set them in ${resolve(ROOT, '.env.local')} (see .env.example).\n` +
        `This harness only evaluates the Japan-hosted Shisa endpoint. There is no\n` +
        `fallback provider: KAIFU guarantees Japan-hosted inference for Japanese\n` +
        `generation, so a run against any other gateway would be meaningless.\n`,
    );
    process.exit(1);
  }

  // /v1 alone 404s on this gateway; the /openai path segment is required.
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  if (!/\/openai\/v1$/.test(baseUrl.replace(/\/+$/, ''))) {
    console.warn(
      `warning: SHISA_BASE_URL is "${baseUrl}". The gateway expects a path ending in ` +
        `/openai/v1; a plain /v1 returns 404.`,
    );
  }
  return { endpoint, apiKey, model, host: new URL(baseUrl).host };
}

// ---------------------------------------------------------------------------
// Registers
// ---------------------------------------------------------------------------

const REGISTERS = [
  { key: 'casual', ja: 'カジュアル', en: 'casual / plain form' },
  { key: 'polite', ja: '丁寧', en: 'desu-masu' },
  { key: 'keigo', ja: '敬語', en: 'business keigo' },
  { key: 'formal', ja: '最敬語', en: 'formal written' },
];
const REGISTER_KEYS = REGISTERS.map((r) => r.key);
const ADJACENT_PAIRS = [
  ['casual', 'polite'],
  ['polite', 'keigo'],
  ['keigo', 'formal'],
];

// ---------------------------------------------------------------------------
// Scenarios: KAIFU's actual use cases. Each is a document a resident of Japan
// receives and must answer, where getting the register wrong has real cost.
// ---------------------------------------------------------------------------

const SCENARIOS = [
  {
    id: 'allergy-teacher',
    label: "Child's food allergy — homeroom teacher",
    recipient: '小学一年生の担任の先生（初めて連絡する）',
    document: '小学校から配布された「給食申込書・食物アレルギー調査票」。提出期限は今週金曜日。',
    intent:
      '子どもに落花生とくるみの重いアレルギーがあること、誤食すると救急搬送が必要になること、給食での除去対応をお願いしたいこと、必要なら診断書を提出できることを伝える。',
    latinAllowed: [],
  },
  {
    id: 'pta-decline',
    label: 'Declining a PTA committee request',
    recipient: 'PTA本部役員（面識はあるが親しくはない保護者）',
    document: 'PTAから届いた「来年度学級委員のお願い」。引き受けるか辞退するかを返信する必要がある。',
    intent:
      '平日の日中は仕事で在宅できず、月例の集まりに継続して出席できないため、来年度の学級委員は辞退したいと伝える。断りつつ、可能な範囲で行事の当日手伝いには協力したいと添える。',
    latinAllowed: ['PTA'],
  },
  {
    id: 'ward-tax',
    label: 'Ward office — clarify a residence tax bill',
    recipient: '区役所 税務課の担当者',
    document: '区役所から届いた住民税の納税通知書。前年より税額が大幅に上がっており、内訳が理解できない。',
    intent:
      '昨年度と比べて税額が約二倍になっている理由を確認したい。算定の内訳（所得の区分と控除の適用状況）を教えてほしい。窓口に行くべきか、電話や郵送で確認できるかも知りたい。',
    latinAllowed: [],
  },
  {
    id: 'deposit-dispute',
    label: 'Disputing a deposit deduction with a landlord',
    recipient: '退去した賃貸物件の大家（管理会社を通さず直接やり取りしている）',
    document: '退去後に届いた敷金精算書。敷金二十万円のうち十八万円が原状回復費として差し引かれている。',
    intent:
      'クロスの張り替えと床の補修は経年劣化にあたり、国土交通省のガイドラインでは借主負担にならないはずだと伝える。内訳の明細と写真の提示を求め、金額の再計算をお願いする。感情的にならず、しかし引き下がらない姿勢で。',
    latinAllowed: [],
  },
  {
    id: 'school-absence',
    label: 'Notifying school of an absence',
    recipient: '子どもの通う小学校の担任の先生',
    document: '学校の欠席連絡フォーム。当日の朝八時までに連絡する必要がある。',
    intent:
      '子どもが昨夜から三十八度五分の熱を出しており、本日は欠席させること、これから小児科を受診すること、インフルエンザだった場合は改めて連絡することを伝える。',
    latinAllowed: [],
  },
  {
    id: 'neighbour-noise',
    label: 'Asking a neighbour about late-night noise',
    recipient: '同じマンションの上階に住む隣人（挨拶程度の面識のみ）',
    document: '直接の文書はない。上階から深夜零時過ぎに続く物音について、投函する手紙を書く。',
    intent:
      '平日の深夜零時から二時ごろに響く物音で、子どもが起きてしまうことを伝える。責める意図はなく、時間帯を少し配慮してもらえないかとお願いする。関係を壊さないことが最優先。',
    latinAllowed: [],
  },
  {
    id: 'payment-extension',
    label: 'Requesting a payment extension',
    recipient: '国民健康保険料を担当する市役所 保険年金課',
    document: '市役所から届いた国民健康保険料の督促状。納期限を二週間過ぎている。',
    intent:
      '転職の間に収入が途切れたため、今月末までの一括納付が難しいこと、来月から三回に分けての分割納付を希望すること、支払う意思はあることを伝え、相談の窓口と必要書類を尋ねる。',
    latinAllowed: [],
  },
  {
    id: 'appliance-repair',
    label: 'Asking a landlord to fix a broken appliance',
    recipient: '賃貸マンションの管理会社の担当者',
    document: '賃貸借契約書に「設備の故障は速やかに管理会社へ連絡すること」とある。',
    intent:
      '備え付けのエアコンが三日前から冷風を出さなくなったこと、室温が三十四度に達し乳児がいるため早急に対応してほしいこと、修理業者の手配と訪問可能な日程を知らせてほしいことを伝える。',
    latinAllowed: [],
  },
  {
    id: 'bank-resubmission',
    label: 'Bank — rejected form, asking what to correct',
    recipient: '取引銀行の窓口担当者',
    document: '銀行から返送された口座名義変更の申請書。「記入不備のため再提出をお願いします」とだけ書かれている。',
    intent:
      'どの欄がどのように不備なのかを具体的に教えてほしいこと、届出印は変更していないこと、再提出の期限があるなら知らせてほしいことを伝える。',
    latinAllowed: [],
  },
  {
    id: 'clinic-reschedule',
    label: 'Rescheduling a clinic appointment',
    recipient: '通院している耳鼻科クリニックの受付',
    document: 'クリニックから届いた予約確認のはがき。来週火曜日の午後二時に予約が入っている。',
    intent:
      '仕事の都合で来週火曜日に伺えなくなったため、予約を翌週の同じ時間帯に変更したいこと、直前のキャンセルになって申し訳ないこと、変更が難しければ空いている日を教えてほしいことを伝える。',
    latinAllowed: [],
  },
];

// ---------------------------------------------------------------------------
// Prompting
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = [
  'あなたは日本語の返信文を作成するアシスタントです。',
  '出力は日本語のみ。英語の説明・注釈・前置き・後書き・「※」で始まる補足を一切付けないこと。',
  '指定されたJSON以外は一文字も出力しないこと。',
].join('\n');

function buildUserPrompt(scenario) {
  return `【受け取った文書】
${scenario.document}

【返信の相手】
${scenario.recipient}

【伝えたいこと】
${scenario.intent}

上記の内容を、以下の4つの丁寧さのレベルでそれぞれ書き分けてください。
内容と情報量は同一に保ち、丁寧さのレベルだけを変えてください。

1. casual（カジュアル）: 常体（だ・である／〜する・〜した）。敬語は使わない。親しい間柄向けの短い文。
2. polite（丁寧）: です・ます体。尊敬語・謙譲語は最小限。
3. keigo（敬語）: です・ます体に加え、尊敬語（いらっしゃる、ご覧になる、なさる、お〜になる）と謙譲語（いたす、申し上げる、伺う、拝見する、お〜する）を正しく使い分けたビジネス敬語。
4. formal（最敬語）: 正式な書面。頭語（拝啓）・時候の挨拶・主文・末文・結語（敬具）を備えた書式。四つの中で最も長く、最も改まった表現にすること。

出力は次のJSONオブジェクトのみ:
{"casual":"...","polite":"...","keigo":"...","formal":"..."}

文中の改行は \\n で表現すること。JSONの前後に一切文字を書かないこと。`;
}

// ---------------------------------------------------------------------------
// Japanese linguistic analysis
// ---------------------------------------------------------------------------

/**
 * Sentence-final politeness. Japanese uses plain forms mid-sentence (relative
 * clauses, subordinate clauses) even in the most formal writing, so only the
 * sentence-final predicate carries register information.
 */
function classifyEnding(sentence) {
  const s = sentence.replace(/[」』）)】\]”"'。、\s　]+$/g, '');
  if (!s) return 'neutral';
  if (/(?:です|ます|ました|ません|でした|ましょ|ませ|でしょう|ください|下さい)$/.test(s)) return 'polite';
  if (/(?:だ|である|だった|であった|た|ない|なかった|る|う|く|ぐ|す|つ|ぬ|ぶ|む|よ|ね|な|さ|ん|かな|ろう)$/.test(s)) return 'plain';
  return 'neutral';
}

function splitSentences(text) {
  return text
    .split(/[。！？!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const SONKEIGO_PATTERNS = [
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

const KENJOUGO_PATTERNS = [
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
const LETTER_HARD_PATTERNS = [
  /拝啓/g,
  /敬具/g,
  /謹啓/g,
  /謹白/g,
  /前略/g,
  /草々/g,
  /時下/g,
  /の候/g,
  /のみぎり/g,
  /ご清栄/g,
  /ご清祥/g,
  /ご健勝/g,
];

// Soft formality markers: elevated, but legitimate in business 敬語 too.
const SOFT_FORMALITY_PATTERNS = [
  /何卒/g,
  /(?:平素|日頃)(?:は|より)/g,
  /(?:まずは|略儀ながら)/g,
  /(?:誠に|甚だ)/g,
  /(?:お願い申し上げ|申し上げます)/g,
];

const SEASONAL_GREETING = /(?:時下|の候|のみぎり|ご清栄|ご清祥|ご健勝|春暖|陽春|新緑|盛夏|残暑|初秋|晩秋|向寒|厳寒|酷暑|立春)/;

const BIKAGO = /(?:お|ご|御)[一-龯]/g;

const LATIN_RUN = /[A-Za-z][A-Za-z'’\-.]*/g;
const GENERAL_LATIN_ALLOWLIST = new Set([
  'PTA', 'LINE', 'FAX', 'TEL', 'URL', 'ID', 'ATM', 'JR', 'NHK', 'No', 'OK', 'Wi', 'Fi',
]);

const META_JA_PATTERNS = [
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

const META_EN_PATTERNS = [
  /let me know/gi,
  /if you(?:'d| would)? (?:like|want|prefer)/gi,
  /feel free/gi,
  /adjust(?:ed|ment|ments)?\b/gi,
  /\bnote:/gi,
  /here(?:'s| is| are)\b/gi,
  /\btranslation\b/gi,
  /\bversion\b/gi,
];

function countMatches(text, patterns) {
  let total = 0;
  const found = [];
  for (const re of patterns) {
    const hits = text.match(re);
    if (hits) {
      total += hits.length;
      found.push(...hits);
    }
  }
  return { total, found: [...new Set(found)] };
}

function analyse(text, latinAllowed) {
  const chars = text.replace(/\s/g, '').length;
  const sentences = splitSentences(text);
  const endings = sentences.map(classifyEnding);
  const polite = endings.filter((e) => e === 'polite').length;
  const plain = endings.filter((e) => e === 'plain').length;
  const classified = polite + plain;

  const sonkeigo = countMatches(text, SONKEIGO_PATTERNS);
  const kenjougo = countMatches(text, KENJOUGO_PATTERNS);
  const letterHard = countMatches(text, LETTER_HARD_PATTERNS);
  const soft = countMatches(text, SOFT_FORMALITY_PATTERNS);
  const bikagoHits = (text.match(BIKAGO) || []).length;
  const bikagoPer100 = chars > 0 ? (bikagoHits / chars) * 100 : 0;

  const allow = new Set([...GENERAL_LATIN_ALLOWLIST, ...(latinAllowed || [])]);
  const latin = (text.match(LATIN_RUN) || []).filter(
    (w) => w.length > 1 && !allow.has(w) && !allow.has(w.toUpperCase()),
  );

  const metaJa = countMatches(text, META_JA_PATTERNS);
  const metaEn = countMatches(text, META_EN_PATTERNS);

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
    meanSentenceChars: sentences.length ? Math.round(chars / sentences.length) : 0,
    politeEndings: polite,
    plainEndings: plain,
    politeRatio,
    sonkeigo: sonkeigo.total,
    sonkeigoFound: sonkeigo.found,
    kenjougo: kenjougo.total,
    kenjougoFound: kenjougo.found,
    letterHard: letterHard.total,
    letterHardFound: letterHard.found,
    soft: soft.total,
    bikagoPer100,
    hasSeasonalGreeting: SEASONAL_GREETING.test(text),
    hasOpeningWord: /(?:拝啓|謹啓|前略)/.test(text),
    hasClosingWord: /(?:敬具|謹白|草々)/.test(text),
    latin,
    meta: [...metaJa.found, ...metaEn.found],
    formality: Math.round(formality * 10) / 10,
  };
}

// Character-bigram Dice coefficient: near-1 means the two renderings are the
// same text, i.e. the register slider moved but nothing visible happened.
function bigramCounts(text) {
  const t = text.replace(/[\s　。、！？!?,.「」『』（）()]/g, '');
  const map = new Map();
  for (let i = 0; i < t.length - 1; i += 1) {
    const g = t.slice(i, i + 2);
    map.set(g, (map.get(g) || 0) + 1);
  }
  return map;
}

function diceSimilarity(a, b) {
  const A = bigramCounts(a);
  const B = bigramCounts(b);
  let totalA = 0;
  let totalB = 0;
  let inter = 0;
  for (const v of A.values()) totalA += v;
  for (const v of B.values()) totalB += v;
  for (const [k, v] of A) if (B.has(k)) inter += Math.min(v, B.get(k));
  return totalA + totalB === 0 ? 0 : (2 * inter) / (totalA + totalB);
}

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

const NEAR_IDENTICAL_THRESHOLD = 0.8;
const MIN_FORMALITY_GAIN = 4;

function flag(code, severity, detail) {
  return { code, severity, detail };
}

function flagRegister(registerKey, a) {
  const flags = [];
  const needsPolite = registerKey !== 'casual';

  if (a.chars === 0) {
    flags.push(flag('EMPTY_OUTPUT', 'error', 'no Japanese text produced'));
    return flags;
  }

  if (needsPolite && a.plainEndings > 0) {
    flags.push(
      flag(
        'PLAIN_IN_POLITE',
        'error',
        `${a.plainEndings}/${a.plainEndings + a.politeEndings} sentence-final predicates are plain form`,
      ),
    );
  }
  if (registerKey === 'casual' && a.politeRatio > 0.25) {
    flags.push(
      flag('POLITE_IN_CASUAL', 'error', `${Math.round(a.politeRatio * 100)}% です・ます endings in カジュアル`),
    );
  }
  if (registerKey !== 'formal' && a.letterHard > 0) {
    flags.push(
      flag('LETTER_FRAME_BELOW_FORMAL', 'error', `letter-form markers in ${registerKey}: ${a.letterHardFound.join(' ')}`),
    );
  }
  if (registerKey === 'casual' && a.sonkeigo + a.kenjougo >= 3) {
    flags.push(
      flag('KEIGO_IN_CASUAL', 'warn', `${a.sonkeigo + a.kenjougo} honorific markers in カジュアル`),
    );
  }
  if ((registerKey === 'keigo' || registerKey === 'formal') && a.sonkeigo === 0) {
    flags.push(flag('NO_SONKEIGO', 'error', 'zero 尊敬語 markers'));
  }
  if ((registerKey === 'keigo' || registerKey === 'formal') && a.kenjougo === 0) {
    flags.push(flag('NO_KENJOUGO', 'error', 'zero 謙譲語 markers'));
  }
  if (registerKey === 'formal' && !(a.hasOpeningWord && a.hasClosingWord)) {
    flags.push(
      flag('MISSING_LETTER_FRAME', 'warn', `頭語 ${a.hasOpeningWord ? 'ok' : 'missing'} / 結語 ${a.hasClosingWord ? 'ok' : 'missing'}`),
    );
  }
  if (registerKey === 'formal' && !a.hasSeasonalGreeting) {
    flags.push(flag('NO_SEASONAL_GREETING', 'warn', '時候の挨拶 absent from 最敬語'));
  }
  if (a.latin.length > 0) {
    flags.push(flag('LATIN_IN_TEXT', 'error', `Latin text in textJa: ${a.latin.slice(0, 6).join(' ')}`));
  }
  if (a.meta.length > 0) {
    flags.push(flag('META_COMMENTARY', 'error', `commentary markers: ${a.meta.slice(0, 6).join(' ')}`));
  }
  return flags;
}

function flagPair(lower, upper, lowerAnalysis, upperAnalysis, similarity) {
  const flags = [];
  const gain = upperAnalysis.formality - lowerAnalysis.formality;
  if (similarity >= NEAR_IDENTICAL_THRESHOLD) {
    flags.push(
      flag('NEAR_IDENTICAL', 'error', `${lower}→${upper} bigram similarity ${similarity.toFixed(2)}`),
    );
  }
  if (gain < MIN_FORMALITY_GAIN) {
    flags.push(
      flag('NO_FORMALITY_GAIN', 'warn', `${lower}→${upper} formality moved only ${gain.toFixed(1)} pts`),
    );
  }
  if (upperAnalysis.chars < lowerAnalysis.chars) {
    flags.push(
      flag('LENGTH_INVERSION', 'warn', `${upper} (${upperAnalysis.chars}字) shorter than ${lower} (${lowerAnalysis.chars}字)`),
    );
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Model call
// ---------------------------------------------------------------------------

function extractJsonObject(rawInput) {
  // The model reliably wraps its JSON in a markdown code fence. That is a
  // transport wrapper, not commentary, so strip it before looking for prose
  // outside the object -- otherwise every run reports a false META_COMMENTARY.
  const raw = rawInput
    .replace(/^\s*```(?:json|JSON)?\s*/, '')
    .replace(/\s*```\s*$/, '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = raw.slice(start, end + 1);
  try {
    return { parsed: JSON.parse(slice), outside: (raw.slice(0, start) + raw.slice(end + 1)).trim() };
  } catch {
    // Lenient per-key salvage for responses that break JSON escaping.
    const parsed = {};
    for (const key of REGISTER_KEYS) {
      const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 's');
      const m = re.exec(slice);
      if (m) {
        try {
          parsed[key] = JSON.parse(`"${m[1]}"`);
        } catch {
          parsed[key] = m[1].replace(/\\n/g, '\n');
        }
      }
    }
    return Object.keys(parsed).length > 0
      ? { parsed, outside: (raw.slice(0, start) + raw.slice(end + 1)).trim(), salvaged: true }
      : null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callModel(config, scenario) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          temperature: TEMPERATURE,
          max_tokens: MAX_TOKENS,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(scenario) },
          ],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      const json = await res.json();
      const content = json?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim() === '') {
        throw new Error('empty completion content');
      }
      return { raw: content, usage: json.usage ?? null, attempts: attempt };
    } catch (err) {
      lastError = err;
      const retryable = attempt < MAX_ATTEMPTS;
      if (!retryable) break;
      const backoff = /429|rate/i.test(String(err.message)) ? 6000 * attempt : 1500 * attempt;
      await sleep(backoff);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function runScenario(config, scenario) {
  const started = Date.now();
  try {
    const { raw, usage, attempts } = await callModel(config, scenario);
    const extracted = extractJsonObject(raw);
    const scenarioFlags = [];

    if (!extracted) {
      return {
        scenario,
        ok: false,
        error: 'response contained no parseable JSON object',
        raw,
        durationMs: Date.now() - started,
      };
    }
    if (extracted.salvaged) {
      scenarioFlags.push(flag('JSON_MALFORMED', 'error', 'JSON.parse failed; keys salvaged by regex'));
    }
    if (extracted.outside) {
      scenarioFlags.push(
        flag('META_COMMENTARY', 'error', `prose outside JSON: ${extracted.outside.replace(/\s+/g, ' ').slice(0, 120)}`),
      );
    }

    const registers = {};
    for (const key of REGISTER_KEYS) {
      const text = typeof extracted.parsed[key] === 'string' ? extracted.parsed[key].trim() : '';
      const analysis = analyse(text, scenario.latinAllowed);
      registers[key] = { text, analysis, flags: flagRegister(key, analysis) };
    }

    const pairs = ADJACENT_PAIRS.map(([lower, upper]) => {
      const similarity = diceSimilarity(registers[lower].text, registers[upper].text);
      return {
        lower,
        upper,
        similarity,
        formalityGain: registers[upper].analysis.formality - registers[lower].analysis.formality,
        charDelta: registers[upper].analysis.chars - registers[lower].analysis.chars,
        flags: flagPair(lower, upper, registers[lower].analysis, registers[upper].analysis, similarity),
      };
    });

    const allFlags = [
      ...scenarioFlags,
      ...REGISTER_KEYS.flatMap((k) => registers[k].flags.map((f) => ({ ...f, register: k }))),
      ...pairs.flatMap((p) => p.flags.map((f) => ({ ...f, register: `${p.lower}→${p.upper}` }))),
    ];

    return {
      scenario,
      ok: true,
      raw,
      usage,
      attempts,
      registers,
      pairs,
      scenarioFlags,
      allFlags,
      errorCount: allFlags.filter((f) => f.severity === 'error').length,
      warnCount: allFlags.filter((f) => f.severity === 'warn').length,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return { scenario, ok: false, error: String(err?.message ?? err), durationMs: Date.now() - started };
  }
}

async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function cell(text) {
  if (!text) return '_(empty)_';
  return text.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function flagList(flags) {
  if (flags.length === 0) return '—';
  return flags.map((f) => `\`${f.code}\``).join(' ');
}

function buildReport(results, config, startedAt) {
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const clean = ok.filter((r) => r.errorCount === 0);
  const passRate = results.length ? (clean.length / results.length) * 100 : 0;

  // Worst register: most error-level flags attributed to it.
  const registerErrors = Object.fromEntries(REGISTER_KEYS.map((k) => [k, 0]));
  const codeCounts = new Map();
  for (const r of ok) {
    for (const f of r.allFlags) {
      codeCounts.set(f.code, (codeCounts.get(f.code) || 0) + 1);
      if (f.severity === 'error' && REGISTER_KEYS.includes(f.register)) registerErrors[f.register] += 1;
    }
  }
  const worstRegister = REGISTER_KEYS.reduce((a, b) => (registerErrors[b] > registerErrors[a] ? b : a));
  const worstScenario = ok.length
    ? ok.reduce((a, b) => (b.errorCount > a.errorCount ? b : a))
    : null;

  const pairStats = ADJACENT_PAIRS.map(([lower, upper]) => {
    const rows = ok.map((r) => r.pairs.find((p) => p.lower === lower && p.upper === upper));
    const n = rows.length || 1;
    const meanSim = rows.reduce((s, p) => s + p.similarity, 0) / n;
    const meanGain = rows.reduce((s, p) => s + p.formalityGain, 0) / n;
    const collapses = rows.filter((p) => p.similarity >= NEAR_IDENTICAL_THRESHOLD).length;
    const flat = rows.filter((p) => p.formalityGain < MIN_FORMALITY_GAIN).length;
    return { lower, upper, meanSim, meanGain, collapses, flat, n: rows.length };
  });

  const metaCount = ok.reduce(
    (s, r) => s + r.allFlags.filter((f) => f.code === 'META_COMMENTARY').length,
    0,
  );
  const metaScenarios = ok.filter((r) => r.allFlags.some((f) => f.code === 'META_COMMENTARY')).length;

  const L = [];
  L.push('# KAIFŪ register evaluation');
  L.push('');
  L.push(
    'Generated by `scripts/eval-registers.mjs`. Each scenario is a real document a resident of Japan ' +
      'receives and must answer; the model is asked to render **one** reply at four politeness registers ' +
      'in a single call, holding content constant so the only variable is register.',
  );
  L.push('');
  L.push('| Run | |');
  L.push('|---|---|');
  L.push(`| Generated | ${startedAt.toISOString()} |`);
  L.push(`| Model | \`${config.model}\` |`);
  L.push(`| Endpoint host | \`${config.host}\` (Japan-hosted) |`);
  L.push(`| Scenarios | ${results.length} (${ok.length} generated, ${failed.length} failed) |`);
  L.push(`| Temperature | ${TEMPERATURE} |`);
  L.push('');

  L.push('## For the native reviewer');
  L.push('');
  L.push(
    'You do not need to read the code or the scores. For each of the four drafts in every scenario, ' +
      'fill the **Verdict** column with one mark and add a short note if it is not ✓:',
  );
  L.push('');
  L.push('| Mark | Meaning |');
  L.push('|---|---|');
  L.push('| ✓ | Natural. A native speaker could send this to this recipient as-is. |');
  L.push('| △ | Stilted or awkward, but the politeness level is right. Say what you would change. |');
  L.push('| ✗ | Wrong register — too casual, too stiff, or the honorifics are misapplied (e.g. 尊敬語 used about oneself). |');
  L.push('');
  L.push('### What the automatic checks cannot catch');
  L.push('');
  L.push(
    'The scores below count honorific *markers*. They cannot tell whether a marker points at the right ' +
      'person, which is where keigo actually goes wrong and where your eye is the only instrument. ' +
      'Please watch specifically for:',
  );
  L.push('');
  L.push('| Error class | What it looks like |');
  L.push('|---|---|');
  L.push('| 尊敬語 aimed at the writer | ご参加する / ご存じなくて困っております — elevating one\'s own action or knowledge |');
  L.push('| 謙譲語 aimed at the recipient | 相手に対して「伺う」「拝見する」を使う |');
  L.push('| Honorifics on one\'s own family | お子さん / ご主人 used for the writer\'s own child or spouse |');
  L.push('| 二重敬語 | おっしゃられる / ご覧になられる — stacked honorifics |');
  L.push('| Wrong-person hearsay | 〜と伺っております used for the writer\'s own circumstances |');
  L.push('| Envelope-only formality | 最敬語 that is the 敬語 body with 拝啓/敬具 bolted on, unchanged inside |');
  L.push('');
    L.push(
    'The two questions that matter most: **(a)** would you send this to *this specific recipient*, and ' +
      '**(b)** is each step up the ladder a real step — does 敬語 actually read as more deferential than 丁寧, ' +
      'or do they feel the same? The automatic scores below are a first pass only; they cannot judge naturalness.',
  );
  L.push('');

  L.push('## Summary');
  L.push('');
  L.push(`- **Pass rate: ${passRate.toFixed(0)}%** (${clean.length}/${results.length} scenarios with zero error-level flags)`);
  if (worstScenario) {
    L.push(
      `- **Worst scenario:** \`${worstScenario.scenario.id}\` — ${worstScenario.errorCount} errors, ${worstScenario.warnCount} warnings`,
    );
  }
  L.push(
    `- **Worst register:** ${REGISTERS.find((r) => r.key === worstRegister).ja} (\`${worstRegister}\`) — ${registerErrors[worstRegister]} error-level flags across the suite`,
  );
  L.push(`- **Meta-commentary:** ${metaCount} occurrences across ${metaScenarios}/${ok.length} generated scenarios`);
  if (failed.length > 0) {
    L.push(`- **Generation failures:** ${failed.map((f) => `\`${f.scenario.id}\``).join(', ')}`);
  }
  L.push('');

  L.push('### Are adjacent registers distinguishable?');
  L.push('');
  L.push('| Step | Mean text similarity | Mean formality gain | Near-identical | No formality gain |');
  L.push('|---|---|---|---|---|');
  for (const p of pairStats) {
    const jaLower = REGISTERS.find((r) => r.key === p.lower).ja;
    const jaUpper = REGISTERS.find((r) => r.key === p.upper).ja;
    L.push(
      `| ${jaLower} → ${jaUpper} | ${p.meanSim.toFixed(2)} | ${p.meanGain >= 0 ? '+' : ''}${p.meanGain.toFixed(1)} | ${p.collapses}/${p.n} | ${p.flat}/${p.n} |`,
    );
  }
  L.push('');
  L.push(
    `Similarity is a character-bigram Dice coefficient (1.00 = identical text). ` +
      `\`NEAR_IDENTICAL\` fires at ≥ ${NEAR_IDENTICAL_THRESHOLD.toFixed(2)}; \`NO_FORMALITY_GAIN\` fires when the ` +
      `formality index moves less than ${MIN_FORMALITY_GAIN} points. If a step shows high similarity and a flat ` +
      `index, the slider has no visible effect at that position and the demo falls flat there.`,
  );
  L.push('');

  if (codeCounts.size > 0) {
    L.push('### Flag frequency');
    L.push('');
    L.push('| Flag | Count |');
    L.push('|---|---|');
    for (const [code, count] of [...codeCounts].sort((a, b) => b[1] - a[1])) {
      L.push(`| \`${code}\` | ${count} |`);
    }
    L.push('');
  }

  L.push('---');
  L.push('');
  L.push('## Scenarios');
  L.push('');

  results.forEach((r, i) => {
    const s = r.scenario;
    L.push(`### ${i + 1}. \`${s.id}\` — ${s.label}`);
    L.push('');
    L.push(`**送信先:** ${s.recipient}  `);
    L.push(`**受け取った文書:** ${s.document}  `);
    L.push(`**伝えたいこと:** ${s.intent}`);
    L.push('');

    if (!r.ok) {
      L.push(`> **Generation failed:** ${r.error}`);
      L.push('');
      return;
    }

    L.push('#### Drafts — reviewer sheet');
    L.push('');
    L.push('| Register | Draft (textJa) | Verdict (✓ / △ / ✗) | Notes |');
    L.push('|---|---|---|---|');
    for (const reg of REGISTERS) {
      L.push(`| **${reg.ja}**<br>_${reg.en}_ | ${cell(r.registers[reg.key].text)} |  |  |`);
    }
    L.push('');

    L.push('#### Automatic metrics');
    L.push('');
    L.push('| Register | 字数 | 文数 | です・ます率 | 尊敬語 | 謙譲語 | 美化語/100字 | 書簡枠 | Formality | Flags |');
    L.push('|---|---|---|---|---|---|---|---|---|---|');
    for (const reg of REGISTERS) {
      const a = r.registers[reg.key].analysis;
      L.push(
        `| ${reg.ja} | ${a.chars} | ${a.sentenceCount} | ${Math.round(a.politeRatio * 100)}% | ${a.sonkeigo} | ${a.kenjougo} | ${a.bikagoPer100.toFixed(1)} | ${a.letterHard} | **${a.formality.toFixed(1)}** | ${flagList(r.registers[reg.key].flags)} |`,
      );
    }
    L.push('');

    L.push('| Step | Similarity | Formality Δ | 字数 Δ | Flags |');
    L.push('|---|---|---|---|---|');
    for (const p of r.pairs) {
      const jaLower = REGISTERS.find((x) => x.key === p.lower).ja;
      const jaUpper = REGISTERS.find((x) => x.key === p.upper).ja;
      L.push(
        `| ${jaLower} → ${jaUpper} | ${p.similarity.toFixed(2)} | ${p.formalityGain >= 0 ? '+' : ''}${p.formalityGain.toFixed(1)} | ${p.charDelta >= 0 ? '+' : ''}${p.charDelta} | ${flagList(p.flags)} |`,
      );
    }
    L.push('');

    if (r.allFlags.length > 0) {
      L.push('<details><summary>Flag detail</summary>');
      L.push('');
      for (const f of r.allFlags) {
        L.push(`- \`${f.code}\` (${f.severity}) — ${f.register ?? 'scenario'}: ${f.detail}`);
      }
      L.push('');
      L.push('</details>');
      L.push('');
    }
  });

  L.push('---');
  L.push('');
  L.push('## How the automatic checks work');
  L.push('');
  L.push(
    '- **です・ます率** — only *sentence-final* predicates are classified. Japanese uses plain forms mid-sentence ' +
      '(relative and subordinate clauses) even in the most formal writing, so a mid-sentence 〜する carries no ' +
      'register information and is deliberately ignored.',
  );
  L.push(
    '- **尊敬語** — いらっしゃる / おっしゃる / ご覧になる / なさる / 召し上がる / くださる / お〜になる / ご〜くださる / 賜る / 貴社.',
  );
  L.push(
    '- **謙譲語** — いたす / 申し上げる / 伺う / 拝見 / 存じる / 承る / 頂戴 / させていただく / おります / 参る / お〜いたす / 弊社.',
  );
  L.push('- **美化語** — お・ご・御 immediately followed by a kanji, normalised per 100 characters.');
  L.push(
    '- **書簡枠** — hard letter-form markers only (拝啓 / 敬具 / 謹啓 / 謹白 / 前略 / 草々 / 時下 / 〜の候 / ご清栄). ' +
      'These are legitimate **only** in 最敬語; anywhere below that they are an error. Softer markers ' +
      '(何卒 / 平素より / 申し上げます) feed the formality index but are not flagged, because they are normal business 敬語.',
  );
  L.push(
    '- **Formality index (0–100)** — です・ます率 ×25 + 尊敬語 ×12 + 謙譲語 ×23 + 美化語密度 ×12 + 改まり表現 ×8 + 書簡枠 ×20, each capped. ' +
      'It is a separation metric, not a quality metric: a high score means the rendering is *marked* as formal, ' +
      'not that it is correct or natural. Only the native reviewer can judge that.',
  );
  L.push('');
  L.push('### Flag reference');
  L.push('');
  L.push('| Flag | Severity | Meaning |');
  L.push('|---|---|---|');
  const FLAG_DOCS = [
    ['PLAIN_IN_POLITE', 'error', 'Plain-form sentence ending in a register that requires です・ます.'],
    ['POLITE_IN_CASUAL', 'error', 'More than 25% です・ます endings in カジュアル.'],
    ['LETTER_FRAME_BELOW_FORMAL', 'error', '拝啓/敬具/時候の挨拶 etc. appearing below 最敬語.'],
    ['NO_SONKEIGO', 'error', '敬語 or 最敬語 with zero 尊敬語 markers.'],
    ['NO_KENJOUGO', 'error', '敬語 or 最敬語 with zero 謙譲語 markers.'],
    ['LATIN_IN_TEXT', 'error', 'Latin characters in textJa outside the allowlist (PTA, FAX, …).'],
    ['META_COMMENTARY', 'error', 'English commentary, ※ trailers, or prose outside the JSON object.'],
    ['NEAR_IDENTICAL', 'error', `Adjacent registers ≥ ${NEAR_IDENTICAL_THRESHOLD} bigram similarity — the slider does nothing here.`],
    ['JSON_MALFORMED', 'error', 'Response was not valid JSON; keys recovered by regex salvage.'],
    ['EMPTY_OUTPUT', 'error', 'No Japanese text produced for this register.'],
    ['MISSING_LETTER_FRAME', 'warn', '最敬語 lacks a 頭語/結語 pair.'],
    ['NO_SEASONAL_GREETING', 'warn', '最敬語 lacks a 時候の挨拶.'],
    ['KEIGO_IN_CASUAL', 'warn', 'Three or more honorific markers in カジュアル.'],
    ['NO_FORMALITY_GAIN', 'warn', `Formality index moved less than ${MIN_FORMALITY_GAIN} points between adjacent registers.`],
    ['LENGTH_INVERSION', 'warn', 'A register is shorter than the one below it — politeness in Japanese correlates with length.'],
  ];
  for (const [code, sev, desc] of FLAG_DOCS) L.push(`| \`${code}\` | ${sev} | ${desc} |`);
  L.push('');

  return {
    markdown: L.join('\n') + '\n',
    stats: { passRate, clean: clean.length, total: results.length, failed, worstScenario, worstRegister, registerErrors, pairStats, metaCount, metaScenarios, okCount: ok.length },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const config = readConfig();
  const startedAt = new Date();
  console.log(`Register eval — ${SCENARIOS.length} scenarios × ${REGISTERS.length} registers`);
  console.log(`Model: ${config.model} @ ${config.host}\n`);

  const results = await runPool(SCENARIOS, CONCURRENCY, async (scenario) => {
    const r = await runScenario(config, scenario);
    const mark = r.ok ? (r.errorCount === 0 ? 'PASS' : `FAIL(${r.errorCount})`) : 'ERROR';
    console.log(`  ${mark.padEnd(8)} ${scenario.id} (${(r.durationMs / 1000).toFixed(1)}s)`);
    if (!r.ok) console.log(`           ${r.error}`);
    return r;
  });

  const { markdown, stats } = buildReport(results, config, startedAt);
  writeFileSync(OUT_PATH, markdown, 'utf8');

  console.log('\n' + '='.repeat(64));
  console.log(`Pass rate:       ${stats.passRate.toFixed(0)}%  (${stats.clean}/${stats.total} scenarios with zero error flags)`);
  if (stats.worstScenario) {
    console.log(
      `Worst scenario:  ${stats.worstScenario.scenario.id} — ${stats.worstScenario.errorCount} errors, ${stats.worstScenario.warnCount} warnings`,
    );
  }
  const wr = REGISTERS.find((r) => r.key === stats.worstRegister);
  console.log(`Worst register:  ${wr.ja} (${wr.key}) — ${stats.registerErrors[stats.worstRegister]} error flags`);
  console.log(`Meta-commentary: ${stats.metaCount} occurrences in ${stats.metaScenarios}/${stats.okCount} scenarios`);
  console.log('\nAdjacent register separation:');
  for (const p of stats.pairStats) {
    const jaLower = REGISTERS.find((r) => r.key === p.lower).ja;
    const jaUpper = REGISTERS.find((r) => r.key === p.upper).ja;
    const verdict =
      p.collapses >= p.n / 2
        ? 'NOT DISTINGUISHABLE'
        : p.collapses > 0 || p.flat > 0
          ? `inconsistent (${p.collapses}/${p.n} collapsed)`
          : 'distinguishable';
    console.log(
      `  ${jaLower} → ${jaUpper}`.padEnd(22) +
        `sim ${p.meanSim.toFixed(2)}  Δformality ${p.meanGain >= 0 ? '+' : ''}${p.meanGain.toFixed(1).padStart(5)}  ${verdict}`,
    );
  }
  if (stats.failed.length > 0) {
    console.log(`\nGeneration failures: ${stats.failed.map((f) => f.scenario.id).join(', ')}`);
  }
  console.log('='.repeat(64));
  console.log(`\nReport written to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('\nEval run aborted:', err?.message ?? err);
  process.exit(1);
});
