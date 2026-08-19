// ==========================================================================
// الملف الشخصي للعميل — اللي تحب تعرفه قبل ما تكلّمه
// --------------------------------------------------------------------------
// صفحة العميل دلوقتي بتقول «اشترى بكام إجمالي». وده مش بيجاوب السؤال اللي
// في دماغك وإنت ماسك التليفون: **ده مين؟** بيشتري كتير ولا أول مرة؟ بيرجّع؟
// آخر مرة اشترى إمتى؟ وبيحب إيه؟
//
// ⚠️ **الملغي بره كل الأرقام** — أوردر اتلغى قبل ما يخرج مش شرا ولا رجوع،
// ولو دخل المقام كل النسب بتتخفّف كذب.
//
// ⚠️ **والمرتجع بيتحسب على اللي خلص مشواره بس** — الأوردر اللي لسه في
// الطريق مش نتيجة، وحطّه في المقام بيقول إن العميل أحسن مما هو.
//
// **الملف ده صافي** — مافيش شبكة ولا قاعدة بيانات، والوقت بيتبعت جوّه.
// ==========================================================================

/** اتلغى — مش شرا ولا رجوع */
const CANCELLED = ["cancelled"];

/** خلص مشواره وليه نتيجة */
const SETTLED = ["delivered", "returned", "returned_after_delivery"];

/** رجع لنا */
const RETURNED = ["returned", "returned_after_delivery"];

/**
 * ⚠️ **أقل من كده مافيش «بيشتري كل كام يوم».**
 *
 * المسافة بين أوردرين مش عادة. العادة محتاجة تلات أوردرات على الأقل عشان
 * يبقى فيه مسافتين نقارنهم.
 */
export const MIN_ORDERS_FOR_CADENCE = 3;

/** العميل بيتأخّر عن معاده بنسبة كام قبل ما نقول «اتأخّر» */
const LATE_FACTOR = 1.5;

export type ProfileOrder = {
  orderStatus: string | null;
  orderDate: string | null;
  /** إجمالي الأوردر بالفلوس (بنود − خصم + شحن) */
  total: number;
  items?: { productName?: string | null; quantity: number }[] | null;
};

export type FavouriteProduct = {
  name: string;
  quantity: number;
};

export type CustomerProfile = {
  /** كل أوردراته ماعدا الملغي */
  orders: number;
  cancelled: number;
  delivered: number;
  returned: number;
  /** اللي خلص مشواره — عليه بتتحسب نسبة الرجوع */
  settled: number;
  /** نسبة الرجوع ٪ — و`null` لو مفيش أوردر خلص */
  returnRate: number | null;
  /** كل اللي دفعه (الملغي والراجع بره) */
  spent: number;
  /** متوسط الأوردر */
  average: number;
  firstOrder: string | null;
  lastOrder: string | null;
  /** بقاله كام يوم من آخر أوردر */
  daysSinceLast: number | null;
  /**
   * بيشتري كل كام يوم في المتوسط — و`null` لو أوردراته أقل من الحد.
   */
  everyDays: number | null;
  /**
   * اتأخّر عن معاده؟ ⚠️ بتبقى `false` دايمًا لو مافيش عادة أصلًا — مش
   * «مااتأخرش»، ده «مانعرفش».
   */
  overdue: boolean;
  favourites: FavouriteProduct[];
};

function dayOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function buildCustomerProfile(
  orders: ProfileOrder[],
  now: Date
): CustomerProfile {
  const cancelled = orders.filter((o) =>
    CANCELLED.includes(String(o.orderStatus))
  ).length;

  const real = orders.filter((o) => !CANCELLED.includes(String(o.orderStatus)));

  const settledList = real.filter((o) => SETTLED.includes(String(o.orderStatus)));
  const returned = settledList.filter((o) =>
    RETURNED.includes(String(o.orderStatus))
  ).length;
  const delivered = real.filter((o) => o.orderStatus === "delivered").length;

  // الفلوس: اللي رجع مادفعش، فبره الإجمالي
  const paid = real.filter((o) => !RETURNED.includes(String(o.orderStatus)));
  const spent = paid.reduce((s, o) => s + (Number(o.total) || 0), 0);

  const days = real
    .map((o) => dayOf(o.orderDate))
    .filter((d): d is string => d !== null)
    .sort();

  const firstOrder = days[0] ?? null;
  const lastOrder = days[days.length - 1] ?? null;
  const today = now.toISOString().slice(0, 10);

  // العادة: متوسط المسافة بين أول وآخر أوردر مقسومة على عدد الفترات
  let everyDays: number | null = null;
  if (days.length >= MIN_ORDERS_FOR_CADENCE && firstOrder && lastOrder) {
    const span = daysBetween(firstOrder, lastOrder);
    if (span > 0) everyDays = Math.round(span / (days.length - 1));
  }

  const daysSinceLast = lastOrder ? Math.max(0, daysBetween(lastOrder, today)) : null;

  const favourites = new Map<string, number>();
  for (const o of real) {
    for (const i of o.items ?? []) {
      const name = String(i.productName ?? "").trim();
      const q = Number(i.quantity) || 0;
      if (!name || q <= 0) continue;
      favourites.set(name, (favourites.get(name) ?? 0) + q);
    }
  }

  return {
    orders: real.length,
    cancelled,
    delivered,
    returned,
    settled: settledList.length,
    returnRate:
      settledList.length > 0
        ? Math.round((returned / settledList.length) * 100)
        : null,
    spent,
    average: real.length > 0 ? spent / real.length : 0,
    firstOrder,
    lastOrder,
    daysSinceLast,
    everyDays,
    overdue:
      everyDays !== null &&
      daysSinceLast !== null &&
      daysSinceLast > everyDays * LATE_FACTOR,
    favourites: [...favourites.entries()]
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity),
  };
}

/**
 * سطر واحد بالعربي بيوصف العميل — ده اللي بيتقري قبل المكالمة.
 *
 * بيرجّع `null` لو مفيش حاجة تستاهل تتقال (عميل بأوردر واحد لسه شغّال).
 *
 * ⚠️⚠️ **النسبة مابتتكتبش على أوردر واحد.** «رجّع ١ (١٠٠٪)» رقم صح حسابيًا
 * ومضلّل تمامًا — العميل اشترى مرة ورجّع، مش «بيرجّع كل حاجة». اتلقى على
 * داتا حقيقية إن **٥ من أول ٦ عملاء** في القايمة كانوا كده. النسبة بتظهر
 * من أوردرين خالصين فوق.
 */
export function profileLine(p: CustomerProfile): string | null {
  const bits: string[] = [];

  if (p.orders >= 2) bits.push(`اشترى ${p.orders} مرات`);
  if (p.returned > 0) {
    bits.push(
      p.settled >= 2 && p.returnRate !== null
        ? `رجّع ${p.returned} منهم (${p.returnRate}%)`
        : "ورجّع أوردره الوحيد"
    );
  }
  if (p.everyDays !== null) bits.push(`بيشتري كل ${p.everyDays} يوم تقريبًا`);
  if (p.overdue && p.daysSinceLast !== null) {
    bits.push(`وبقاله ${p.daysSinceLast} يوم مااشتراش`);
  }

  return bits.length > 0 ? bits.join(" · ") : null;
}
