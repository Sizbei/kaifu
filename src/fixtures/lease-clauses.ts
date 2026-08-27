import type { DocumentFixture } from "./documents";

/**
 * 賃貸借契約書 — five excerpts from one contract on the same flat in
 * 菊川. Written so the JUDGE layer has both signal and true negatives:
 *
 *  - lease-restoration  第15条  assigns 日焼け・経年変化 to the tenant and
 *    forbids disputing the landlord's estimate. This is the demo climax.
 *  - lease-deposit      第8条   writes off one month of 敷金 regardless of
 *    the flat's condition (敷引き).
 *  - lease-special      第22条  mixes chargeable 特約 with ordinary house
 *    rules, so a finding must not sweep the whole clause up.
 *  - lease-renewal      第3条   ordinary 更新料 terms — TRUE NEGATIVE.
 *  - lease-termination  第20条  ordinary 解約予告 terms, tracking the
 *    国交省 standard form almost word for word — TRUE NEGATIVE.
 */
export const leaseClauseFixtures: DocumentFixture[] = [
  {
    id: "lease-restoration",
    docType: "lease_clause",
    titleJa: "第15条（原状回復）",
    issuer: "株式会社　両国不動産",
    note: "Charges natural wear-and-tear to the tenant, and bars objection to the landlord's estimate.",
    rawText: `建物賃貸借契約書（写し）　　　　　　　　　　　　　　　　　　　　4／9頁

物件の表示　　東京都墨田区菊川二丁目○番○号　菊川ハイツ　301号室
賃貸人（甲）　株式会社　両国不動産
賃借人（乙）　　　　　　　　　　　　　　　様
管理業者　　　両国不動産管理株式会社

　　　　第15条（原状回復）

１　乙は、本契約が終了したときは、本物件を明け渡すまでに、乙の費用を
　もって、本物件を入居時の原状に回復しなければならない。

２　前項の原状回復には、通常の使用に伴い生じた損耗及び経年変化（畳の
　日焼け、壁クロスの変色、フローリングの色あせ、家具の設置によるへこみ
　等を含む。）の回復を含むものとし、これらに要する費用は乙の負担とする。

３　前項の費用は、甲の指定する業者の見積りにより算出し、第8条に定める
　敷金から控除する。控除してなお不足が生じたときは、乙は、甲から請求を
　受けた日から14日以内にこれを支払わなければならない。

４　乙は、前項の見積りの内容及び金額について、異議を述べることが
　できない。

５　乙が明渡しを遅延した場合、乙は、明渡し完了までの間、賃料の倍額に
　相当する損害金を甲に支払うものとする。`,
    expected: {
      dates: [],
      amounts: [],
      obligations: [
        {
          action:
            "On move-out, restore the flat to its move-in condition at your own cost — the clause counts sun-fading and age-related wear as your responsibility.",
          dueDate: null,
          amount: null,
          conflict: null,
        },
        {
          action:
            "Pay any restoration cost not covered by the deposit within 14 days of being invoiced.",
          dueDate: null,
          amount: null,
          conflict: null,
        },
      ],
    },
  },

  {
    id: "lease-deposit",
    docType: "lease_clause",
    titleJa: "第8条（敷金）",
    issuer: "株式会社　両国不動産",
    note: "One month of the deposit is written off unconditionally (敷引き).",
    rawText: `建物賃貸借契約書（写し）　　　　　　　　　　　　　　　　　　　　3／9頁

物件の表示　　東京都墨田区菊川二丁目○番○号　菊川ハイツ　301号室
賃　　料　　　月額　金108,000円
共益費　　　　月額　金8,000円

　　　　第8条（敷金）

１　乙は、本契約締結時に、敷金として賃料の2か月分に相当する金216,000円を
　甲に預託するものとする。

２　甲は、本契約が終了し、乙が本物件を明け渡したときは、敷金から未払賃料、
　原状回復に要する費用その他本契約から生じる乙の債務の額を控除し、その
　残額を、明渡しの日から2か月以内に乙に返還する。

３　前項の規定にかかわらず、敷金のうち賃料1か月分に相当する金108,000円に
　ついては、本物件の損耗の有無及びその程度にかかわらず償却するものとし、
　乙に返還しない。

４　乙は、本契約の存続中、敷金をもって未払賃料その他の債務の弁済に充当
　することを甲に請求することができない。

５　敷金には利息を付さない。`,
    expected: {
      dates: [],
      amounts: [
        { yen: 108000, raw: "金108,000円", label: "月額賃料" },
        { yen: 8000, raw: "金8,000円", label: "月額共益費" },
        { yen: 216000, raw: "金216,000円", label: "敷金（賃料2か月分）" },
        { yen: 108000, raw: "金108,000円", label: "無条件で償却される敷金（賃料1か月分）" },
      ],
      obligations: [
        {
          action: "Pay a ¥216,000 deposit (two months' rent) at signing.",
          dueDate: null,
          amount: { yen: 216000, raw: "金216,000円", label: "敷金（賃料2か月分）" },
          conflict: null,
        },
        {
          action:
            "Expect ¥108,000 of the deposit to be kept regardless of the flat's condition; the balance is returned within two months of move-out.",
          dueDate: null,
          amount: { yen: 108000, raw: "金108,000円", label: "無条件で償却される敷金（賃料1か月分）" },
          conflict: null,
        },
      ],
    },
  },

  {
    id: "lease-special-terms",
    docType: "lease_clause",
    titleJa: "第22条（特約事項）",
    issuer: "株式会社　両国不動産",
    note: "Chargeable 特約 mixed with ordinary house rules — a finding must not sweep up the whole clause.",
    rawText: `建物賃貸借契約書（写し）　　　　　　　　　　　　　　　　　　　　7／9頁

　　　　第22条（特約事項）

１　本物件の明渡し時におけるハウスクリーニング費用として、乙は、室内の
　使用状況及び清掃の程度にかかわらず、金38,500円（消費税込み）を負担する
　ものとする。

２　入居時及び退去時における鍵の交換費用　金16,500円（消費税込み）は、
　乙の負担とする。

３　乙が本物件内で喫煙した場合、壁クロス及び天井クロスの張替えに要する
　費用の全額を乙が負担する。この場合において、経過年数による減価は
　考慮しない。

４　乙は、本物件の使用に際し、近隣の迷惑となる行為をしてはならない。

５　乙は、階下への騒音に配慮し、午後10時から翌午前7時までの間、洗濯機
　及び掃除機を使用しないものとする。

６　乙は、本契約の期間中、甲が指定する借家人賠償責任保険（2年間・保険料
　金20,000円）に加入し、更新の都度これを継続しなければならない。

７　ペットの飼育及び楽器の演奏は、種類及び時間帯を問わず一切禁止する。

　　　　　　　　　　　　　　　　　　　特約事項確認欄　　乙　　　　　㊞`,
    expected: {
      dates: [],
      amounts: [
        { yen: 38500, raw: "金38,500円", label: "ハウスクリーニング費用（退去時・一律）" },
        { yen: 16500, raw: "金16,500円", label: "鍵交換費用" },
        { yen: 20000, raw: "金20,000円", label: "借家人賠償責任保険料（2年間）" },
      ],
      obligations: [
        {
          action: "Pay ¥38,500 for move-out cleaning regardless of how clean you leave the flat.",
          dueDate: null,
          amount: { yen: 38500, raw: "金38,500円", label: "ハウスクリーニング費用（退去時・一律）" },
          conflict: null,
        },
        {
          action: "Pay ¥16,500 for lock replacement at move-in and again at move-out.",
          dueDate: null,
          amount: { yen: 16500, raw: "金16,500円", label: "鍵交換費用" },
          conflict: null,
        },
        {
          action:
            "Take out the landlord's nominated renter's liability insurance (¥20,000 for two years) and renew it each term.",
          dueDate: null,
          amount: { yen: 20000, raw: "金20,000円", label: "借家人賠償責任保険料（2年間）" },
          conflict: null,
        },
      ],
    },
  },

  {
    id: "lease-renewal",
    docType: "lease_clause",
    titleJa: "第3条（契約期間及び更新）",
    issuer: "株式会社　両国不動産",
    note: "TRUE NEGATIVE — ordinary renewal terms, nothing for JUDGE to flag.",
    rawText: `建物賃貸借契約書（写し）　　　　　　　　　　　　　　　　　　　　2／9頁

　　　　第3条（契約期間及び更新）

１　本契約の期間は、令和8年3月1日から令和10年2月28日までの2年間とする。

２　乙が本契約の更新を希望するときは、期間の満了の3か月前までに、書面に
　より甲にその旨を申し出るものとする。

３　更新にあたり、乙は甲に対し、更新料として新賃料の1か月分に相当する額を
　支払うものとする。

４　更新後の契約期間は2年間とし、その後の更新についても同様とする。

５　甲が更新を拒絶し、又は条件を変更しなければ更新をしない旨を通知する
　ときは、期間の満了の1年前から6か月前までの間に、乙に対し書面により
　通知しなければならない。この場合において、甲は、借地借家法第28条に
　定める正当の事由を必要とする。

６　前項の通知をしなかったときは、本契約は従前と同一の条件で更新された
　ものとみなす。`,
    expected: {
      dates: [
        { iso: "2026-03-01", raw: "令和8年3月1日", label: "契約期間の開始日" },
        { iso: "2028-02-28", raw: "令和10年2月28日", label: "契約期間の満了日" },
      ],
      amounts: [],
      obligations: [
        {
          action:
            "To renew, tell the landlord in writing at least three months before the term ends (by 30 November 2027).",
          dueDate: null,
          amount: null,
          conflict: null,
        },
        {
          action: "On renewal, pay a renewal fee of one month of the new rent.",
          dueDate: null,
          amount: null,
          conflict: null,
        },
      ],
    },
  },

  {
    id: "lease-termination",
    docType: "lease_clause",
    titleJa: "第20条（解約の申入れ）",
    issuer: "株式会社　両国不動産",
    note: "TRUE NEGATIVE — tracks the 国交省 standard form; JUDGE should return 'matches' or nothing.",
    rawText: `建物賃貸借契約書（写し）　　　　　　　　　　　　　　　　　　　　6／9頁

　　　　第20条（解約の申入れ）

１　乙は、甲に対し、少なくとも1か月前に書面により通知することにより、
　本契約を解約することができる。

２　乙は、前項に定める予告期間に満たない解約の申入れをする場合、予告期間
　に不足する日数分の賃料相当額を甲に支払うことにより、解約の申入れの日
　から1か月を経過する日を待たずに本契約を解約することができる。

３　甲は、乙に対し、6か月前に書面により通知することにより、本契約の解約
　を申し入れることができる。この場合において、甲は、借地借家法第28条に
　定める正当の事由を必要とする。

４　第1項の通知は、甲の定める書式による解約通知書を管理業者に提出する
　方法により行うものとする。

５　本条の規定により本契約が終了したときは、乙は、第15条の定めるところ
　により本物件を明け渡すものとする。`,
    expected: {
      dates: [],
      amounts: [],
      obligations: [
        {
          action:
            "To move out, give the management company at least one month's written notice on their form.",
          dueDate: null,
          amount: null,
          conflict: null,
        },
      ],
    },
  },
];
