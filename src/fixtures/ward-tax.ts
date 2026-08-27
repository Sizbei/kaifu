import type { DocumentFixture } from "./documents";

/**
 * 墨田区役所 — the two 納付書-bearing letters. Both split the year into
 * 期別 instalments, both carry 延滞金 language, and both have a 納期限
 * that has been pushed to the following Monday because the month end
 * falls on a weekend (第3期 of the tax letter, 第5期 of the NHI letter).
 */
export const wardTaxFixtures: DocumentFixture[] = [
  {
    id: "ward-residence-tax",
    docType: "ward_tax_letter",
    titleJa: "令和8年度　特別区民税・都民税　納税通知書",
    issuer: "墨田区役所 税務課",
    rawText: `　　　　令和8年度　特別区民税・都民税　納税通知書（普通徴収）

　　　　　　　　　　　　　　　　　　　　　　　墨田区長　　　　　　　㊞
　　　　　　　　　　　　　　　　　　　　発行日　　令和8年6月12日
　　　　　　　　　　　　　　　　　　　　通知書番号　08－1234567

　〒130－0024
　墨田区菊川二丁目○番○号　菊川ハイツ301
　　　　　　　　　　　　　　　　　　　　　　　　　　　　　様

　地方税法及び墨田区特別区税条例の規定により、令和8年度分の特別区民税・
都民税の税額を次のとおり決定しましたので通知します。

■　課税の内容
　　総所得金額　　　　　　　　　　　　　　　4,286,000円
　　所得控除額合計　　　　　　　　　　　　　1,472,000円
　　課税標準額　　　　　　　　　　　　　　　2,814,000円
　　特別区民税　所得割額　　　　　　　　　　　168,840円
　　特別区民税　均等割額　　　　　　　　　　　　3,000円
　　都　民　税　所得割額　　　　　　　　　　　112,560円
　　都　民　税　均等割額　　　　　　　　　　　　1,000円
　　森林環境税（国税）　　　　　　　　　　　　　1,000円
　　税額控除等　　　　　　　　　　　　　　　△100,000円
　　　　　　　　　　　　　　　年　税　額　　　186,400円

■　納付方法及び納期限（年4回）
　　　期別　　　　　納付額　　　　　　　納期限
　　　第1期　　　47,200円　　　　令和8年6月30日（火）
　　　第2期　　　46,400円　　　　令和8年8月31日（月）
　　　第3期　　　46,400円　　　　令和8年11月2日（月）
　　　第4期　　　46,400円　　　　令和9年2月1日（月）
　　※10月31日が土曜日にあたるため、第3期の納期限は11月2日となります。

■　ご注意
　・同封の納付書により、金融機関、郵便局、コンビニエンスストア又は区役所
　　窓口でお納めください。スマートフォン決済アプリもご利用いただけます。
　・納期限を過ぎますと、納期限の翌日から納付の日までの期間に応じ、延滞金
　　を加算して納めていただくことになります（納期限の翌日から1か月を経過
　　する日までは年2.4パーセント、それ以降は年8.7パーセント）。
　・納期限までに納付がないときは督促状を送付します。督促状を発した日から
　　10日を経過してもなお完納されない場合は、地方税法第331条の規定により
　　財産の差押えを行うことがあります。
　・災害、失業、病気等により納付が困難な場合は、納期限前に必ずご相談
　　ください。分割納付等のご相談に応じます。
　・給与からの特別徴収又は口座振替をご利用の方は、この通知書による納付は
　　不要です。口座振替の振替日は各納期限の当日です。

　【お問い合わせ】墨田区役所　税務課　課税係
　　〒130－8640　墨田区吾妻橋一丁目23番20号
　　電話　03－5608－0000（直通）　受付　平日8時30分〜17時`,
    expected: {
      dates: [
        { iso: "2026-06-12", raw: "令和8年6月12日", label: "発行日" },
        { iso: "2026-06-30", raw: "令和8年6月30日（火）", label: "特別区民税・都民税 第1期 納期限" },
        { iso: "2026-08-31", raw: "令和8年8月31日（月）", label: "特別区民税・都民税 第2期 納期限" },
        { iso: "2026-11-02", raw: "令和8年11月2日（月）", label: "特別区民税・都民税 第3期 納期限" },
        { iso: "2027-02-01", raw: "令和9年2月1日（月）", label: "特別区民税・都民税 第4期 納期限" },
      ],
      amounts: [
        { yen: 186400, raw: "186,400円", label: "令和8年度 年税額" },
        { yen: 47200, raw: "47,200円", label: "第1期 納付額" },
        { yen: 46400, raw: "46,400円", label: "第2期 納付額" },
        { yen: 46400, raw: "46,400円", label: "第3期 納付額" },
        { yen: 46400, raw: "46,400円", label: "第4期 納付額" },
      ],
      obligations: [
        {
          action: "Pay ¥47,200 — residence tax instalment 1 of 4.",
          dueDate: { iso: "2026-06-30", raw: "令和8年6月30日（火）", label: "第1期 納期限" },
          amount: { yen: 47200, raw: "47,200円", label: "第1期 納付額" },
          conflict: null,
        },
        {
          action: "Pay ¥46,400 — residence tax instalment 2 of 4.",
          dueDate: { iso: "2026-08-31", raw: "令和8年8月31日（月）", label: "第2期 納期限" },
          amount: { yen: 46400, raw: "46,400円", label: "第2期 納付額" },
          conflict: null,
        },
        {
          action: "Pay ¥46,400 — residence tax instalment 3 of 4.",
          dueDate: { iso: "2026-11-02", raw: "令和8年11月2日（月）", label: "第3期 納期限" },
          amount: { yen: 46400, raw: "46,400円", label: "第3期 納付額" },
          conflict: null,
        },
        {
          action: "Pay ¥46,400 — residence tax instalment 4 of 4.",
          dueDate: { iso: "2027-02-01", raw: "令和9年2月1日（月）", label: "第4期 納期限" },
          amount: { yen: 46400, raw: "46,400円", label: "第4期 納付額" },
          conflict: null,
        },
      ],
    },
  },

  {
    id: "ward-national-health-insurance",
    docType: "ward_tax_letter",
    titleJa: "令和8年度　国民健康保険料　納入通知書",
    issuer: "墨田区役所 国保年金課",
    rawText: `　　　　　令和8年度　国民健康保険料　納入通知書　兼　決定通知書

　　　　　　　　　　　　　　　　　　　　　　　墨田区長　　　　　　　㊞
　　　　　　　　　　　　　　　　　　　　通知年月日　令和8年6月15日
　　　　　　　　　　　　　　　　　　　　世帯番号　　1234－5678

　墨田区菊川二丁目○番○号　菊川ハイツ301
　　　　　　　　　　　　　　　　　　　　　　　　　様（世帯主）

　国民健康保険法及び墨田区国民健康保険条例に基づき、令和8年度の保険料を
次のとおり決定しましたので通知します。保険料は、世帯主の方に加入者全員分
をまとめて納めていただきます（世帯主が加入していない場合も同様です）。

■　保険料の内訳（加入者　2名）
　　　　　　　　　　　　　　所得割額　　　均等割額　　　　　　合計
　　基礎（医療）分　　　　114,300円　　　97,200円　　　211,500円
　　後期高齢者支援金分　　 38,900円　　　33,600円　　　 72,500円
　　介護納付金分　　　　　　　　0円　　　　　0円　　　　　　0円
　　　　　　　　　　　　　　　　　　年間保険料額　　　　284,000円

■　納期及び納付額（第1期〜第8期　各35,500円）
　　　第1期　令和8年6月30日（火）　　　第5期　令和8年11月2日（月）
　　　第2期　令和8年7月31日（金）　　　第6期　令和8年11月30日（月）
　　　第3期　令和8年8月31日（月）　　　第7期　令和8年12月28日（月）
　　　第4期　令和8年9月30日（水）　　　第8期　令和9年2月1日（月）

■　ご案内
　・保険料は前年中の所得を基に計算しています。所得の申告がお済みでない
　　方は、均等割額の軽減が受けられませんので、速やかにご申告ください。
　・口座振替をご利用いただくと、納め忘れがなく便利です。キャッシュカード
　　をお持ちいただければ、区役所窓口でお申込みできます。
　・納期限を過ぎた場合、納期限の翌日から納付の日までの日数に応じて延滞金
　　が加算されます。また、督促状を送付し、なお納付がないときは、財産の
　　差押え等の滞納処分を行うことがあります。
　・失業、廃業、収入の減少等により納付が困難な場合は、必ず納期限前に
　　ご相談ください。分割納付や減免の制度があります。
　・保険証（マイナ保険証をお持ちでない方には資格確認書）は、保険料の
　　納付状況にかかわらず交付されます。

　【お問い合わせ】墨田区役所　国保年金課　保険料係
　　電話　03－5608－0000（直通）　受付　平日8時30分〜17時`,
    expected: {
      dates: [
        { iso: "2026-06-15", raw: "令和8年6月15日", label: "通知年月日" },
        { iso: "2026-06-30", raw: "令和8年6月30日（火）", label: "国民健康保険料 第1期 納期限" },
        { iso: "2026-07-31", raw: "令和8年7月31日（金）", label: "国民健康保険料 第2期 納期限" },
        { iso: "2026-08-31", raw: "令和8年8月31日（月）", label: "国民健康保険料 第3期 納期限" },
        { iso: "2026-09-30", raw: "令和8年9月30日（水）", label: "国民健康保険料 第4期 納期限" },
        { iso: "2026-11-02", raw: "令和8年11月2日（月）", label: "国民健康保険料 第5期 納期限" },
        { iso: "2026-11-30", raw: "令和8年11月30日（月）", label: "国民健康保険料 第6期 納期限" },
        { iso: "2026-12-28", raw: "令和8年12月28日（月）", label: "国民健康保険料 第7期 納期限" },
        { iso: "2027-02-01", raw: "令和9年2月1日（月）", label: "国民健康保険料 第8期 納期限" },
      ],
      amounts: [
        { yen: 284000, raw: "284,000円", label: "令和8年度 年間保険料額" },
        { yen: 211500, raw: "211,500円", label: "基礎（医療）分 合計" },
        { yen: 72500, raw: "72,500円", label: "後期高齢者支援金分 合計" },
        { yen: 35500, raw: "35,500円", label: "各期の納付額（第1期〜第8期）" },
      ],
      obligations: [
        {
          action: "Pay ¥35,500 — national health insurance instalment 1 of 8.",
          dueDate: { iso: "2026-06-30", raw: "令和8年6月30日（火）", label: "第1期 納期限" },
          amount: { yen: 35500, raw: "35,500円", label: "第1期 納付額" },
          conflict: null,
        },
        {
          action: "Pay ¥35,500 — national health insurance instalment 2 of 8.",
          dueDate: { iso: "2026-07-31", raw: "令和8年7月31日（金）", label: "第2期 納期限" },
          amount: { yen: 35500, raw: "35,500円", label: "第2期 納付額" },
          conflict: null,
        },
        {
          action: "Pay ¥35,500 — national health insurance instalment 3 of 8.",
          dueDate: { iso: "2026-08-31", raw: "令和8年8月31日（月）", label: "第3期 納期限" },
          amount: { yen: 35500, raw: "35,500円", label: "第3期 納付額" },
          conflict: null,
        },
        {
          action: "Pay ¥35,500 — national health insurance instalment 4 of 8.",
          dueDate: { iso: "2026-09-30", raw: "令和8年9月30日（水）", label: "第4期 納期限" },
          amount: { yen: 35500, raw: "35,500円", label: "第4期 納付額" },
          conflict: null,
        },
        {
          action: "Pay ¥35,500 — national health insurance instalment 5 of 8.",
          dueDate: { iso: "2026-11-02", raw: "令和8年11月2日（月）", label: "第5期 納期限" },
          amount: { yen: 35500, raw: "35,500円", label: "第5期 納付額" },
          conflict: null,
        },
        {
          action: "Pay ¥35,500 — national health insurance instalment 6 of 8.",
          dueDate: { iso: "2026-11-30", raw: "令和8年11月30日（月）", label: "第6期 納期限" },
          amount: { yen: 35500, raw: "35,500円", label: "第6期 納付額" },
          conflict: null,
        },
        {
          action: "Pay ¥35,500 — national health insurance instalment 7 of 8.",
          dueDate: { iso: "2026-12-28", raw: "令和8年12月28日（月）", label: "第7期 納期限" },
          amount: { yen: 35500, raw: "35,500円", label: "第7期 納付額" },
          conflict: null,
        },
        {
          action: "Pay ¥35,500 — national health insurance instalment 8 of 8.",
          dueDate: { iso: "2027-02-01", raw: "令和9年2月1日（月）", label: "第8期 納期限" },
          amount: { yen: 35500, raw: "35,500円", label: "第8期 納付額" },
          conflict: null,
        },
      ],
    },
  },
];
