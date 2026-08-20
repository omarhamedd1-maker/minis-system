// ==========================================================================
// المنتج اللي اتغيّر سلوكه — كان بيرجع ٥٪ وبقى ٢٥٪
// --------------------------------------------------------------------------
// المنتج مابيبوظش فجأة. بيبوظ بالتدريج: دفعة تصنيع أوحش، أو مقاس اتغيّر،
// أو صورة على الموقع بقت مضللة. والرقم الكلي بيخبّي ده تمامًا — نسبة
// الرجوع الإجمالية بتتحرك ١٪ بس، بينما منتج واحد جوّاها اتضاعف تلات مرات.
//
// ⚠️⚠️ **المقارنة بين فترتين لنفس المنتج، مش بين المنتجات.** المنتج اللي
// بيرجع ٣٠٪ من أول يوم مش «اتغيّر» — ده طبيعته، وصاحب المتجر عارفها.
// اللي بيستاهل تنبيه هو **الفرق عن نفسه**.
//
// ⚠️ **والأرقام الصغيرة بتكدب بصوت عالي**: منتج اتباع ٣ مرات ورجع واحد =
// ٣٣٪. أي منتج تحت `MIN_ORDERS` في أي فترة بيتشال، مش بيتقارن.
//
// **الملف ده صافي** — بياخد بيعات وبيرجّع اللي اتغيّر.
// ==========================================================================

/** أقل عدد بيعات خالصة في كل فترة عشان المقارنة تبقى ليها معنى */
export const MIN_ORDERS = 8;

/** الزيادة اللي تعتبر تغيّر — نقطة مئوية، مش نسبة من نسبة */
export const JUMP_POINTS = 10;

/** الفترة بتاعة المقارنة */
export const WINDOW_DAYS = 30;

export type SaleRow = {
  variantId: string | null;
  productName: string | null;
  variantName: string | null;
  /** يوم البيعة `2026-08-20` */
  day: string | null;
  /** رجعت؟ */
  returned: boolean;
};

export type Drift = {
  variantId: string;
  productName: string | null;
  variantName: string | null;
  /** نسبة الرجوع في الفترة اللي فاتت */
  before: number;
  /** نسبة الرجوع دلوقتي */
  now: number;
  /** الفرق بالنقطة المئوية — موجب يعني بقى أسوأ */
  jump: number;
  beforeCount: number;
  nowCount: number;
};

function rate(rows: SaleRow[]): number {
  if (rows.length === 0) return 0;
  return Math.round((rows.filter((r) => r.returned).length / rows.length) * 1000) / 10;
}

/**
 * المنتجات اللي نسبة رجوعها قفزت.
 *
 * `now` = آخر ٣٠ يوم · `before` = الـ٣٠ اللي قبلهم.
 *
 * ⚠️ **الأسوأ الأول** — مش الأكتر بيعًا.
 */
export function productDrift(sales: SaleRow[], today: Date): Drift[] {
  const end = today.getTime();
  const midDay = new Date(end - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const startDay = new Date(end - 2 * WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const todayDay = new Date(end).toISOString().slice(0, 10);

  const groups = new Map<string, { before: SaleRow[]; now: SaleRow[]; row: SaleRow }>();

  for (const s of sales) {
    if (!s.variantId) continue;
    const day = String(s.day ?? "").slice(0, 10);
    if (!day || day < startDay || day > todayDay) continue;

    const g = groups.get(s.variantId) ?? { before: [], now: [], row: s };
    // ⚠️ الحد الفاصل بيروح لـ«دلوقتي» — يوم واحد مش هيقلب النتيجة، والأهم
    // إنه مايتحسبش في الاتنين
    if (day >= midDay) g.now.push(s);
    else g.before.push(s);
    groups.set(s.variantId, g);
  }

  const out: Drift[] = [];

  for (const [variantId, g] of groups) {
    // ⚠️ **الفترتين لازم يكونوا فيهم بيعات كفاية** — واحدة بس مش مقارنة
    if (g.before.length < MIN_ORDERS || g.now.length < MIN_ORDERS) continue;

    const before = rate(g.before);
    const now = rate(g.now);
    const jump = Math.round((now - before) * 10) / 10;
    if (jump < JUMP_POINTS) continue;

    out.push({
      variantId,
      productName: g.row.productName,
      variantName: g.row.variantName,
      before,
      now,
      jump,
      beforeCount: g.before.length,
      nowCount: g.now.length,
    });
  }

  return out.sort((a, b) => b.jump - a.jump);
}

/**
 * الرسالة اللي بتتبعت.
 *
 * ⚠️ **بتقول الرقم والفرق وبس** — مش بتقول اعمل إيه، لأن السبب ممكن يكون
 * دفعة تصنيع أو صورة أو مقاس، ومحدش غير صاحب المتجر يعرف.
 */
export function driftMessage(d: Drift): string {
  const name = [d.productName, d.variantName].filter(Boolean).join(" · ") || "منتج";
  return `${name}: كان بيرجع ${d.before}% وبقى ${d.now}% — ${d.nowCount} بيعة في آخر ${WINDOW_DAYS} يوم.`;
}
