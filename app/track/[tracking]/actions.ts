"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { tailMatches, isLocked, afterWrong, type Attempts } from "@/lib/phone-gate";
import { UI } from "@/lib/tracking-copy";
import { formatMoney } from "@/lib/format";

/**
 * فتح تفاصيل الأوردر بعد آخر أرقام التليفون.
 *
 * ⚠️⚠️ **آخر رقمين = ١٠٠ احتمال بس** (اختيار عمر عشان يسهّل على العميل)،
 * فالحماية في **عدّ المحاولات** مش في طول الرقم.
 *
 * ⚠️ **والعدّاد في ذاكرة النسخة الشغالة** — يعني على سيرفر بيتقسم لنسخ،
 * اللي بيجرّب ممكن يقع على نسخة عدّادها فاضي. ده احتكاك حقيقي بيوقّف
 * التجريب اليدوي، **مش قفلة كاملة**. القفلة الكاملة محتاجة جدول في
 * الداتابيز — وده شغل زيادة على حاجة لسه محدش جرّب يكسرها.
 *
 * ⚠️ **والرد واحد** سواء الأرقام غلط أو الشحنة مش موجودة — اللي بيجرّب
 * مايعرفش قرّب ولا لأ.
 */
const tries = new Map<string, Attempts>();

export type TrackDetails = {
  ok: true;
  orderNumber: string | null;
  placedAt: string | null;
  deliveredAt: string | null;
  /** المبلغ عند الاستلام */
  cod: string | null;
  collected: boolean;
  address: string | null;
  items: { name: string; quantity: number }[];
};

export type TrackResult = TrackDetails | { ok: false; error: string };

export async function openDetails(
  tracking: string,
  typed: string
): Promise<TrackResult> {
  const t = String(tracking ?? "").trim();
  if (!t) return { ok: false, error: UI.wrong };

  const now = Date.now();
  if (isLocked(tries.get(t), now)) return { ok: false, error: UI.locked };

  const db = createAdminClient();
  const { data, error } = await db
    .from("orders")
    .select(
      `order_number, order_date, delivered_at, bosta_cod, bosta_collected,
       customers(phone, address),
       order_items(quantity, product_variants(variant_name, products(name, name_ar)))`
    )
    .eq("bosta_tracking", t)
    .limit(1)
    .maybeSingle();

  const row = data as unknown as {
    order_number: string | null;
    order_date: string | null;
    delivered_at: string | null;
    bosta_cod: number | null;
    bosta_collected: boolean | null;
    customers: { phone: string | null; address: string | null } | null;
    order_items: {
      quantity: number;
      product_variants: {
        variant_name: string | null;
        products: { name: string | null; name_ar: string | null } | null;
      } | null;
    }[];
  } | null;

  if (error || !row || !tailMatches(row.customers?.phone, typed)) {
    tries.set(t, afterWrong(tries.get(t), now));
    return { ok: false, error: UI.wrong };
  }

  tries.delete(t);

  return {
    ok: true,
    orderNumber: row.order_number,
    placedAt: row.order_date,
    deliveredAt: row.delivered_at,
    cod: row.bosta_cod && row.bosta_cod > 0 ? formatMoney(row.bosta_cod) : null,
    collected: Boolean(row.bosta_collected),
    address: row.customers?.address ?? null,
    items: (row.order_items ?? []).map((i) => {
      const v = i.product_variants;
      // ⚠️ **اسم شوبيفاي (الإنجليزي) هو اللي العميل شافه وهو بيشتري** —
      // الاسم العربي بتاعنا داخلي، وعرضه هنا بيخلّي العميل يقارن باسم تاني.
      const base = v?.products?.name || v?.products?.name_ar || "Item";
      const variant = String(v?.variant_name ?? "").trim();
      const skip = variant.toLowerCase() === "default title";
      return {
        name: variant && !skip ? `${base} — ${variant}` : base,
        quantity: Number(i.quantity) || 0,
      };
    }),
  };
}
