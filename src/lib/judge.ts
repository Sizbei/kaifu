/**
 * KAIFŪ JUDGE — compares a lease clause against published MLIT guidance.
 *
 * 弁護士法 72条 is the design constraint, not a footnote. This module is
 * built so that the only thing it can emit is "the clause says X; the cited
 * government document says Y". Three gates enforce that, in order:
 *
 *   1. Retrieval  — the model only ever sees corpus entries, so it has no
 *                   material from which to invent a source.
 *   2. Citation   — every finding's citation is matched exactly against the
 *                   entries that were handed to the model. Verify, never trust.
 *   3. Register   — assertNoAdviceLanguage drops anything that reads as
 *                   counsel rather than comparison.
 *
 * A finding that fails any gate is dropped silently. Showing a user nothing
 * is a product problem; showing them a fabricated citation or unlicensed
 * legal advice is a company problem.
 */

import { JudgeFindingSchema, type JudgeFinding, type VisionResult } from "@/lib/types";
import { GROUND_TRUTH, findEntryByCitation, type GroundTruthEntry } from "@/lib/groundtruth";

/**
 * The only thing JUDGE needs from a language model. Declared here rather
 * than imported so this module compiles and tests without src/lib/shisa.ts.
 */
export type Completer = (system: string, user: string) => Promise<string>;

/** How many corpus entries to put in front of the model for one clause. */
const MAX_CANDIDATES = 3;

/* ------------------------------------------------------------------ *
 * Gate 1 — deterministic retrieval.
 * No vector DB in v0: substring hits on curated Japanese keywords. Ranked
 * by hit count, stable-sorted, so the same clause always routes the same
 * way and a routing regression shows up in a test rather than in the wild.
 * ------------------------------------------------------------------ */

export function retrieveEntries(
  clauseText: string,
  limit: number = MAX_CANDIDATES,
): readonly GroundTruthEntry[] {
  return GROUND_TRUTH.map((entry) => ({
    entry,
    score: entry.hints.filter((hint) => clauseText.includes(hint)).length,
  }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((c) => c.entry);
}

/* ------------------------------------------------------------------ *
 * Gate 3 — register guard.
 * ------------------------------------------------------------------ */

export class AdviceLanguageError extends Error {
  constructor(readonly matched: string) {
    super(`finding rejected: advice language (${matched})`);
    this.name = "AdviceLanguageError";
  }
}

/**
 * Constructions that turn a comparison into counsel. Deliberately broad:
 * the cost of over-blocking is one fewer finding, the cost of
 * under-blocking is practising law without a licence.
 */
const PROHIBITED: readonly RegExp[] = [
  // Obligation and recommendation.
  /\b(should|shouldn't|must|mustn't|ought to|have to|has to|need to|needs to|required to)\b/i,
  /\b(recommend|recommended|advise|advice|advisable|we suggest)\b/i,
  // Legal characterisation beyond "differs".
  /\b(illegal|unlawful|invalid|void|unenforceable|non-binding|not binding|breach of law)\b/i,
  /\b(unfair|abusive|exploitative|predatory|excessive charge)\b/i,
  // Telling the reader what they may do.
  /\byou (can|could|may|might|are|have|will be able)\b/i,
  /\b(entitled to|the right to|your rights?|claim back|get (it |this )?back)\b/i,
  /\b(demand|refuse|withhold|dispute|challenge|contest|push back|negotiate)\b/i,
  /\b(sue|lawsuit|litigation|legal action|take (them|the landlord) to court|small claims)\b/i,
  /\b(do not sign|don't sign|before you sign|walk away)\b/i,
  // Japanese equivalents.
  /(違法|不法|無効|不当|法的に)/,
  /(権利があ|権利です|請求でき|請求可能|拒否でき|拒否する|支払う必要はあ|払う必要はあ)/,
  /(すべきで|するべき|した方がよ|したほうがよ|おすすめ|お勧め|勧めます)/,
  /(交渉し|ましょう|訴え|訴訟|弁護士に相談|裁判)/,
];

/**
 * Throws if a finding speaks in KAIFŪ's voice as counsel.
 *
 * `clauseJa` is exempt on purpose: it is a verbatim quote of the tenant's
 * own document. Japanese leases are full of 「しなければならない」 and
 * 「請求できる」, and scanning the quote would drop nearly every real
 * clause. The guard covers the fields KAIFŪ authors — the plain-language
 * restatement and the guideline summary.
 */
export function assertNoAdviceLanguage(finding: JudgeFinding): void {
  const authored = `${finding.clausePlain}\n${finding.guidelineSays}`;
  for (const pattern of PROHIBITED) {
    const hit = authored.match(pattern);
    if (hit) throw new AdviceLanguageError(hit[0]);
  }
}

/* ------------------------------------------------------------------ *
 * Prompting.
 * ------------------------------------------------------------------ */

const SYSTEM_PROMPT = [
  "You compare one Japanese residential lease clause against excerpts of published",
  "Japanese government (国土交通省 / MLIT) guidance that are supplied to you.",
  "",
  "You are not a lawyer and you do not give legal advice. You report only what the",
  "clause says and what the supplied guidance says. Absolute rules:",
  "- Never state or imply that a clause is illegal, void, unenforceable, unfair or",
  "  invalid. Never tell the reader what to do, what they may demand, or what",
  "  rights they have. Never use should, must, need to, recommend, or advise.",
  "- Write in the indicative: \"The clause places X on the tenant.\",",
  "  \"The guidance lists X on the landlord's side.\"",
  "- Use ONLY the supplied guidance excerpts. Copy the citation object of the",
  "  excerpt you used, character for character. Never write a citation of your own.",
  "- If no supplied excerpt speaks to the clause, return an empty array.",
  "",
  "Reply with a JSON array and nothing else. Each element:",
  '{"clauseJa": string, "clausePlain": string, "guidelineSays": string,',
  ' "citation": {"source": string, "section": string, "url": string},',
  ' "status": "matches" | "differs" | "not_addressed"}',
  "",
  "clauseJa: the relevant sentence of the clause, quoted verbatim in Japanese.",
  "clausePlain: a neutral restatement of that sentence in the output language.",
  "guidelineSays: what the cited excerpt says on this point, neutral voice.",
  'status: "differs" when the clause allocates something differently from the',
  'guidance, "matches" when they align, "not_addressed" when the guidance does',
  "not reach the point. Do not invent stronger words; these three are all there is.",
].join("\n");

function buildUserPrompt(
  clauseText: string,
  candidates: readonly GroundTruthEntry[],
  outputLang: string,
): string {
  const excerpts = candidates
    .map((e, i) =>
      [
        `--- EXCERPT ${i + 1}: ${e.topic} ---`,
        `Japanese: ${e.guidanceJa}`,
        `English: ${e.guidanceEn}`,
        `citation: ${JSON.stringify(e.citation)}`,
      ].join("\n"),
    )
    .join("\n\n");

  return [
    `Output language (BCP-47): ${outputLang}`,
    "",
    "LEASE CLAUSE (verbatim):",
    clauseText,
    "",
    "SUPPLIED GOVERNMENT GUIDANCE:",
    excerpts,
  ].join("\n");
}

/* ------------------------------------------------------------------ *
 * Model output handling.
 * ------------------------------------------------------------------ */

/**
 * Models wrap JSON in prose or code fences often enough that failing on it
 * would cost real findings. Slice to the outermost array instead.
 */
function parseArray(reply: string): readonly unknown[] {
  const start = reply.indexOf("[");
  const end = reply.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  try {
    const parsed: unknown = JSON.parse(reply.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** All three gates applied to one candidate finding. Null means dropped. */
function admit(
  raw: unknown,
  candidates: readonly GroundTruthEntry[],
): JudgeFinding | null {
  const parsed = JudgeFindingSchema.safeParse(raw);
  if (!parsed.success) return null;
  const finding = parsed.data;

  // Gate 2. Matched against the excerpts actually supplied, not the whole
  // corpus: a citation the model was never shown is a citation it invented.
  if (!findEntryByCitation(finding.citation, candidates)) return null;

  // A citation-shaped finding with nothing quoted is not a comparison.
  if (finding.clauseJa.trim() === "" || finding.guidelineSays.trim() === "") return null;

  try {
    assertNoAdviceLanguage(finding);
  } catch {
    return null;
  }
  return finding;
}

/* ------------------------------------------------------------------ *
 * Default completer.
 * ------------------------------------------------------------------ */

/**
 * Resolved through a non-literal specifier so that TypeScript does not bind
 * this module to src/lib/shisa.ts at compile time — JUDGE and its tests stay
 * green while that module is still being built alongside this one.
 */
const SHISA_MODULE = "@/lib/shisa";

type CompleterModule = Record<string, unknown>;

const lazyShisaCompleter: Completer = async (system, user) => {
  const mod = (await import(/* @vite-ignore */ SHISA_MODULE)) as CompleterModule;
  const fn = mod.complete ?? mod.default;
  if (typeof fn !== "function") {
    throw new Error(
      "judgeClause: no completer supplied, and @/lib/shisa exports no `complete` " +
        "or default function. Pass a Completer as the third argument — e.g. " +
        "(system, user) => shisaChat(system, user) from the API route.",
    );
  }
  return (fn as Completer)(system, user);
};

/* ------------------------------------------------------------------ *
 * Entry point.
 * ------------------------------------------------------------------ */

/**
 * @param complete injected for testing; defaults to the Shisa client.
 */
export async function judgeClause(
  vision: VisionResult,
  outputLang: string,
  complete: Completer = lazyShisaCompleter,
): Promise<JudgeFinding[]> {
  // JUDGE speaks only about leases. Everything else gets no findings at all,
  // and the model is not called — no clause, no comparison, no cost.
  if (vision.docType !== "lease_clause") return [];

  const clauseText = vision.rawText.trim();
  if (clauseText === "") return [];

  const candidates = retrieveEntries(clauseText);
  if (candidates.length === 0) return [];

  const reply = await complete(
    SYSTEM_PROMPT,
    buildUserPrompt(clauseText, candidates, outputLang),
  );

  return parseArray(reply)
    .map((raw) => admit(raw, candidates))
    .filter((f): f is JudgeFinding => f !== null);
}
