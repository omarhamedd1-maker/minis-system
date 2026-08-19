// ==========================================================================
// طابور تأكيد الأوردرات — القرار
// --------------------------------------------------------------------------
// كل متجر بيشحن دفع-عند-الاستلام بيكلّم العميل قبل ما يبعت. ده شغل يومي
// كامل، وهو **أكبر سلاح ضد الرجوع**: نسبة الرجوع عند ٢ سِك ٧٪، وكل مرتجع
// بيدفع شحن رايح وجاي ورسوم بوسطة.
//
// اللي كان موجود: تنبيه يومي بيقول «فيه أوردر لسه جديد». اللي ناقص إن
// المكالمة نفسها تبقى **شغل متتبّع**: اتصلت، رد ولا مردّش، أكّد ولا لغى،
// وإمتى نعيد.
//
// **القواعد اللي المنطق ده بيمشي بيها:**
//
//   ١. **المحاولة اللي مردّش عليها ليها ميعاد رجوع** — مش بنعيد على طول
//      ومش بننسى. المهلة بتطول مع كل محاولة (ساعتين ← ٤ ← ٨) عشان
//      المكالمة التالتة في نفس الساعة مالهاش معنى.
//
//   ٢. **بعد ٣ محاولات بيقف** — مابنفضلش نتصل للأبد. بيتعلّم «محتاج قرار»
//      وصاحب المتجر يقرر: يشحن على مسؤوليته ولا يلغي.
//
//   ٣. **الوقت بتوقيت مصر** — الاتصال الساعة ٣ الفجر مالوش لازمة. أي ميعاد
//      رجوع بيقع برّه ٩ص–٩م بيتأجّل لأول ميعاد مناسب.
//
// **الملف ده صافي** — مافيش شبكة ولا قاعدة بيانات ولا وقت من نفسه.
// ==========================================================================

/** نتيجة المكالمة زي ما الموظف بيسجّلها */
export type CallOutcome = "confirmed" | "no_answer" | "cancelled" | "later";

export type ConfirmState = {
  /** حالة الأوردر عندنا */
  orderStatus: string | null | undefined;
  /** كام مرة اتصلنا */
  attempts: number | null | undefined;
  /** ميعاد المحاولة الجاية (ISO) — فاضي يعني دلوقتي */
  nextAt: string | null | undefined;
};

/** أول ساعة وآخر ساعة ينفع نتصل فيهم (بتوقيت مصر) */
export const CALL_FROM_HOUR = 9;
export const CALL_TO_HOUR = 21;

/** المهلة بعد كل محاولة مردّش فيها — بالساعات */
export const RETRY_HOURS = [2, 4, 8];

/** بعد كام محاولة نوقف ونطلب قرار */
export const MAX_ATTEMPTS = 3;

export type QueueDecision =
  /** اتصل بيه دلوقتي */
  | { state: "due" }
  /** مستني ميعاده */
  | { state: "waiting"; until: string }
  /** خلاص محتاج قرار من صاحب المتجر */
  | { state: "stuck"; attempts: number }
  /** مش في الطابور أصلاً */
  | { state: "out"; why: "not_new" };

/**
 * الأوردر ده مكانه فين في الطابور؟
 *
 * **الحالة «جديد» بس هي اللي بتدخل الطابور.** أي حالة تانية معناها إن حد
 * لمسه خلاص — أكّده أو لغاه أو شحنه — فمالوش لازمة هنا.
 */
export function queueDecision(s: ConfirmState, now: Date): QueueDecision {
  if (s.orderStatus !== "new") return { state: "out", why: "not_new" };

  const attempts = Math.max(0, Number(s.attempts ?? 0));
  if (attempts >= MAX_ATTEMPTS) return { state: "stuck", attempts };

  if (s.nextAt) {
    const t = new Date(s.nextAt).getTime();
    // تاريخ مش مفهوم؟ **نعتبره مستحق** — الأمان إننا نكلّم العميل مش نسكت
    if (Number.isFinite(t) && t > now.getTime()) {
      return { state: "waiting", until: new Date(t).toISOString() };
    }
  }
  return { state: "due" };
}

/** ساعة القاهرة من تاريخ */
function cairoHour(d: Date): number {
  return Number(
    new Intl.DateTimeFormat("en", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Africa/Cairo",
    }).format(d)
  );
}

/**
 * الميعاد ده مناسب للاتصال؟ ولو لأ، إمتى أقرب ميعاد؟
 *
 * ⚠️ **بنزحزح بالساعة** لحد ما نوصل لوقت مناسب، مش بنحسب فرق التوقيت
 * بإيدنا — القاهرة بتغيّر توقيتها الصيفي، والحسبة اليدوية بتغلط يومين في
 * السنة ومحدش بياخد باله.
 */
export function nextCallableTime(at: Date): Date {
  const d = new Date(at.getTime());
  for (let i = 0; i < 48; i++) {
    const h = cairoHour(d);
    if (h >= CALL_FROM_HOUR && h < CALL_TO_HOUR) return d;
    d.setTime(d.getTime() + 3_600_000);
  }
  return d;
}

export type OutcomeResult = {
  /** الحالة الجديدة للأوردر، أو `null` يعني سيبها زي ما هي */
  orderStatus: "confirmed" | "cancelled" | null;
  attempts: number;
  /** ميعاد المحاولة الجاية، أو `null` يعني خلاص */
  nextAt: string | null;
  /** خرج من الطابور خلاص؟ */
  done: boolean;
};

/**
 * الموظف سجّل نتيجة المكالمة — يبقى إيه اللي يتغيّر؟
 *
 * **«يتصل بعدين» بتزوّد المهلة من غير ما تعدّ محاولة** — الموظف اللي شايف
 * إن الوقت مش مناسب (العميل قال كلّمني بالليل) مش بيستهلك محاولة.
 */
export function applyOutcome(
  outcome: CallOutcome,
  s: ConfirmState,
  now: Date
): OutcomeResult {
  const attempts = Math.max(0, Number(s.attempts ?? 0));

  if (outcome === "confirmed") {
    return { orderStatus: "confirmed", attempts, nextAt: null, done: true };
  }
  if (outcome === "cancelled") {
    return { orderStatus: "cancelled", attempts, nextAt: null, done: true };
  }

  if (outcome === "later") {
    const at = nextCallableTime(new Date(now.getTime() + 3_600_000 * 3));
    return { orderStatus: null, attempts, nextAt: at.toISOString(), done: false };
  }

  // مردّش
  const used = attempts + 1;
  if (used >= MAX_ATTEMPTS) {
    // وقف — محتاج قرار، ومفيش ميعاد جاي
    return { orderStatus: null, attempts: used, nextAt: null, done: true };
  }
  const hours = RETRY_HOURS[Math.min(used - 1, RETRY_HOURS.length - 1)];
  const at = nextCallableTime(new Date(now.getTime() + hours * 3_600_000));
  return { orderStatus: null, attempts: used, nextAt: at.toISOString(), done: false };
}
