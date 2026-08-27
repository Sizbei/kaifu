/**
 * Reply / register prompts.
 *
 * One system prompt per rung: a grammatical specification, the misdirected-
 * honorific list, three exemplars at this rung, and the output contract. The
 * user prompt ends with a one-line reminder of the rung, because the last
 * line of the prompt is the one this model obeys most reliably.
 */

import { REGISTERS, type RegisterId, type ReplyRequest } from "@/lib/types";

import { exemplarBlock } from "./exemplars";
import { HONORIFIC_DIRECTION, REGISTER_SPECS } from "./register-specs";
import { GLOSS_DELIMITER, LEGAL_BOUNDARY, NO_INVENTION } from "./shared";

/** Register metadata as printed into the prompt, from the shared contract. */
const registerMeta = (id: RegisterId) => {
  const meta = REGISTERS.find((r) => r.id === id);
  // REGISTERS is the source of truth for the set; a miss means the contract
  // changed under us and silently guessing would ship the wrong register.
  if (!meta) throw new Error(`Unknown register: ${id}`);
  return meta;
};

/** The last line of every request: the rung, restated where it is obeyed most. */
const REMINDER: Readonly<Record<RegisterId, string>> = {
  casual:
    "REMINDER — カジュアル: 常体のみ。「です」「ます」「ください」「お願いします」を一度も書かないこと（〜します→〜するよ／〜するね）。友達へのLINE。",
  polite:
    "REMINDER — 丁寧: 全文です・ます体で終える。おります／いたします／申し上げます／伺う／拝見／恐れ入りますが は使わない。自分の子は「うちの子」。",
  keigo:
    "REMINDER — 敬語: 「お世話になっております」で始め、相手の動作に尊敬語（ご〜いただけますでしょうか）、自分の動作に謙譲語。「拝啓」「時下」は禁止。",
  formal:
    "REMINDER — 最敬語: 拝啓 → 時候の挨拶 → さて → つきましては → 末文 → 敬具。本文を書簡体に書き直し、賜る・何卒・〜申し上げます を必ず含める。",
};

export function registerSystemPrompt(id: RegisterId): string {
  const meta = registerMeta(id);
  const spec = REGISTER_SPECS[id];
  const honorifics = id === "casual" ? "" : `\n${HONORIFIC_DIRECTION}\n`;

  // "REGISTER: <id>" is load-bearing: it is the only place the register id
  // appears verbatim, which is how logs and tests attribute a request.
  return `あなたは日本語のネイティブライターです。You ghostwrite one Japanese message on behalf of a foreign resident of Japan who cannot write it themselves. The message must be exactly ONE politeness register, and that register must be visibly different from its neighbours.

REGISTER: ${id} (${meta.ja} / ${meta.en})
READER: ${spec.reader}

REGISTER SPECIFICATION — follow every line:
${spec.grammar}

${spec.contrast}
${honorifics}
EXEMPLARS — three different intents, all written at THIS register. Copy their
grammar, openings, closings and sentence shapes exactly. Do NOT copy their
facts (an egg allergy, a 15万円 deposit, a tax bill): every fact in your message
comes only from the user's request below. Even when the user's request resembles
an exemplar, write it fresh from the user's own facts and wording.

${exemplarBlock(id)}

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
6. Write it ready to send: the opening, the substance, the close that the
   REGISTER SPECIFICATION calls for. Length per the specification.
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

export function registerUserPrompt(req: ReplyRequest, id: RegisterId): string {
  return `WHAT THE USER WANTS TO SAY (in their own words — translate the intent, do not copy the phrasing):
${req.intent}

RECIPIENT: ${req.recipient}
DOCUMENT TYPE: ${req.docType}
DOCUMENT CONTEXT (facts you may reference; do not add to them):
${req.documentSummary}

Write the message now.
${REMINDER[id]}`;
}
