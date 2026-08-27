import { REGISTERS, type ActionCard, type RegisterId, type RegisterRendering, type ReplyEvent } from "@/lib/types";

/**
 * Dev-only fixtures behind ?mock=. The backend routes land after this UI,
 * so these exist to make every branch of the card reviewable — including
 * the ones nobody wants to hit: a conflicting date, and a scan too poor
 * to produce obligations at all.
 */

export type MockScenario = "school" | "lease" | "unclear";

export function parseMock(search: string): MockScenario | null {
  const value = new URLSearchParams(search).get("mock");
  if (!value) return null;
  if (value === "lease") return "lease";
  if (value === "unclear") return "unclear";
  return "school";
}

const SCHOOL: ActionCard = {
  docType: "school_notice",
  whatThisIs: "Permission slip and fee for the autumn class trip",
  titleJa: "秋の遠足のお知らせ（三年生）",
  issuer: "みどり第二小学校　三年二組",
  summary:
    "Your child's year group is going to Tama Zoological Park on Friday 10 October. The school needs the signed slip back and the ¥1,200 fee paid before the trip. Lunch is not provided.",
  summaryOnly: false,
  findings: [],
  obligations: [
    {
      action: "Sign the tear-off slip and send it back with your child.",
      dueDate: { iso: "2026-10-03", raw: "令和8年10月3日（金）", label: "提出期限" },
      amount: null,
      conflict: null,
    },
    {
      action: "Pay the ¥1,200 trip fee in the envelope provided.",
      dueDate: { iso: "2026-10-03", raw: "10月3日（金）まで", label: "納入期限" },
      amount: { yen: 1200, raw: "1,200円", label: "参加費（交通費・入園料）" },
      conflict: null,
    },
    {
      action: "Pack a boxed lunch, a drink and a rain jacket on the day.",
      dueDate: { iso: "2026-10-10", raw: "10月10日（金）", label: "遠足当日" },
      amount: null,
      conflict: {
        field: "dueDate",
        modelSaw: "2026-10-09",
        documentSaid: "10月10日（金）",
      },
    },
  ],
};

const LEASE: ActionCard = {
  docType: "lease_clause",
  whatThisIs: "Restoration and cleaning clauses in your tenancy agreement",
  titleJa: "賃貸借契約書　第14条（原状回復）・第15条（特約事項）",
  issuer: "株式会社サンライズ住宅管理",
  summary:
    "Two clauses set out what you pay for when you move out: a fixed cleaning charge, and restoration of the walls and flooring. Below, each clause is set against the national guideline that covers the same point.",
  summaryOnly: false,
  obligations: [
    {
      action: "Give written notice before you move out.",
      dueDate: { iso: "2027-01-31", raw: "退去日の1ヶ月前まで", label: "解約予告" },
      amount: null,
      conflict: null,
    },
    {
      action: "Pay the fixed room-cleaning charge on departure.",
      dueDate: null,
      amount: { yen: 44000, raw: "44,000円（税込）", label: "室内クリーニング費" },
      conflict: {
        field: "amount",
        modelSaw: "40,000円",
        documentSaid: "44,000円（税込）",
      },
    },
  ],
  findings: [
    {
      clauseJa:
        "第15条　借主は退去時、経過年数にかかわらず、壁クロスの全面張替費用を負担するものとする。",
      clausePlain:
        "The clause makes you pay to replace all the wallpaper when you leave, no matter how long you lived there.",
      guidelineSays:
        "The guideline treats wallpaper as depreciating over roughly six years, and describes wear from ordinary living as the landlord's cost rather than the tenant's.",
      citation: {
        source: "国土交通省「原状回復をめぐるトラブルとガイドライン」(再改訂版)",
        section: "第2章 II — 経過年数の考慮",
        url: "https://www.mlit.go.jp/jutakukentiku/house/jutakukentiku_house_tk3_000020.html",
      },
      status: "differs",
    },
    {
      clauseJa: "第14条　借主の故意・過失による損傷は、借主の負担で原状回復する。",
      clausePlain:
        "Damage you cause deliberately or through carelessness is repaired at your cost.",
      guidelineSays:
        "The guideline describes the same allocation: damage beyond ordinary use is attributed to the tenant.",
      citation: {
        source: "国土交通省「原状回復をめぐるトラブルとガイドライン」(再改訂版)",
        section: "第1章 II — 原状回復の定義",
        url: "https://www.mlit.go.jp/jutakukentiku/house/jutakukentiku_house_tk3_000020.html",
      },
      status: "matches",
    },
  ],
};

const UNCLEAR: ActionCard = {
  docType: "unknown",
  whatThisIs: "A notice from a ward office, partly unreadable",
  titleJa: "○○区役所　国民健康保険課からのお知らせ",
  issuer: null,
  summary:
    "This looks like a notice from a ward office health-insurance section. The photo was too dark and too creased along the fold for the dates and amounts to be read with confidence, so none are shown.",
  summaryOnly: true,
  obligations: [],
  findings: [],
};

export function mockCard(scenario: MockScenario): ActionCard {
  if (scenario === "lease") return LEASE;
  if (scenario === "unclear") return UNCLEAR;
  return SCHOOL;
}

/** Canned answer to: "tell the teacher my son is allergic to eggs". */
export const MOCK_RENDERINGS: Record<RegisterId, RegisterRendering> = {
  casual: {
    register: "casual",
    textJa:
      "先生、お世話になってます。うちの子、卵アレルギーがあるので、遠足のお弁当は卵抜きで持たせますね。よろしくお願いします。",
    glossEn:
      "Plain endings and な-form softeners. Fine in a LINE message to a teacher you speak to at pick-up every day — too light for anything on paper.",
  },
  polite: {
    register: "polite",
    textJa:
      "○○先生　いつもお世話になっております。三年二組の○○の母です。息子は卵アレルギーがありますので、遠足当日のお弁当は卵を使わないものを持たせます。ご配慮のほどよろしくお願いいたします。",
    glossEn:
      "です・ます throughout, with the standard お世話になっております opening and your child's class named. This is the safe default for anything sent to school.",
  },
  keigo: {
    register: "keigo",
    textJa:
      "○○先生　いつも大変お世話になっております。三年二組○○の保護者でございます。息子には卵アレルギーがございますため、遠足当日の弁当は卵を除いたものを持参させていただきます。お手数をおかけいたしますが、何卒よろしくお願い申し上げます。",
    glossEn:
      "Humble forms — ございます, 持参させていただきます — place you below the reader. Right when the note is read by staff you have not met, or kept on file.",
  },
  formal: {
    register: "formal",
    textJa:
      "みどり第二小学校　○○先生\n拝啓　平素より格別のご高配を賜り、厚く御礼申し上げます。\nさて、標記遠足につきまして、本児には鶏卵アレルギーがございますため、当日の弁当は鶏卵を除いたものを持参させる所存でございます。\nご繁忙のところ恐縮に存じますが、何卒ご高配賜りますようお願い申し上げます。\n敬具",
    glossEn:
      "Full letter conventions: 拝啓／敬具 brackets, 標記 to refer back to the notice, 所存でございます for intent. Correct on a printed reply slip; stiff and slightly cold in a message.",
  },
};

export const MOCK_STREAM_SPEED: Record<RegisterId, number> = {
  casual: 26,
  polite: 34,
  keigo: 46,
  formal: 58,
};

/* -------------------------------------------------------------------------- *
 * Mock: emits the same ReplyEvent shape through the same reducer, with the
 * four registers advancing at different rates so the interleaving is real.
 * -------------------------------------------------------------------------- */

/** ?fail=keigo makes one register error mid-stream, so the degraded slider
 *  stop can be reviewed without waiting for a real model failure. */
function failingRegister(): RegisterId | null {
  const value = new URLSearchParams(window.location.search).get("fail");
  return REGISTERS.some((r) => r.id === value) ? (value as RegisterId) : null;
}

export function runMockReplyStream(
  emit: (events: ReplyEvent[]) => void,
  finish: () => void,
  timersRef: { current: number[] },
) {
  const doomed = failingRegister();
  const cursors = REGISTERS.map((r) => ({ id: r.id, at: 0, glossed: false }));
  const tick = 40;
  let elapsed = 0;

  const step = () => {
    elapsed += tick;
    const events: ReplyEvent[] = [];
    for (const cursor of cursors) {
      if (cursor.id === doomed && !cursor.glossed && elapsed > 900) {
        cursor.glossed = true;
        events.push({
          type: "error",
          register: cursor.id,
          message: "The model stopped partway through this register.",
        });
        continue;
      }
      if (cursor.id === doomed) continue;
      const full = MOCK_RENDERINGS[cursor.id].textJa;
      if (cursor.at >= full.length) {
        if (!cursor.glossed) {
          cursor.glossed = true;
          events.push({
            type: "gloss",
            register: cursor.id,
            glossEn: MOCK_RENDERINGS[cursor.id].glossEn,
          });
          events.push({ type: "done", register: cursor.id });
        }
        continue;
      }
      // Longer registers stream slower — keigo is genuinely more work.
      const perTick = Math.max(1, Math.round(MOCK_STREAM_SPEED[cursor.id] / 12));
      const next = Math.min(full.length, cursor.at + perTick);
      events.push({ type: "delta", register: cursor.id, text: full.slice(cursor.at, next) });
      cursor.at = next;
    }
    if (events.length) emit(events);

    if (cursors.every((c) => c.glossed)) {
      finish();
      return;
    }
    if (elapsed > 20000) {
      finish();
      return;
    }
    timersRef.current.push(window.setTimeout(step, tick));
  };

  timersRef.current.push(window.setTimeout(step, 260));
}
