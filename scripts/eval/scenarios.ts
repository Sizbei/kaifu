/**
 * Eval scenarios: KAIFŪ's actual use cases. Each is a document a resident of
 * Japan receives and must answer, where getting the register wrong has real
 * cost. The facts deliberately differ from the prompt exemplars (peanuts, a
 * ¥200,000 deposit) so a copied exemplar is visibly wrong.
 */

import type { DocType } from "@/lib/types";

export interface Scenario {
  readonly id: string;
  readonly label: string;
  readonly recipient: string;
  readonly document: string;
  readonly intent: string;
  readonly docType: DocType;
  readonly latinAllowed: readonly string[];
}

export const SCENARIOS: readonly Scenario[] = [
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
