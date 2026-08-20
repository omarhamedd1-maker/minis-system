// ==========================================================================
// وقت الوصول المتوقع — من شحناتك إنت
// --------------------------------------------------------------------------
// «بيوصل إمتى؟» هو أكتر سؤال بيتبعت. والرد عليه دلوقتي تخمين، والتخمين
// بيتقال بثقة وبعدين بيتكسر — والعميل اللي اتوعد بيومين وجاله في خمسة
// بيرفض الاستلام.
//
// ⚠️⚠️ **الوسيط وعد بيتكسر نُص الوقت.** لو الوسيط يومين وقلنا «يومين»،
// نُص الشحنات بتتأخر عن الوعد بالتعريف. الوعد بيتاخد من **الشريحة ٧٥٪**:
// يعني ٣ من كل ٤ بيوصلوا في الوقت أو قبله.
//
// ⚠️ **والمتوسط مايستخدمش خالص.** عند مينيز أبطأ شحنة ١٥ يوم والوسيط ١٫٩ —
// شحنة واحدة زي دي بتشد المتوسط لفوق وتخلّي الوعد أوحش من الحقيقة.
//
// ⚠️ **والأرقام القليلة مابتوعدش.** تحت `MIN_SAMPLE` مافيش رقم بيتعرض
// خالص — «مش عارفين» أحسن من رقم اتبنى على ٦ شحنات.
//
// **الملف ده صافي** — بياخد مدد وبيرجّع وعد.
// ==========================================================================

/** أقل عدد شحنات خالصة عشان نوعد بحاجة */
export const MIN_SAMPLE = 20;

/** الشريحة اللي الوعد بيتاخد منها */
export const PROMISE_PERCENTILE = 0.75;

/**
 * الشحنة اللي أطول من كده بتتشال من الحسبة.
 *
 * ⚠️ **مش عشان نجمّل الرقم** — دي شحنات اتنسيت أو اتحلّت بالإيد بعد شهر،
 * ووجودها في العيّنة بيوصف حالة استثنائية كإنها عادية.
 */
export const OUTLIER_DAYS = 30;

export type Shipment = {
  /** الشحنة اتعملت إمتى */
  shippedAt: string | null;
  /** وصلت إمتى */
  deliveredAt: string | null;
};

export type Eta = {
  /** الأيام اللي بنوعد بيها — و`null` يعني مش هنوعد */
  days: number | null;
  /** الوسيط — للعرض الداخلي بس */
  median: number | null;
  /** كام شحنة الرقم ده اتبنى عليها */
  sample: number;
};

function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const from = new Date(a).getTime();
  const to = new Date(b).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  // ⚠️ التسليم قبل الشحن مستحيل — ده تاريخ متسجّل غلط
  if (to < from) return null;
  return (to - from) / 86_400_000;
}

/** المدد الصالحة من الشحنات */
export function durations(shipments: Shipment[]): number[] {
  const out: number[] = [];
  for (const s of shipments) {
    const d = daysBetween(s.shippedAt, s.deliveredAt);
    if (d === null || d > OUTLIER_DAYS) continue;
    out.push(d);
  }
  return out.sort((a, b) => a - b);
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const i = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[i];
}

/**
 * الوعد.
 *
 * ⚠️ **بيتقرّب لفوق دايمًا** — ١٫٩ يوم بتبقى «يومين» مش «يوم». التقريب
 * لتحت بيخلّي الوعد أقصر من الواقع في كل مرة.
 */
export function deliveryEta(shipments: Shipment[]): Eta {
  const d = durations(shipments);

  if (d.length < MIN_SAMPLE) {
    return { days: null, median: null, sample: d.length };
  }

  const promise = percentile(d, PROMISE_PERCENTILE);
  const median = percentile(d, 0.5);

  return {
    days: promise === null ? null : Math.max(1, Math.ceil(promise)),
    median: median === null ? null : Math.round(median * 10) / 10,
    sample: d.length,
  };
}

/**
 * الجملة اللي العميل بيشوفها — **إنجليزي**، زي باقي صفحة التتبع.
 *
 * ⚠️ **مافيش وعد لما مافيش رقم** — الصفحة بتفضل من غير السطر ده، مش
 * بتقول رقم افتراضي.
 */
export function etaCopy(eta: Eta, alreadyDelivered: boolean): string | null {
  if (alreadyDelivered) return null;
  if (eta.days === null) return null;
  return eta.days === 1
    ? "Usually arrives within a day."
    : `Usually arrives within ${eta.days} days.`;
}

/** نفس الكلام بالعربي — للشاشات الداخلية */
export function etaLine(eta: Eta): string {
  if (eta.days === null) {
    return `لسه مافيش شحنات كفاية للتقدير (${eta.sample} من ${MIN_SAMPLE}).`;
  }
  const unit = eta.days === 1 ? "يوم" : eta.days === 2 ? "يومين" : `${eta.days} أيام`;
  return `٣ من كل ٤ شحنات بتوصل خلال ${unit} · الوسيط ${eta.median} يوم · من ${eta.sample} شحنة.`;
}
