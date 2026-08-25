// ==========================================================================
// تقارير تعملها بنفسك
// --------------------------------------------------------------------------
// كل شاشة في السيستم بتجاوب على سؤال واحد مكتوب في الكود. والسؤال اللي
// مش مكتوب — «مبيعاتي بالمنطقة الشهر ده» أو «نسبة الرجوع لكل منتج في
// رمضان» — مالوش مكان، فبيتحوّل لتصدير CSV وشغل في إكسيل.
//
// ⚠️⚠️ **التقرير بيتبني من قطع معروفة، مش من كلام حر.** المستخدم بيختار
// من قوايم: يقيس إيه · مقسّم على إيه · في أي فترة. من غير كده كنا هنبقى
// بنبني لغة استعلام، وأي غلطة فيها بتبقى رقم غلط بيتاخد عليه قرار.
//
// ⚠️ **والأسئلة اللي جوابها مضلّل مابتتسألش.** «متوسط قيمة الأوردر» على
// أوردرات لسه في السكة رقم بيتغيّر كل يوم — فمقياس زي ده بيقول المقام
// بتاعه بنفسه.
//
// **الملف ده صافي** — بياخد أوردرات وتعريف تقرير وبيرجّع صفوف.
// ==========================================================================

/** اللي بنقيسه */
export const MEASURES = {
  sales: "المبيعات",
  orders: "عدد الأوردرات",
  profit: "الربح",
  returns: "عدد الراجع",
  return_rate: "نسبة الرجوع",
  avg_order: "متوسط الأوردر",
} as const;

/** اللي بنقسّم عليه */
export const GROUPS = {
  month: "الشهر",
  weekday: "يوم الأسبوع",
  status: "الحالة",
  area: "المنطقة",
  product: "المنتج",
  customer: "العميل",
} as const;

export type Measure = keyof typeof MEASURES;
export type Group = keyof typeof GROUPS;

/**
 * المقاييس اللي بتتحسب من **اللي خلص بس**.
 *
 * ⚠️⚠️ **المقام مهم أكتر من البسط.** نسبة الرجوع على كل الأوردرات بتصغّر
 * كل يوم لأن اللي لسه في السكة بيدخل المقام وهو ممكن يرجع بكرة. والحساب
 * على اللي خلص بس بيدّي رقم ثابت.
 */
const SETTLED_ONLY: Measure[] = ["return_rate"];

/** الحالات اللي معناها خلاص */
const SETTLED = ["delivered", "returned", "returned_after_delivery"];
const RETURNED = ["returned", "returned_after_delivery"];
/** الملغي مش بيعة */
const NOT_A_SALE = ["cancelled"];

export type ReportOrder = {
  orderStatus: string | null;
  /** بالساعة — التقسيم بيوم الأسبوع محتاجه */
  orderDate: string | null;
  /** إجمالي البنود ناقص الخصم زايد الشحن */
  total: number;
  /** الربح — بنود بأسعارها ناقص تكلفتها وقت الأوردر */
  profit: number;
  /** المنطقة من العنوان — و`null` لو معرفناش */
  area: string | null;
  customerName: string | null;
  /** أسماء المنتجات في الأوردر */
  products: string[];
};

export type ReportSpec = {
  measure: Measure;
  group: Group;
  /** `2026-01-01` — و`null` يعني من الأول */
  from: string | null;
  to: string | null;
};

export type ReportRow = {
  label: string;
  value: number;
  /** كام أوردر ورا الرقم ده — بيمنع الصف اللي مبني على أوردر واحد */
  count: number;
};

export type Report = {
  rows: ReportRow[];
  /** مجموع العمود — و`null` للنِسب (جمع النِسب مالوش معنى) */
  total: number | null;
  /** الوحدة اللي الرقم بيتقاس بيها */
  unit: "money" | "count" | "percent";
  /** أوردرات دخلت الحسبة */
  used: number;
  /** أوردرات اتشالت والسبب */
  skipped: string | null;
};

const WEEKDAYS = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];

const STATUS_AR: Record<string, string> = {
  new: "جديد",
  confirmed: "متأكّد",
  packed: "متجهّز",
  shipped: "مشحون",
  out_for_delivery: "مع المندوب",
  awaiting_action: "محتاج تصرّف",
  delivered: "اتسلّم",
  returned: "رجع",
  returned_after_delivery: "رجع بعد التسليم",
  cancelled: "ملغي",
};

export const UNIT_OF: Record<Measure, "money" | "count" | "percent"> = {
  sales: "money",
  orders: "count",
  profit: "money",
  returns: "count",
  return_rate: "percent",
  avg_order: "money",
};

/**
 * الصفوف اللي وراها أوردر واحد بتبان قوية وهي مش.
 *
 * ⚠️ **للنِسب بس** — «١٠٠٪ رجوع» على أوردر واحد رقم بيخوّف وهو مالوش معنى.
 */
export const MIN_FOR_RATE = 5;

/** اليوم بتوقيت مصر */
function cairoDay(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(d);
}

/**
 * الصف اللي الأوردر ده بيقع فيه — و`null` يعني الأوردر مالوش صف.
 *
 * ⚠️ **الأوردر ممكن يقع في أكتر من صف** (المنتجات) — عشان كده بيرجّع قايمة.
 */
function labelsOf(o: ReportOrder, group: Group): string[] {
  const day = o.orderDate ? cairoDay(o.orderDate) : null;

  switch (group) {
    case "month":
      return day ? [day.slice(0, 7)] : [];
    case "weekday":
      return day ? [WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]] : [];
    case "status":
      return [STATUS_AR[String(o.orderStatus)] ?? "مش معروف"];
    case "area":
      // ⚠️ اللي معرفناش منطقته بيتجمع لوحده مش بيتوزّع
      return [o.area ?? "مش معروف"];
    case "customer":
      return [o.customerName ?? "بدون اسم"];
    case "product":
      // ⚠️⚠️ **الأوردر بمنتجين بيتعدّ في الصفين** — والمجموع بيبقى أكبر من
      // الإجمالي الحقيقي. ده صح للسؤال «المنتج ده باع كام»، والصفحة
      // بتقول كده بدل ما الرقم يبان غلط.
      return o.products.length > 0 ? o.products : ["بدون منتج"];
  }
}

/**
 * بيبني التقرير.
 *
 * ⚠️ **الأكبر الأول** — التقرير اللي بيبدأ بالصغير محدش بيوصل لآخره.
 */
export function buildReport(orders: ReportOrder[], spec: ReportSpec): Report {
  const unit = UNIT_OF[spec.measure];
  const settledOnly = SETTLED_ONLY.includes(spec.measure);

  const buckets = new Map<
    string,
    { value: number; count: number; returned: number; settled: number }
  >();

  let used = 0;
  let skippedSettled = 0;

  for (const o of orders) {
    const day = o.orderDate ? cairoDay(o.orderDate) : null;

    // الفترة
    if (spec.from && (!day || day < spec.from)) continue;
    if (spec.to && (!day || day > spec.to)) continue;

    const status = String(o.orderStatus);

    // ⚠️ الملغي مش بيعة — بيدخل بس لما التقسيم بالحالة نفسها
    if (NOT_A_SALE.includes(status) && spec.group !== "status") continue;

    const isSettled = SETTLED.includes(status);
    if (settledOnly && !isSettled) {
      skippedSettled++;
      continue;
    }

    used++;
    const isReturn = RETURNED.includes(status);

    for (const label of labelsOf(o, spec.group)) {
      const b =
        buckets.get(label) ?? { value: 0, count: 0, returned: 0, settled: 0 };
      b.count++;
      if (isSettled) b.settled++;
      if (isReturn) b.returned++;

      switch (spec.measure) {
        case "sales":
        case "avg_order":
          b.value += Math.max(0, o.total);
          break;
        case "profit":
          b.value += o.profit;
          break;
        case "orders":
          b.value += 1;
          break;
        case "returns":
          if (isReturn) b.value += 1;
          break;
        case "return_rate":
          // بيتحسب بعد اللفة من `returned / settled`
          break;
      }

      buckets.set(label, b);
    }
  }

  const rows: ReportRow[] = [...buckets.entries()].map(([label, b]) => {
    let value = b.value;
    if (spec.measure === "return_rate") {
      value = b.settled > 0 ? Math.round((b.returned / b.settled) * 1000) / 10 : 0;
    } else if (spec.measure === "avg_order") {
      value = b.count > 0 ? Math.round(b.value / b.count) : 0;
    } else {
      value = Math.round(value);
    }
    return { label, value, count: b.count };
  });

  /**
   * ⚠️⚠️ **الصف الضعيف بينزل تحت في النِسب والمتوسطات.**
   *
   * على داتا مينيز: «نسبة الرجوع بالمنتج» طلّعت تلات منتجات بـ**١٠٠٪** فوق
   * خالص — كل واحد فيهم **أوردر واحد** رجع. الترتيب بالقيمة لوحده بيحط
   * أضعف الأرقام في أول الشاشة، واللي بيقراها بيتخض من رقم مالوش معنى.
   *
   * القوي فوق، والضعيف تحت ومعلّم عليه — والاتنين متعروضين.
   */
  const ratio = unit === "percent" || spec.measure === "avg_order";
  rows.sort((a, b) => {
    if (ratio) {
      const aWeak = a.count < MIN_FOR_RATE;
      const bWeak = b.count < MIN_FOR_RATE;
      if (aWeak !== bWeak) return aWeak ? 1 : -1;
    }
    return b.value - a.value;
  });

  return {
    rows,
    // ⚠️ **جمع النِسب والمتوسطات مالوش معنى** — «مجموع نسب الرجوع» رقم
    // بيتقرا كأنه نسبة وهو مش نسبة.
    total:
      unit === "percent" || spec.measure === "avg_order"
        ? null
        : rows.reduce((s, r) => s + r.value, 0),
    unit,
    used,
    skipped:
      skippedSettled > 0
        ? `${skippedSettled} أوردر لسه في السكة مادخلوش الحسبة — نسبة الرجوع بتتحسب من اللي خلص بس`
        : null,
  };
}

export function weakRows(report: Report): number {
  if (report.unit !== "percent") return 0;
  return report.rows.filter((r) => r.count < MIN_FOR_RATE).length;
}
