import type { DocumentFixture } from "./documents";

/**
 * The `unknown` bucket. None of these should produce an obligation:
 * `unknown` is not a failure, it routes to summary-only mode, and a
 * wrong deadline is worse than no answer.
 *
 *  - unknown-neighbourhood-circular: genuinely ambiguous. A 回覧板 whose
 *    blanks are meant to be filled in by hand and never were.
 *  - unknown-degraded-print: shaped like a school notice and smells like
 *    one, but the transcription is too holed to trust. Confidence must
 *    land below CONFIDENCE_THRESHOLD rather than guessing school_notice.
 *  - unknown-blank-receipt: an unfilled 領収証 from a stationery pad.
 */
export const unknownDocumentFixtures: DocumentFixture[] = [
  {
    id: "unknown-neighbourhood-circular",
    docType: "unknown",
    titleJa: "回覧",
    issuer: "菊川三丁目町会",
    note: "Ambiguous by design — a circular whose details were never filled in.",
    rawText: `　　　　　　　　　回　　覧

　　　　　　　　　　　　　　　　　　　　菊川三丁目町会

　　　　　　　　　　　　　　　　　　　　　　　　　　　□□

　・防災訓練の件
　　　日　時　　　　　　　　　　　　　　　（雨天中止）
　　　場　所　　菊川　　　　公園
　　　持ち物　　特にありません

　・秋の交通安全運動について
　　　　　　　　　　　　　　　　別紙のとおり

　・そ の 他
　　　　　　　　　　　　　　　　　　　

　　　　　　　　　　　ご覧になりましたら、次の方へお回しください。
　　　　　　　　　　　最後の方は組長までお返しください。

　　　　組　　　　　　　　　　　　　　　　　　　　　　　　　　組長`,
    expected: { dates: [], amounts: [], obligations: [] },
  },

  {
    id: "unknown-degraded-print",
    docType: "unknown",
    titleJa: "",
    issuer: null,
    note: "Looks like a school notice but the OCR is too holed to trust — must degrade to summary-only, not guess school_notice.",
    rawText: `■■■■各位
　　　　　　　　　　　　　　　　　　　　　　　9月　　日（　）

　　　　　　　　■■■のお知■■

　　　　　　　　　　　■■■■小学■
　　　　　　　　　　　　■　　■■　■■

　平素は本校の■■■■にご理解と■■■を賜り、■く御礼申し上げます。
　さて、下記のとおり■■■■を実施■たしますので、お知らせ■たします。

　　　　　　　　　　　　記

１　日　時　　　　月　　日（　）　午前■時■■分　　　　　
２　場　所　　　　　　■■■■
３　■　■　　金　　　　　円
４　持ち物　　　■■■、水筒、■■■■

　　　　　　　　　　　　　　　　　　　　　　　　　　　　　以　上

　　　　■り取り■　　　　　　　　　　　　　　　　　　　　　　　
　　　　　　　　　　　■■票
　　　　　　　　　　　　　　　（　　　　　　　　）`,
    expected: { dates: [], amounts: [], obligations: [] },
  },

  {
    id: "unknown-blank-receipt",
    docType: "unknown",
    titleJa: "領収証",
    issuer: null,
    note: "A blank receipt pad page — no counterparty, no figure, nothing to act on.",
    rawText: `　　　　　　　　　　　　　　　　　　　　　　　No.

　　　　　　　　領　収　証

　　　　　　　　　　　　　　　　　　　　　　年　　月　　日

　　　　　　　　　　　　　　　　様

　　　金　　　　　　　　　　　　　　　　　　　　円　也

　　　　但し　　　　　　　　　　　　　　　　　代として
　　　　上記正に領収いたしました

　　　　　　　　　　　　　　　　　　内訳
　　　　　　　　　　　　　　　　　税抜金額
　　　　　　　　　　　　　　　　　消費税額等（　％）

　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　㊞`,
    expected: { dates: [], amounts: [], obligations: [] },
  },
];
