/**
 * ==========================================================================
 * «فلوس عند بوسطة» — الرقم اللي كان بيقول صفر دايمًا (TRANSFERS §١٠ · الخطوة ٩)
 * --------------------------------------------------------------------------
 * ⚠️⚠️ **الرقم ده مش مجموع كل اللي اتسلّم ولسه مش متعلّم عليه.** لو اتحسب
 * كده بيطلع **٤٥٥,٤٦٩** على مينيز — ده تاريخ التسليم كله من فبراير، وفلوسه
 * وصلت من زمان في ٩٤ تحويل.
 *
 * **التعريف الصح:** الفلوس اللي لسه عند بوسطة = تحصيل الأوردرات اللي
 * **اتسلّمت بعد آخر تحويل**. اللي قبل كده بوسطة حوّلته بالفعل — حتى لو
 * إحنا مش عارفين أنهي أوردر في أنهي تحويل.
 *
 * ⚠️ **والربط بالأوردرات مش شرط للرقم ده.** ده كان الفخ: إننا نستنى ربط
 * ٢٤١ أوردر عشان نعرف رقم موجود من غيرهم. القياس (٢٢ سبتمبر): الرقم
 * بالتعريف ده = **صفر**، وإيميل بوسطة نفسه بيقول «الرصيد النهائي ٠».
 *
 * ⛔ **ورجوع التحويلات القديمة اترفض** (قرار عمر ٢٢ سبتمبر): ٧٠ صف بلا
 * أوردرات، و٢٠ منهم «محتاج مراجعة» للأبد — ضوضاء دائمة مقابل صفر فايدة،
 * والرقم موجود من غيرهم.
 *
 * ⚠️⚠️ **وعشان كده فيه حارس.** الرقم ده معتمد على إن **آخر تحويل متسجّل**.
 * لو الإيميل وقف — الفلتر اتشال، أو التحويل من جيميل باظ — «آخر تحويل»
 * بيفضل قديم، والرقم بيكبر كل يوم **وهو كذب**. فبعد ٥ أيام شغل من غير
 * تحويل، الرقم بيتقال ومعاه سببه بدل ما يتعرض لوحده في صمت.
 *
 * **الملف ده صافي.**
 * ==========================================================================
 */

/** بوسطة بتحوّل كل يوم ما عدا الجمعة والسبت */
const WEEKEND = [5, 6];

/** بعد كام يوم شغل من غير تحويل نشك إن فيه حاجة واقفة */
export const STALE_WORK_DAYS = 5;

export type CourierOrder = {
  /** المبلغ المحصّل من العميل */
  cod: number;
  /** YYYY-MM-DD — من غيره الأوردر مايتحسبش */
  deliveredAt: string | null;
};

export type AtCourier = {
  /** مجموع التحصيل اللي لسه عند شركة الشحن */
  total: number;
  /** عدد الأوردرات */
  count: number;
  /** أيام الشغل من آخر تحويل — `null` لو مفيش تحويلات أصلًا */
  workDaysSincePayout: number | null;
  /**
   * الرقم مشكوك فيه — يا إما التحويل وقف يا إما مفيش تحويلات أصلًا.
   * **بيتعرض جنب الرقم، مش بيخفيه.**
   */
  warning: string | null;
};

/** أيام الشغل بعد `from` لحد `to` (شامل) — الجمعة والسبت مابيتحسبوش */
export function workDaysBetween(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  let days = 0;
  for (let t = start + 86_400_000; t <= end; t += 86_400_000) {
    if (!WEEKEND.includes(new Date(t).getUTCDay())) days++;
  }
  return days;
}

export function moneyAtCourier({
  orders,
  lastPayoutDate,
  today,
}: {
  orders: CourierOrder[];
  /** تاريخ آخر تحويل متسجّل — `null` يعني مفيش ولا تحويل */
  lastPayoutDate: string | null;
  /** YYYY-MM-DD */
  today: string;
}): AtCourier {
  const day = (v: string | null) => String(v ?? "").slice(0, 10);

  // ⚠️ **مفيش تحويلات = مفيش خط قاعدة.** ساعتها كل اللي اتسلّم يبقى
  // «عند بوسطة» — رقم صح تقنيًا ومضلل عمليًا، فبيتقال بسببه
  if (!lastPayoutDate) {
    const all = orders.filter((o) => day(o.deliveredAt) && Number(o.cod) > 0);
    return {
      total: round(all.reduce((s, o) => s + Number(o.cod), 0)),
      count: all.length,
      workDaysSincePayout: null,
      warning: "مفيش ولا تحويل متسجّل — الرقم ده كل اللي اتسلّم، مش اللي لسه عند بوسطة",
    };
  }

  const since = day(lastPayoutDate);
  const open = orders.filter(
    (o) => Number(o.cod) > 0 && day(o.deliveredAt) && day(o.deliveredAt) > since
  );
  const days = workDaysBetween(since, day(today));

  return {
    total: round(open.reduce((s, o) => s + Number(o.cod), 0)),
    count: open.length,
    workDaysSincePayout: days,
    warning:
      days > STALE_WORK_DAYS
        ? `آخر تحويل من ${days} يوم شغل — اتأكد إن تحويل الإيميل من جيميل شغّال`
        : null,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
