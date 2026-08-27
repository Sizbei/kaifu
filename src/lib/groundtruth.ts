/**
 * KAIFŪ ground truth — published 国土交通省 (MLIT) guidance on residential
 * leases.
 *
 * This corpus is the product's legal safe harbour. Every JudgeFinding must
 * point at an entry here, and judge.ts verifies that by exact match rather
 * than by trusting the model's output. A fabricated government citation is
 * the worst defect this product can ship, so the rule is: if it is not in
 * this file, it does not get shown to a user.
 *
 * Two sources, both fetched and confirmed live:
 *   - 原状回復をめぐるトラブルとガイドライン（再改訂版）平成23年8月
 *     landing: https://www.mlit.go.jp/jutakukentiku/house/jutakukentiku_house_tk3_000021.html
 *   - 賃貸住宅標準契約書（平成30年3月版・連帯保証人型）
 *     landing: https://www.mlit.go.jp/jutakukentiku/house/jutakukentiku_house_tk3_000023.html
 *
 * `guidanceEn` is deliberately written in the indicative — no modal verbs,
 * no validity judgements. The model paraphrases these strings into
 * `guidelineSays`, so anything advisory here would be echoed downstream and
 * then killed by assertNoAdviceLanguage. Stating the guidance flatly keeps
 * findings alive AND keeps them inside 弁護士法 72条.
 */

import type { JudgeFinding } from "@/lib/types";

export type Citation = JudgeFinding["citation"];

export interface GroundTruthEntry {
  /** Stable key. Referenced by tests and by logs; never shown to the user. */
  id: string;
  /** Human label for the topic, for debugging and prompt headings. */
  topic: string;
  /** The guidance in Japanese — verbatim or a faithful excerpt. */
  guidanceJa: string;
  /** Plain-English rendering. Indicative voice only. See file header. */
  guidanceEn: string;
  /** Japanese clause keywords that route a clause to this entry. */
  hints: readonly string[];
  citation: Citation;
}

const GUIDELINE = "国土交通省「原状回復をめぐるトラブルとガイドライン（再改訂版）」（平成23年8月）";
/** Chapter 1 PDF; contains 別表1–別表4. */
const GUIDELINE_CH1_URL = "https://www.mlit.go.jp/common/000991391.pdf";
/** The Q&A is published as its own PDF, with its own page numbering. */
const GUIDELINE_QA_URL = "https://www.mlit.go.jp/common/000991393.pdf";

const MODEL_LEASE = "国土交通省「賃貸住宅標準契約書」（平成30年3月版・連帯保証人型）";
const MODEL_LEASE_URL = "https://www.mlit.go.jp/common/001479827.pdf";

export const GROUND_TRUTH: readonly GroundTruthEntry[] = [
  {
    id: "genjo-kaifuku-definition",
    topic: "原状回復の定義と費用負担の一般原則",
    guidanceJa:
      "原状回復とは、賃借人の居住、使用により発生した建物価値の減少のうち、" +
      "賃借人の故意・過失、善管注意義務違反、その他通常の使用を超えるような" +
      "使用による損耗・毀損を復旧すること。" +
      "建物・設備等の自然的な劣化・損耗等（経年変化）及び賃借人の通常の使用に" +
      "より生ずる損耗等（通常損耗）の修繕は、賃貸人が負担すべきものとされている。",
    guidanceEn:
      "MLIT defines restoration (原状回復) as making good the loss in building " +
      "value caused by the tenant's occupancy and use, limited to deterioration " +
      "and damage arising from the tenant's intent or negligence, from breach of " +
      "the duty of care of a prudent manager (善管注意義務), or from other use " +
      "beyond ordinary use. Natural deterioration of the building and its " +
      "equipment over time (経年変化) and wear arising from the tenant's ordinary " +
      "use (通常損耗) are placed on the landlord's side of the cost allocation.",
    hints: [
      "原状回復",
      "善管注意義務",
      "故意・過失",
      "故意又は過失",
      "通常の使用",
      "建物価値",
      "明渡し",
      "明け渡し",
      "退去時",
    ],
    citation: {
      source: GUIDELINE,
      section: "第1章 II 1「賃借人の原状回復義務とは何か」(2) 表2「原状回復の定義」（P.8）",
      url: GUIDELINE_CH1_URL,
    },
  },

  {
    id: "genjo-kaifuku-wear-examples",
    topic: "経年変化・通常損耗の具体例（修繕分担表）",
    guidanceJa:
      "別表3「賃貸人・賃借人の修繕分担表」において、賃貸人の負担となるものとして、" +
      "「家具の設置による床、カーペットのへこみ、設置跡」「畳の変色、フローリングの色落ち" +
      "（日照、建物構造欠陥による雨漏りなどで発生したもの）」「テレビ、冷蔵庫等の後部壁面の" +
      "黒ずみ（いわゆる電気ヤケ）」「壁に貼ったポスターや絵画の跡」「壁等の画鋲、ピン等の穴" +
      "（下地ボードの張替えは不要な程度のもの）」「エアコン（賃借人所有）設置による壁のビス穴、跡」" +
      "「クロスの変色（日照などの自然現象によるもの）」が挙げられている。" +
      "賃借人の負担となるものとしては、「壁等のくぎ穴、ネジ穴（重量物をかけるためにあけたもので、" +
      "下地ボードの張替えが必要な程度のもの）」「タバコ等のヤニ・臭い」「カーペットに飲み物等を" +
      "こぼしたことによるシミ、カビ（こぼした後の手入れ不足等の場合）」「引越作業等で生じた" +
      "引っかきキズ」が挙げられている。",
    guidanceEn:
      "MLIT's model schedule of repair-cost allocation lists on the LANDLORD's " +
      "side: dents and marks in flooring or carpet from placing furniture; " +
      "discolouration of tatami and fading of flooring caused by sunlight or by " +
      "rain entering through a structural defect; darkening of the wall behind a " +
      "television or refrigerator (電気ヤケ); marks left by posters or pictures; " +
      "thumbtack and pin holes in walls that do not go so far as to call for " +
      "replacing the backing board; screw holes and marks from a tenant-owned air " +
      "conditioner; and fading of wallpaper from sunlight or other natural causes. " +
      "It lists on the TENANT's side: nail and screw holes made to hang heavy " +
      "objects where the backing board is replaced; tobacco tar and odour; stains " +
      "and mould in carpet from spilled drinks left untreated; and scratches made " +
      "during a move.",
    hints: [
      "日焼け",
      "変色",
      "色落ち",
      "へこみ",
      "設置跡",
      "画鋲",
      "ピン",
      "くぎ穴",
      "釘穴",
      "ネジ穴",
      "ビス穴",
      "電気ヤケ",
      "黒ずみ",
      "クロス",
      "壁紙",
      "壁面",
      "畳",
      "フローリング",
      "カーペット",
      "網戸",
      "経年変化",
      "通常損耗",
      "ヤニ",
    ],
    citation: {
      source: GUIDELINE,
      section:
        "別表3「契約書に添付する原状回復の条件に関する様式（例）」Ⅰ-1「賃貸人・賃借人の修繕分担表」（P.25）",
      url: GUIDELINE_CH1_URL,
    },
  },

  {
    id: "tsujo-sonmo-tokuyaku",
    topic: "通常損耗を賃借人に負担させる特約の要件",
    guidanceJa:
      "経年変化や通常損耗に対する修繕業務等を賃借人に負担させる特約は、賃借人に法律上、" +
      "社会通念上の義務とは別個の新たな義務を課すことになるため、次の要件を満たしていなければ" +
      "効力を争われることに十分留意すべきである。" +
      "【賃借人に特別の負担を課す特約の要件】" +
      "① 特約の必要性があり、かつ、暴利的でないなどの客観的、合理的理由が存在すること" +
      "② 賃借人が特約によって通常の原状回復義務を超えた修繕等の義務を負うことについて認識していること" +
      "③ 賃借人が特約による義務負担の意思表示をしていること。" +
      "最高裁判例は、賃借人が補修費用を負担することになる通常損耗及び経年変化の範囲が" +
      "賃貸借契約書の条項自体に具体的に明記されているか、又は賃貸人が口頭により説明し賃借人が" +
      "その旨を明確に認識して合意の内容としたと認められるなど、通常損耗補修特約が明確に" +
      "合意されていることが必要であるとしている。",
    guidanceEn:
      "MLIT states three conditions for a special clause (特約) that places wear " +
      "from ordinary use or age on the tenant, because such a clause adds an " +
      "obligation beyond the ordinary one: (1) there is a need for the special " +
      "clause and an objective, rational reason for it, such that it is not one " +
      "of excessive profit-taking (暴利的); (2) the tenant is aware of taking on " +
      "repair obligations going beyond ordinary restoration; and (3) the tenant " +
      "has expressed an intention to take on that obligation. MLIT further cites " +
      "Supreme Court reasoning that the specific scope of the ordinary wear and " +
      "age-related change whose repair cost falls to the tenant appears in the " +
      "wording of the lease itself, or else the landlord explains it orally and " +
      "the tenant clearly recognises it and takes it into the agreement.",
    hints: [
      "特約",
      "本特約",
      "通常損耗",
      "経年変化",
      "賃借人の負担とする",
      "借主の負担とする",
      "負担するものとする",
      "一切",
      "全額",
    ],
    citation: {
      source: GUIDELINE,
      section: "第1章 I 2(2)「特約について」【賃借人に特別の負担を課す特約の要件】（P.6）",
      url: GUIDELINE_CH1_URL,
    },
  },

  {
    id: "shikikin-return",
    topic: "敷金の返還と控除",
    guidanceJa:
      "第6条（敷金）第3項「甲は、本物件の明渡しがあったときは、遅滞なく、敷金の全額を乙に" +
      "返還しなければならない。ただし、本物件の明渡し時に、賃料の滞納、第15条に規定する" +
      "原状回復に要する費用の未払いその他の本契約から生じる乙の債務の不履行が存在する場合には、" +
      "甲は、当該債務の額を敷金から差し引いた額を返還するものとする。」" +
      "同条第4項「前項ただし書の場合には、甲は、敷金から差し引く債務の額の内訳を乙に" +
      "明示しなければならない。」",
    guidanceEn:
      "Under Article 6 of MLIT's model residential lease, the deposit (敷金) is " +
      "security for obligations arising under the contract. On vacating, the " +
      "landlord returns the full deposit without delay; where at that point there " +
      "is unpaid rent, unpaid restoration cost under Article 15, or another " +
      "unperformed obligation of the tenant under the contract, the landlord " +
      "returns the deposit less the amount of those obligations. Where an amount " +
      "is deducted, the model lease has the landlord set out for the tenant an " +
      "itemised breakdown of what was deducted.",
    hints: [
      "敷金",
      "保証金",
      "預り金",
      "償却",
      "敷引",
      "敷引き",
      "返還",
      "差し引",
      "差引",
      "精算",
      "清算",
    ],
    citation: {
      source: MODEL_LEASE,
      section: "第6条（敷金）第3項・第4項",
      url: MODEL_LEASE_URL,
    },
  },

  {
    id: "koshinryo-not-in-model-lease",
    topic: "更新料と契約更新",
    guidanceJa:
      "第2条（契約期間及び更新）「契約期間は、頭書（２）に記載するとおりとする。" +
      "２ 甲及び乙は、協議の上、本契約を更新することができる。」" +
      "解説コメントは、第2項について「賃貸借契約は契約期間の満了により必ず終了するものではなく、" +
      "当事者間の合意により契約が更新（合意更新）できることを確認的に記述している」と説明している。" +
      "同標準契約書及びその解説コメントには、更新料に関する条項は置かれていない。",
    guidanceEn:
      "Article 2 of MLIT's model residential lease sets the contract term and " +
      "provides that the parties renew the contract by consultation between them; " +
      "the accompanying commentary describes this as confirming that a lease does " +
      "not necessarily end when the term expires and that the parties renew it by " +
      "agreement. Neither the model lease nor its commentary contains any " +
      "renewal-fee (更新料) provision — a renewal fee appears only where the " +
      "parties' own contract adds one.",
    hints: ["更新料", "更新事務手数料", "更新手数料", "契約更新", "更新時", "更新する"],
    citation: {
      source: MODEL_LEASE,
      section: "第2条（契約期間及び更新）および同条の解説コメント",
      url: MODEL_LEASE_URL,
    },
  },

  {
    id: "house-cleaning-tokuyaku",
    topic: "ハウスクリーニング特約",
    guidanceJa:
      "Q16「賃貸借契約にクリーニング特約が付いていたために、契約が終了して退去する際に" +
      "一定の金額を敷金から差し引かれました。このような特約は有効ですか。」" +
      "A「クリーニング特約については①賃借人が負担すべき内容・範囲が示されているか、" +
      "②本来賃借人負担とならない通常損耗分についても負担させるという趣旨及び負担することになる" +
      "通常損耗の具体的範囲が明記されているか或いは口頭で説明されているか、③費用として妥当か" +
      "等の点から有効・無効が判断されます。」" +
      "なお別表3の修繕分担表では、「専門業者による全体のハウスクリーニング（賃借人が通常の清掃を" +
      "実施している場合）」は賃貸人の負担となるものとして挙げられている。",
    guidanceEn:
      "MLIT's Q&A on cleaning special clauses (クリーニング特約) sets out three " +
      "points it looks at: (1) whether the content and scope the tenant bears is " +
      "set out; (2) whether the lease states in writing, or the landlord explains " +
      "orally, both that the tenant also bears ordinary wear that would not " +
      "otherwise fall to the tenant and the specific scope of that ordinary wear; " +
      "and (3) whether the amount is commensurate. Separately, MLIT's schedule of " +
      "repair-cost allocation lists whole-unit professional cleaning on the " +
      "landlord's side where the tenant has carried out ordinary cleaning.",
    hints: [
      "ハウスクリーニング",
      "クリーニング",
      "清掃",
      "室内清掃",
      "消毒",
      "抗菌",
      "エアコン洗浄",
    ],
    citation: {
      source: GUIDELINE,
      section: "Q&A Q16（P.45）",
      url: GUIDELINE_QA_URL,
    },
  },
] as const;

/**
 * Exact citation lookup. judge.ts uses this to verify a model-produced
 * citation rather than trusting it — the model can only ever echo a
 * citation it was handed, and anything else is dropped.
 */
export function findEntryByCitation(
  citation: Citation,
  entries: readonly GroundTruthEntry[] = GROUND_TRUTH,
): GroundTruthEntry | undefined {
  return entries.find(
    (e) =>
      e.citation.source === citation.source &&
      e.citation.section === citation.section &&
      e.citation.url === citation.url,
  );
}
