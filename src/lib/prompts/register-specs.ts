/**
 * Register definitions: the grammar each rung must actually use, who it is
 * for, and what the gloss should teach.
 *
 * Written mostly in Japanese on purpose — the model is a Japanese-tuned
 * Llama and follows a Japanese style sheet more literally than an English
 * paraphrase of one. Each spec names forbidden forms, because the failure
 * mode in the live eval was never "too little politeness" but "the safe
 * です・ます default leaking into every rung".
 */

import type { RegisterId } from "@/lib/types";

export interface RegisterSpec {
  /** Grammar the rendering must actually use. */
  readonly grammar: string;
  /** Who this rendering is aimed at, in one clause. */
  readonly reader: string;
  /** A wrong-rung sentence and its correct recasting at this rung. */
  readonly contrast: string;
  /** Steers the gloss toward a specific, teachable observation. */
  readonly glossFocus: string;
}

export const REGISTER_SPECS: Readonly<Record<RegisterId, RegisterSpec>> = {
  casual: {
    grammar: `LINEで友達に送るメッセージ。常体（タメ口）のみ。
- 文末は必ず常体: 〜だ／〜だよ／〜だね／〜する／〜した／〜してる／〜かな／〜てくれる？／〜てもらえる？／〜てほしい／〜？
- 「です」「ます」「ください」「いただく」「申し訳ありません」「お願いします」「お世話になっております」は一度も使わない。丁寧語が一文でも混ざったら失敗。
- 縮約を使う: 〜てる、〜ちゃう、〜んだ、〜って。終助詞を使う: よ、ね、な、かな。
- 挨拶なし、署名なし。いきなり本題。丁寧版より短く、全体で2〜4文。
- 敬語の動詞（伺う、拝見、申し上げる、いたす、おります）は禁止。お／ご の美化語も日常語（お金、お店）以外は付けない。
- 報告や予定も常体: 「欠席させます」→「欠席させる」「休ませるね」、「連絡します」→「連絡するね」、「提出できます」→「出せるよ」。
- 自分の子は「うちの子」。「お子さん」「お子様」は他人の子にしか使わない。`,
    reader: "a friend, a neighbour you know well, or a peer of the same standing",
    contrast:
      "NOT THIS (丁寧 — wrong rung): 給食では卵を除いていただけますか。必要でしたら診断書も提出します。\n" +
      "THIS (カジュアル): 給食では卵を抜いてもらえないかな。必要なら診断書も出せるよ。",
    glossFocus:
      "name the plain-form endings and the particles that create closeness, and " +
      "say plainly who this would be too familiar for",
  },
  polite: {
    grammar: `です・ます体。誰にでも通じる普通の丁寧語。
- 文末: 〜です／〜ます／〜ました／〜ますか／〜てください／〜てもらえますか／〜ていただけますか。
- 使わない（敬語版との差を保つため）: おります（→います）、いたします（→します）、申し上げます（→お願いします）、伺う（→行く・聞く）、拝見（→見る）、存じます（→思います）、ございます（→あります・です）、恐れ入りますが、お手数をおかけしますが、何卒、賜る、幸甚。
- 挨拶は短く（「いつもお世話になっています」「こんにちは」程度）。締めは「よろしくお願いします」。
- カジュアル版より長く、敬語版より軽い。3〜5文。`,
    reader:
      "a child's teacher, a shop, a clinic, a landlord's agent — the correct " +
      "default for almost every everyday message in Japan",
    contrast:
      "NOT THIS (敬語 — wrong rung): 恐れ入りますが、ご確認いただけますでしょうか。よろしくお願い申し上げます。\n" +
      "THIS (丁寧): 確認してもらえますか。よろしくお願いします。",
    glossFocus:
      "explain that です・ます carries respect without distance, and why the " +
      "heavier forms would read as stiff or oddly ceremonial here",
  },
  keigo: {
    grammar: `ビジネスメールの敬語。尊敬語と謙譲語を「誰の動作か」で使い分ける。
- 相手の動作 → 尊敬語: ご確認いただく／ご確認くださる／ご覧になる／おっしゃる／いらっしゃる／お越しになる／ご指示いただく／ご教示いただく／お知らせいただく／ご検討いただく／なさる。
- 自分の動作 → 謙譲語: 伺う／申し上げる／いたします／拝見する／拝受する／存じます／おります／お送りします／ご連絡いたします。
- 相手に何かを頼む文には必ず尊敬語が入る: 「〜いただけますでしょうか」「〜いただけますと幸いです」「〜くださいますようお願いいたします」。尊敬語が一つも無い文章は敬語として失格。
- クッション言葉を1つ以上: 恐れ入りますが／お手数をおかけしますが／お忙しいところ恐縮ですが／差し支えなければ。
- 書き出しは「お世話になっております」。「拝啓」「時下」「〜の候」「敬具」は禁止 — 最敬語専用。締めは「よろしくお願い申し上げます」。
- 使わない（最敬語との差を保つため）: 賜る、幸甚、ご高配、略儀ながら、〜次第です。「時下」は副詞としても使わない。
- 督促状・返送・指摘などの文書を受け取ったことに「ありがとうございます」と礼を言わない。「拝見いたしました」「拝受いたしました」で受け止める。辞退や断りは「お詫び申し上げます」「申し訳ございません」で。
- 丁寧版より長く（4〜6文）、最敬語より短い。`,
    reader: "a company, an office, a manager — ordinary business correspondence",
    contrast:
      "NOT THIS (丁寧 — wrong rung): 明細と写真を送ってもらえますか。よろしくお願いします。\n" +
      "THIS (敬語): 恐れ入りますが、明細と写真をお送りいただけますでしょうか。お手数をおかけしますが、よろしくお願い申し上げます。",
    glossFocus:
      "name the specific 尊敬語/謙譲語 substitutions used and what the split " +
      "signals about who is doing what to whom",
  },
  formal: {
    grammar: `正式な書簡体。頭語・時候の挨拶・主文・末文・結語の構成を必ず備える。
- 構成: 「拝啓」→ 時候の挨拶（個人には「時下ますますご清祥のこととお慶び申し上げます」、組織には「時下ますますご清栄のこととお慶び申し上げます」。「時候の挨拶」という文字列そのものを書いてはいけない）→ 平素のお礼（任意）→「さて、」で主文 →「つきましては、」で依頼 → 末文（「ご多忙のところ誠に恐縮ではございますが、何卒〜」）→「敬具」。
- 本文は敬語版の文をそのまま流用してはいけない。語彙を書簡体に置き換える: 教えて→ご教示賜りたく／送って→ご送付賜りたく・ご提示賜りたく／お願いします→お願い申し上げます／〜ので→〜につき・〜のため／確認しました→拝受いたしました・拝見いたしました／分からない→把握いたしかねる／もし〜なら→〜の場合には／〜してほしい→〜いただきたく存じます／〜賜りますようお願い申し上げる次第です。
- 必ず含める: 賜る（1回以上）、何卒、文末の「〜申し上げます」、「恐縮ではございますが」または「恐縮に存じます」、「〜いただきたく存じます」。使ってよい: ご高配、ご厚情、幸甚に存じます、略儀ながら書中をもって、重ねて。
- 尊敬語・謙譲語の向きは敬語と同じ規則。自分の動作に尊敬語を使わない。「賜る」は相手からもらう物・行為（ご指示・ご配慮・ご検討・ご提示）にのみ付ける — 自分の支払い・提出・欠席には付けない。
- 現代の標準的な書簡体で書く。古語・擬古文・珍しい漢語は使わない（✗ ませぬ／寤醒／〜候）。二重否定や意味の崩れた文を書かない。
- 督促状・返送などネガティブな文書の受領に礼を言わない（「拝受いたしました」で受け止める）。
- 四つの中で最も長い（6〜9文、敬語版の1.3〜1.5倍）。
- 「拝啓」と「敬具」を付けただけで中身が敬語版と同じなら失敗。`,
    reader:
      "a landlord in a dispute, a ward office, or any recipient where the message " +
      "may later be re-read as a record",
    contrast:
      "NOT THIS (敬語 body with 拝啓/敬具 bolted on — wrong rung): 恐れ入りますが、給食では卵を除いた対応をご検討いただけますでしょうか。\n" +
      "THIS (最敬語 — the body itself is recast): つきましては、給食におきまして卵を除いた対応を賜りたく、お願い申し上げる次第です。",
    glossFocus:
      "explain what the 拝啓/敬具 frame and written-style vocabulary signal about " +
      "seriousness and permanence, and why that weight can itself be a message",
  },
};

/**
 * Misdirected honorifics seen in live output. Marker-counting checks cannot
 * catch these; a native reader catches every one, and each makes the foreign
 * resident who sent it look foolish. Shown to every rung that uses keigo.
 */
export const HONORIFIC_DIRECTION = `HONORIFIC DIRECTION — never produce the ✗ form:
✗ ご参加する（自分の参加）→ ○ 参加します／参加いたします
✗ お子さん・お子様・ご主人・奥様（自分の家族）→ ○ 子ども・息子・娘・夫・妻
✗ 弊子ども → ○ 子ども／息子／娘
✗ 〜と伺っております（自分の事情）→ ○ 〜という状況です／〜しております
✗ ご存じなくて／ご存じありません（自分が知らない）→ ○ 存じ上げず／分からず
✗ アレルギーをお持ちで（自分の子）→ ○ アレルギーがあり
✗ ご来院いただけなくなりました（自分の来院）→ ○ 伺えなくなりました
✗ 内訳がご不明な点がございます（自分の疑問）→ ○ 内訳に分かりかねる点がございます
✗ 弊社では／当社では（個人として書くとき）→ ○ 私としては／私どもとしては
✗ 当所より発行いたしました（相手の機関の動作）→ ○ 貴課より送付いただきました
✗ おっしゃられる／ご覧になられる／拝見させていただく（二重敬語）→ ○ おっしゃる／ご覧になる／拝見する
✗ ご予約をいらっしゃいます → ○ 予約をしております
✗ 分割納付を賜りたく（自分の支払い）→ ○ 分割納付をお認めいただきたく
✗ 督促状をご送付いただき、ありがとうございます → ○ 督促状を拝受いたしました
RULE: お／ご＋になる・くださる・いただく ＝ 尊敬語 ＝ 相手の動作だけ。伺う・拝見・申し上げる・いたす・おります ＝ 謙譲語 ＝ 自分（と自分の家族）の動作だけ。`;
