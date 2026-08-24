// ==========================================================================
// فلوس واقفة عند بوسطة — مقسّمة بعمرها
// --------------------------------------------------------------------------
// الداشبورد بتقول «تحصيل بوسطة» كرقم واحد، وده بيجاوب «قبضت كام» بس. اللي
// صاحب المتجر بيسأله كل أسبوع سؤال تاني:
//
//   **«فلوسي فين، وبقالها قد إيه؟»**
//
// أوردر اتسلّم من ٣ أيام حاجة عادية. أوردر اتسلّم من ٤٠ يوم ولسه ماوصلش
// فلوسه ده مشكلة محتاجة مكالمة. الرقم الواحد بيخبّي الفرق ده تمامًا.
//
// **الفلوس بتتحسب واقفة لما**: الأوردر اتسلّم فعلًا، ومفيش أي إشارة إن
// فلوسه وصلت — لا علم بوسطة (`bosta_collected`) ولا تسجيل كاش عندنا
// (`cash_received_at`).
//
// ⚠️ **لازم الاتنين مع بعض.** أول نسخة اعتمدت على `cash_received_at` لوحده
// فطلّعت **٥٠٥ ألف واقفة على مينيز** — والحقيقة إن الخانة دي **مش بتتملا
// أصلًا** (صفر من ٢٣٨ أوردر مسلّم)، بينما بوسطة قايلة إنها حصّلت ٢٠٣ منهم.
// يعني الرقم كان هيفزّع صاحب المتجر من غير سبب.
//
// والعكس برضه وارد: بوسطة بتتأخر في تعليم التحصيل، فلو إحنا سجّلنا الكاش
// بإيدنا يبقى وصل خلاص مهما قالت هي.
// ==========================================================================

export type AgingOrder = {
  order_status: string | null;
  delivered_at: string | null;
  cash_received_at?: string | null;
  bosta_collected?: boolean | null;
  bosta_cod: number | null;
  discount: number;
  shipping_price?: number | null;
  order_items: { quantity: number; sale_price_at_order: number }[];
};

export type AgingBucket = {
  /** اسم الشريحة زي ما بتتعرض */
  label: string;
  /** أقل عدد أيام في الشريحة (شامل) */
  from: number;
  /** أكتر عدد أيام (شامل) — `null` يعني مفيش سقف */
  to: number | null;
  amount: number;
  count: number;
};

export type Aging = {
  buckets: AgingBucket[];
  total: number;
  count: number;
  /** أقدم أوردر واقف — ده اللي بيستاهل مكالمة النهاردة */
  oldestDays: number | null;
};

/**
 * الشرايح. **مقسومة على معنى مش على أرقام حلوة**:
 * أسبوع = دورة تحصيل بوسطة العادية · أسبوعين = اتأخرت · شهر = محتاجة سؤال ·
 * فوق الشهر = محتاجة تصعيد.
 */
const RANGES: { label: string; from: number; to: number | null }[] = [
  { label: "أقل من أسبوع", from: 0, to: 7 },
  { label: "٨ لـ١٤ يوم", from: 8, to: 14 },
  { label: "١٥ لـ٣٠ يوم", from: 15, to: 30 },
  { label: "أكتر من شهر", from: 31, to: null },
];

/**
 * المبلغ اللي بوسطة المفروض تحصّله على الأوردر.
 *
 * **`bosta_cod` بس، ومفيش رجوع لإجمالي الأوردر.**
 *
 * ⚠️ الرجوع للإجمالي كان غلط وطلّع رقم وهمي: `bosta_cod = 0` على أوردر
 * مسلّم معناه إن **بوسطة مالهاش دعوة بالأوردر ده أصلًا** — مش إن فيه فلوس
 * مجهولة. في مينيز ده طلّع ١١٠ ألف «واقفة» وكلها من الـ٣٥ أوردر المعروفين
 * اللي اتسلّموا من غير ما يعدّوا على بوسطة (متسجّلين في `docs/NEXT.md`).
 *
 * الأوردر اللي بوسطة شايلاه بجد بييجي بـ`bosta_cod` أكبر من صفر.
 */
export function pendingAmount(o: AgingOrder): number {
  return Number(o.bosta_cod ?? 0);
}

/** فرق الأيام بين تاريخين بالتقويم — التوقيت جوّه اليوم مايفرقش */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(from.slice(0, 10) + "T12:00:00Z");
  const b = Date.parse(to.slice(0, 10) + "T12:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

export function collectionAging(orders: AgingOrder[], today: string): Aging {
  const buckets: AgingBucket[] = RANGES.map((r) => ({ ...r, amount: 0, count: 0 }));
  let total = 0;
  let count = 0;
  let oldestDays: number | null = null;

  for (const o of orders) {
    // اتسلّم فعلًا؟ من غير تاريخ تسليم مافيش عمر نحسبه
    if (o.order_status !== "delivered" || !o.delivered_at) continue;
    // أي إشارة إن فلوسه وصلت — منّنا أو من بوسطة — يبقى مش واقف
    if (o.cash_received_at || o.bosta_collected) continue;

    const amount = pendingAmount(o);
    if (!(amount > 0)) continue;

    const age = daysBetween(o.delivered_at, today);
    const b =
      buckets.find((x) => age >= x.from && (x.to === null || age <= x.to)) ??
      buckets[buckets.length - 1];

    b.amount += amount;
    b.count += 1;
    total += amount;
    count += 1;
    if (oldestDays === null || age > oldestDays) oldestDays = age;
  }

  return {
    buckets: buckets.map((b) => ({ ...b, amount: Math.round(b.amount * 100) / 100 })),
    total: Math.round(total * 100) / 100,
    count,
    oldestDays,
  };
}
