// ==========================================================================
// بضاعة ميتة — فلوس واقفة على الرف
// --------------------------------------------------------------------------
// «قرّب يخلص» بيقول لك تشتري إيه. ده بيقول العكس: **فلوسك متجمّدة فين**.
// المنتج اللي عنده مخزون ومااتباعش ولا قطعة من شهرين هو كاش نايم — وأي جنيه
// هنا كان ممكن يبقى بضاعة بتتحرك.
//
// ⚠️⚠️ **القيمة بالتكلفة مش بسعر البيع.** اللي متجمّد هو اللي دفعته، مش
// اللي كنت هتاخده. الحساب بسعر البيع بيضخّم الرقم ويخلّي القايمة تبان
// كارثة وهي مش كده.
//
// ⚠️ **والمنتج اللي تكلفته صفر بيتعرض بعدد القطع بس** — ٨٩ شكل من ١٠١ عند
// مينيز تكلفتهم صفر، ولو حسبناهم بصفر جنيه هيبانوا كأنهم مش مشكلة.
//
// **الملف ده صافي** — مافيش شبكة ولا قاعدة بيانات، والوقت بيتبعت جوّه.
// ==========================================================================

/** الحالات اللي معناها البضاعة خرجت فعلًا */
const SOLD = ["confirmed", "packed", "ready", "shipped", "out_for_delivery", "delivered"];

/**
 * ⚠️ **بعد كام يوم من غير بيعة تبقى ميتة.**
 *
 * الشهر قصير — فيه منتجات موسمية بتقف شهر وترجع. الشهرين معناهم إن الحاجة
 * دي مش بتتحرك في دورة بيع كاملة.
 */
export const DEAD_AFTER_DAYS = 60;

export type DeadVariant = {
  id: string;
  name: string;
  onHand: number;
  costPrice: number;
};

export type DeadSale = {
  variantId: string | null;
  at: string | null;
  orderStatus: string | null;
};

export type DeadRow = {
  id: string;
  name: string;
  onHand: number;
  /** قيمة اللي واقف بالتكلفة — و`null` لو التكلفة مش متسجّلة */
  value: number | null;
  /** آخر مرة اتباع فيها — و`null` لو عمره ما اتباع */
  lastSold: string | null;
  /** بقاله كام يوم من غير بيعة — و`null` لو عمره ما اتباع */
  days: number | null;
};

function dayOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * البضاعة اللي واقفة.
 *
 * بيرجّع **الأغلى الأول** — ده اللي بيوجع أكتر. واللي مالوش تكلفة بيتحط بعده
 * مرتّب بعدد القطع.
 */
export function deadStock(
  variants: DeadVariant[],
  sales: DeadSale[],
  now: Date,
  afterDays: number = DEAD_AFTER_DAYS
): DeadRow[] {
  const lastByVariant = new Map<string, string>();

  for (const s of sales) {
    const id = String(s.variantId ?? "").trim();
    if (!id) continue;
    if (!SOLD.includes(String(s.orderStatus))) continue;
    const day = dayOf(s.at);
    if (!day) continue;
    const seen = lastByVariant.get(id);
    if (!seen || day > seen) lastByVariant.set(id, day);
  }

  const today = now.toISOString().slice(0, 10);
  const out: DeadRow[] = [];

  for (const v of variants) {
    const onHand = Number(v.onHand) || 0;
    // ⚠️ **اللي مافيش منه حاجة مش بضاعة ميتة** — مفيش فلوس واقفة أصلًا
    if (onHand <= 0) continue;

    const lastSold = lastByVariant.get(v.id) ?? null;
    const days = lastSold
      ? Math.floor(
          (new Date(`${today}T00:00:00Z`).getTime() -
            new Date(`${lastSold}T00:00:00Z`).getTime()) /
            86_400_000
        )
      : null;

    // اتباع من قريّب؟ يبقى شغّال
    if (days !== null && days < afterDays) continue;

    const cost = Number(v.costPrice) || 0;
    out.push({
      id: v.id,
      name: v.name,
      onHand,
      value: cost > 0 ? Math.round(cost * onHand) : null,
      lastSold,
      days,
    });
  }

  return out.sort((a, b) => {
    if (a.value !== null && b.value !== null) return b.value - a.value;
    if (a.value !== null) return -1;
    if (b.value !== null) return 1;
    return b.onHand - a.onHand;
  });
}

/** إجمالي الفلوس الواقفة — اللي متسجّل تكلفته بس */
export function frozenValue(rows: DeadRow[]): number {
  return rows.reduce((s, r) => s + (r.value ?? 0), 0);
}

/** كام صف مالوش تكلفة — ⚠️ الرقم ده بيقول إن الإجمالي أقل من الحقيقة */
export function withoutCost(rows: DeadRow[]): number {
  return rows.filter((r) => r.value === null).length;
}
