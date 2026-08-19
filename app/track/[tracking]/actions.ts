"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { phoneMatches, MIN_PHONE_DIGITS } from "@/lib/tracking-view";
import { formatMoney } from "@/lib/format";

/**
 * فتح تفاصيل الأوردر للعميل بعد ما يكتب تليفونه.
 *
 * ⚠️⚠️ **دي بوابة من حاجتين**: رقم التتبع (اللي في اللينك) والتليفون (اللي
 * صاحب الأوردر بس يعرفه). واحد منهم لوحده مايفتحش.
 *
 * ⚠️ **ومابنقولش «التليفون غلط» بشكل يفرّق عن «الشحنة مش موجودة»** — الرد
 * واحد في الحالتين، عشان اللي بيجرّب أرقام مايعرفش هو قرّب ولا لأ.
 *
 * ⚠️ **والقراية بمفتاح الأدمن من غير فلتر بيزنس** مقصودة: الزائر مالوش
 * بيزنس، ورقم التتبع بيحدد الشحنة لوحده.
 */
export type TrackDetails = {
  ok: true;
  orderNumber: string | null;
  orderDate: string | null;
  deliveredAt: string | null;
  /** المبلغ المطلوب عند الاستلام */
  cod: string | null;
  /** اتحصّل ولا لسه */
  collected: boolean;
  address: string | null;
  items: { name: string; quantity: number }[];
};

export type TrackResult = TrackDetails | { ok: false; error: string };

const WRONG = "الرقم مش مطابق لأوردر بالرقم ده.";

export async function openDetails(
  tracking: string,
  phone: string
): Promise<TrackResult> {
  const t = String(tracking ?? "").trim();
  const typed = String(phone ?? "").trim();

  if (!t || typed.replace(/[^0-9٠-٩]/g, "").length < MIN_PHONE_DIGITS) {
    return { ok: false, error: "اكتب رقم تليفون الأوردر كامل." };
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("orders")
    .select(
      `order_number, order_date, delivered_at, bosta_cod, bosta_collected,
       customers(phone, address),
       order_items(quantity, product_variants(variant_name, products(name_ar, name)))`
    )
    .eq("bosta_tracking", t)
    .limit(1)
    .maybeSingle();

  if (error || !data) return { ok: false, error: WRONG };

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
        products: { name_ar: string | null; name: string | null } | null;
      } | null;
    }[];
  };

  if (!phoneMatches(row.customers?.phone, typed)) {
    return { ok: false, error: WRONG };
  }

  return {
    ok: true,
    orderNumber: row.order_number,
    orderDate: row.order_date,
    deliveredAt: row.delivered_at,
    cod:
      row.bosta_cod && row.bosta_cod > 0 ? formatMoney(row.bosta_cod) : null,
    collected: Boolean(row.bosta_collected),
    address: row.customers?.address ?? null,
    items: (row.order_items ?? []).map((i) => {
      const v = i.product_variants;
      const base = v?.products?.name_ar || v?.products?.name || "منتج";
      const variant = String(v?.variant_name ?? "").trim();
      return {
        name: variant ? `${base} — ${variant}` : base,
        quantity: Number(i.quantity) || 0,
      };
    }),
  };
}
