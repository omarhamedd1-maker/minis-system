// ==========================================================================
// خلاصة الأسبوع — رسالة واحدة على الموبايل
// --------------------------------------------------------------------------
// التنبيهات اللي موجودة كلها بتقول «حصل حاجة دلوقتي». الرسالة دي بتقول
// حاجة تانية خالص: **الأسبوع عدّى، ده اللي حصل فيه**. ودي اللي بتخلّي صاحب
// المتجر يبص على الأرقام أصلًا بدل ما يستنى لما حاجة توجعه.
//
// ⚠️⚠️ **بتقول اللي حصل، مش اللي المفروض تعمله** — قرار عمر في كل التنبيهات:
// السبب بس، من غير نصايح ولا خطوات.
//
// ⚠️ **مافيش «أكتر» ولا «أقل» — قرار عمر.** الرسالة بتقول أرقام الأسبوع
// وبس؛ الحكم على إن ده كويس ولا وحش بتاعه هو.
//
// ⚠️ **والأسبوع اللي مافيهوش بيع خالص مابيتبعتش** — رسالة بأصفار كل جمعة
// بتخلّي الرسالة نفسها تتقفل.
//
// **الملف ده صافي** — بياخد أرقام وبيرجّع نص.
// ==========================================================================

import { formatMoney } from "./format";

export type WeekNumbers = {
  /** المبيعات */
  sales: number;
  /** صافي الربح بعد المصاريف */
  net: number;
  /** أوردرات اتعملت */
  orders: number;
  /** شحنات رجعت */
  returned: number;
  /** شحنات خلصت مشوارها (عليها بتتحسب نسبة الرجوع) */
  settled: number;
};

export type DigestInput = {
  storeName: string | null;
  week: WeekNumbers;
  /** الأسبوع اللي قبله — للمقارنة */
  before: WeekNumbers;
  /** حاجات واقفة دلوقتي */
  waiting: {
    /** مؤكد ومستني بوليصة */
    toShip: number;
    /** شحنات محتاجة مكالمة */
    rescue: number;
    /** فلوس عند بوسطة */
    atCarrier: number;
  };
};

/** الفرق بالنسبة المئوية — و`null` لو مفيش أساس نقارن عليه */
export function changePercent(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}


/**
 * الأسبوع ده يستاهل رسالة؟
 *
 * ⚠️ **مفيش بيع ومفيش حاجة واقفة = مفيش رسالة.** الرسالة اللي بتيجي بأصفار
 * كل أسبوع بتتقفل بعد تلات مرات، وبعدين اللي فيها خبر مايتقراش.
 */
export function worthSending(input: DigestInput): boolean {
  const w = input.week;
  const anyWaiting =
    input.waiting.toShip > 0 ||
    input.waiting.rescue > 0 ||
    input.waiting.atCarrier > 0;
  return w.orders > 0 || w.returned > 0 || anyWaiting;
}

/**
 * نص الرسالة.
 *
 * أول سطر = عنوان الإشعار (`lib/push/notify.ts` بيقسّمها كده).
 */
export function weeklyDigest(input: DigestInput): string {
  const { week: w } = input;
  const lines: string[] = [];

  const store = String(input.storeName ?? "").trim();
  lines.push(store ? `أسبوع ${store}` : "خلاصة الأسبوع");

  lines.push(
    `مبيعات ${formatMoney(Math.round(w.sales))}`
  );

  // ⚠️ الصافي بيبقى بالسالب أحيانًا — وده رقم حقيقي مش غلط، فبيتكتب زي ما هو
  lines.push(`صافي ${formatMoney(Math.round(w.net))}`);

  lines.push(`${w.orders} أوردر`);

  if (w.settled > 0) {
    const rate = Math.round((w.returned / w.settled) * 100);
    lines.push(`رجع ${w.returned} من ${w.settled} (${rate}%)`);
  }

  const waiting: string[] = [];
  if (input.waiting.toShip > 0) {
    waiting.push(`${input.waiting.toShip} مستني بوليصة`);
  }
  if (input.waiting.rescue > 0) {
    waiting.push(`${input.waiting.rescue} شحنة واقفة`);
  }
  if (input.waiting.atCarrier > 0) {
    waiting.push(`${formatMoney(Math.round(input.waiting.atCarrier))} عند بوسطة`);
  }
  if (waiting.length > 0) lines.push(waiting.join(" · "));

  return lines.join("\n");
}
