/**
 * KAIFŪ prompt surface.
 *
 * Kept apart from the transport client on purpose: register wording is the
 * part of this product that gets tuned most often and by the people least
 * likely to want to read a fetch loop. Nothing here does I/O.
 */

import {
  REGISTERS,
  type Obligation,
  type RegisterId,
  type ReplyRequest,
  type VisionResult,
} from "@/lib/types";

/**
 * Separates the Japanese message from its English gloss inside a single
 * completion. One stream, two payloads: the slider needs the gloss to arrive
 * with its rendering, and a second round-trip per register would quadruple
 * the latency the demo is built to show off.
 *
 * Chosen because it cannot occur in natural Japanese or in an English gloss.
 */
export const GLOSS_DELIMITER = "---GLOSS---";

/* ------------------------------------------------------------------ *
 * Shared guardrails.
 *
 * 弁護士法第72条 makes non-lawyers stating legal conclusions for another
 * person's dispute an offence. KAIFŪ therefore ghostwrites, it does not
 * advise: the user's message may report what happened and ask questions,
 * and may never assert a right or threaten a consequence.
 * ------------------------------------------------------------------ */

const LEGAL_BOUNDARY = `LEGAL BOUNDARY (弁護士法第72条 — non-negotiable):
You are ghostwriting the user's own message. You are not their lawyer.
- ALLOWED: stating what happened, quoting what the document says, describing
  the user's situation, asking questions, requesting an explanation, a
  breakdown, a correction, a meeting, or more time.
- FORBIDDEN: asserting that something is illegal, invalid, unenforceable or
  a violation; claiming the user "has the right to" anything; citing a law
  or guideline as leverage; naming a lawyer, 消費者センター or any authority
  as a next step; threatening non-payment, escalation or legal action; or
  predicting how a dispute would be resolved.
When the user's intent implies a legal claim, write the factual question
that sits underneath it instead ("ご説明いただけますでしょうか").`;

const NO_INVENTION = `NEVER invent a date, an amount, a deadline, a name or a
policy. You may only restate facts supplied above. If a fact you would need
is absent, write around it or ask for it — a fabricated deadline is the worst
failure this product can produce.`;

/* ------------------------------------------------------------------ *
 * Register definitions.
 *
 * The `whyItFits` line is the teaching feature: the gloss must name the
 * grammatical move and the social reason, not rate politeness on a scale.
 * ------------------------------------------------------------------ */

interface RegisterSpec {
  /** Grammar the rendering must actually use. */
  readonly grammar: string;
  /** Who this rendering is aimed at, in one clause. */
  readonly reader: string;
  /** Steers the gloss toward a specific, teachable observation. */
  readonly glossFocus: string;
}

const REGISTER_SPECS: Readonly<Record<RegisterId, RegisterSpec>> = {
  casual: {
    grammar:
      "Plain form (だ・である / 辞書形). Every sentence ends plain — no です, no ます, " +
      "no ください, no いただけますか, no ありがとうございます. Use 〜てくれる / 〜てもらえる / " +
      "〜かな instead. Contractions (〜てる, 〜ちゃう) and final particles (ね, よ) are " +
      "welcome. Never open with お世話になっております or any business greeting.",
    reader: "a friend, a neighbour you know well, or a peer of the same standing",
    glossFocus:
      "name the plain-form endings and the particles that create closeness, and " +
      "say plainly who this would be too familiar for",
  },
  polite: {
    grammar:
      "です・ます throughout. Neutral vocabulary. Ordinary keigo courtesies " +
      "(よろしくお願いいたします) are fine, but do NOT reach for 尊敬語 or 謙譲語 " +
      "verb substitutions — no いらっしゃる, no 拝見, no 申し上げる.",
    reader:
      "a child's teacher, a shop, a clinic, a landlord's agent — the correct " +
      "default for almost every everyday message in Japan",
    glossFocus:
      "explain that です・ます carries respect without distance, and why the " +
      "heavier forms would read as stiff or oddly ceremonial here",
  },
  keigo: {
    grammar:
      "Full 尊敬語 for the reader's actions (ご確認いただく, いらっしゃる, ご覧になる) " +
      "and 謙譲語 for the user's own (申し上げる, 伺う, 拝見する, いたす). Cushion " +
      "phrases (恐れ入りますが, お手数をおかけしますが). No contractions. Open with " +
      "お世話になっております, NOT 拝啓 — the letter frame belongs to 最敬語, and this " +
      "register must stay visibly lighter than it.",
    reader: "a company, an office, a manager — ordinary business correspondence",
    glossFocus:
      "name the specific 尊敬語/謙譲語 substitutions used and what the split " +
      "signals about who is doing what to whom",
  },
  formal: {
    grammar:
      "Formal written-letter register. Use the 拝啓 … 時候の挨拶 … 敬具 frame when " +
      "the message is a letter (a dispute, a complaint, a formal request); omit " +
      "the frame only if the intent is plainly a short note. Write a real " +
      "seasonal greeting (時下ますますご清栄のこととお慶び申し上げます) — never the " +
      "literal placeholder 「時候の挨拶」. Written-style " +
      "vocabulary (〜致します, 〜ございます, 何卒, 存じます). No contractions, no " +
      "particles of familiarity.",
    reader:
      "a landlord in a dispute, a ward office, or any recipient where the message " +
      "may later be re-read as a record",
    glossFocus:
      "explain what the 拝啓/敬具 frame and written-style vocabulary signal about " +
      "seriousness and permanence, and why that weight can itself be a message",
  },
};

/** Register metadata as printed into the prompt, from the shared contract. */
const registerMeta = (id: RegisterId) => {
  const meta = REGISTERS.find((r) => r.id === id);
  // REGISTERS is the source of truth for the set; a miss means the contract
  // changed under us and silently guessing would ship the wrong register.
  if (!meta) throw new Error(`Unknown register: ${id}`);
  return meta;
};

/* ------------------------------------------------------------------ *
 * Reply / register prompts.
 * ------------------------------------------------------------------ */

export function registerSystemPrompt(id: RegisterId): string {
  const meta = registerMeta(id);
  const spec = REGISTER_SPECS[id];

  // "REGISTER: <id>" is load-bearing: it is the only place the register id
  // appears verbatim, which is how logs and tests attribute a request.
  return `あなたは日本語のネイティブライターです。You ghostwrite one Japanese message on behalf of a foreign resident of Japan who cannot write it themselves.

REGISTER: ${id} (${meta.ja} / ${meta.en})
GRAMMAR: ${spec.grammar}
READER: ${spec.reader}

OUTPUT FORMAT — exactly two parts and nothing else:
<the Japanese message>
${GLOSS_DELIMITER}
<one English sentence>

RULES FOR THE MESSAGE
1. Japanese ONLY. No English, no romaji, no furigana, no translation.
2. NO MARKDOWN ANYWHERE in your reply. No "---" rules, no **bold**, no "#"
   headings, no bullet points, no code fences. Never label the parts: do not
   write "Japanese Message:", "Message:", "GLOSS:" or any other header.
3. No preamble ("以下の通りです", "Here is the message") and no closing offer.
4. Do NOT wrap the whole message in 「」 or quotation marks. Quotation marks
   inside the message are fine when quoting the document.
5. Nothing after the message except the gloss. No ※ notes, no "(Polite
   version…)" parentheticals, no "let me know if you'd like adjustments",
   no alternative phrasings, no emoji.
6. Write it ready to send: appropriate opening, the substance, an appropriate
   close. Keep it to what the intent actually requires — usually 2–5 sentences.
7. ${NO_INVENTION}

${LEGAL_BOUNDARY}

RULES FOR THE GLOSS
The separator line is exactly ${GLOSS_DELIMITER} — that literal string, alone
on its line, undecorated. Then ONE English sentence, at most 30 words, on one
line, plain text with no markdown or asterisks. Say what THIS register
does differently and why it suits this reader — ${spec.glossFocus}. Be
concrete: "switches to 謙譲語 for your own actions, which signals deference
without sounding cold" is useful; "more polite" is not. Never describe the
message's content, only its register. No trailing offer of help.`;
}

export function registerUserPrompt(req: ReplyRequest): string {
  return `WHAT THE USER WANTS TO SAY (in their own words — translate the intent, do not copy the phrasing):
${req.intent}

RECIPIENT: ${req.recipient}
DOCUMENT TYPE: ${req.docType}
DOCUMENT CONTEXT (facts you may reference; do not add to them):
${req.documentSummary}

Write the message now.`;
}

/* ------------------------------------------------------------------ *
 * Action card prompts.
 *
 * Stage 1 already extracted every date and amount. This call exists purely
 * to put those facts into the user's language — it is a describer, not an
 * extractor, and the prompt says so three times because the model will
 * otherwise helpfully "correct" a date it half-recognises.
 * ------------------------------------------------------------------ */

export function actionCardSystemPrompt(outputLang: string): string {
  return `You explain a Japanese document to a foreign resident of Japan, in ${outputLang}.

Everything factual has ALREADY been extracted for you and is given below.
Your only job is to describe it in plain ${outputLang}.

${NO_INVENTION}
Specifically: do not add a deadline that is not listed, do not convert or
recalculate an amount, do not adjust a Japanese-era date, do not guess at a
policy the document does not state, and do not repeat a date or amount that
is not in the DATES or AMOUNTS lists.

${LEGAL_BOUNDARY}

Return ONE JSON object and nothing else — no markdown fence, no commentary:
{"whatThisIs": "...", "summary": "..."}

whatThisIs: a short noun phrase naming the document type as a person would
say it, e.g. "School excursion notice", "Residence tax payment slip". Under
60 characters. Not a sentence.

summary: one or two plain sentences saying what this document is about and
what it wants from the reader. No jargon, no Japanese terms without a gloss,
no advice, no urgency language the document itself does not carry. Do not
list the deadlines — the card shows those separately.`;
}

export function actionCardUserPrompt(
  vision: VisionResult,
  obligations: readonly Obligation[],
): string {
  const dates = vision.dates.length
    ? vision.dates.map((d) => `- ${d.label}: ${d.raw} (${d.iso})`).join("\n")
    : "- none extracted";
  const amounts = vision.amounts.length
    ? vision.amounts.map((a) => `- ${a.label}: ${a.raw} (${a.yen} JPY)`).join("\n")
    : "- none extracted";
  const todo = obligations.length
    ? obligations.map((o) => `- ${o.action}`).join("\n")
    : "- none extracted";

  // rawText is truncated: the card only needs the gist, and a long tail of
  // OCR noise is where the model starts hallucinating extra deadlines.
  const excerpt = vision.rawText.slice(0, 2000);

  return `DOCUMENT TYPE: ${vision.docType}
TITLE (Japanese, as printed): ${vision.titleJa}
ISSUER: ${vision.issuer ?? "not printed"}

DATES (the complete list — there are no others):
${dates}

AMOUNTS (the complete list — there are no others):
${amounts}

OBLIGATIONS ALREADY IDENTIFIED:
${todo}

DOCUMENT TEXT (transcription, may contain OCR noise):
${excerpt}

Return the JSON object now.`;
}
