"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { checkLinkOrder, linkOrderNumber, type LinkOrderInput } from "@/lib/order-link";
import { cairoToday } from "@/lib/format";

/**
 * العميل بيبعت أوردره من اللينك.
 *
 * ⚠️⚠️ **الصفحة دي مفتوحة للكل** — فكل حاجة بتتقرا من الداتابيز بمعرّف
 * اللينك، ومافيش حاجة بتتاخد من اللي العميل بعته غير اسمه وتليفونه وعنوانه
 * والكمية. **السعر بيتقرا من المنتج** — لو كان جاي من الصفحة، أي حد يقدر
 * يعدّله ويطلب بجنيه.
 *
 * ⚠️ **والأوردر بيدخل «جديد» مش مؤكد** — يعني بيعدّي على نفس مكالمة التأكيد
 * اللي بتعملها لأي أوردر. مافيش حاجة بتروح لبوسطة لوحدها.
 *
 * ⚠️ **والمخزون مابينزلش هنا** — الأوردر لسه ممكن يتلغي في التأكيد، وخصم
 * المخزون على أوردر مش مؤكد بيخلّي الرقم يكدب.
 */
export type LinkResult =
  | { ok: true; orderNumber: string }
  | { ok: false; error: string };

/** ⚠️ حد بسيط ضد التكرار — نفس اللينك مايقبلش أوردر كل تانية */
const lastSeen = new Map<string, number>();
const MIN_GAP_MS = 20_000;

export async function submitLinkOrder(
  linkId: string,
  input: LinkOrderInput
): Promise<LinkResult> {
  const id = String(linkId ?? "").trim();
  if (!id) return { ok: false, error: "اللينك مش مظبوط" };

  const checked = checkLinkOrder(input);
  if (!checked.ok) return checked;

  const now = Date.now();
  const seen = lastSeen.get(id) ?? 0;
  if (now - seen < MIN_GAP_MS) {
    return { ok: false, error: "استنى شوية وحاول تاني" };
  }

  const db = createAdminClient();

  const { data: link } = await db
    .from("order_links")
    .select("tenant_id, variant_id, active")
    .eq("id", id)
    .maybeSingle();

  const row = link as {
    tenant_id: string;
    variant_id: string;
    active: boolean;
  } | null;

  if (!row || !row.active) {
    return { ok: false, error: "اللينك ده مش شغّال دلوقتي" };
  }

  const { data: variant } = await db
    .from("product_variants")
    .select("sale_price, cost_price")
    .eq("id", row.variant_id)
    .maybeSingle();

  const v = variant as { sale_price: number; cost_price: number } | null;
  if (!v) return { ok: false, error: "المنتج ده مش متاح دلوقتي" };

  // العميل: نفس التليفون = نفس العميل
  const { data: existing } = await db
    .from("customers")
    .select("id")
    .eq("tenant_id", row.tenant_id)
    .eq("phone", checked.phone)
    .maybeSingle();

  let customerId = (existing as { id: string } | null)?.id ?? null;

  if (!customerId) {
    const { data: created, error } = await db
      .from("customers")
      .insert({
        // ⚠️ من غير الخانة دي العميل بينزل في بيزنس تاني
        tenant_id: row.tenant_id,
        shopify_customer_id: `link-${crypto.randomUUID()}`,
        full_name: checked.fullName,
        phone: checked.phone,
        address: checked.address,
      })
      .select("id")
      .single();

    if (error || !created) {
      return { ok: false, error: "معرفناش نسجّل الطلب، جرّب تاني" };
    }
    customerId = created.id;
  } else {
    // العميل موجود — بنحدّث عنوانه باللي كتبه دلوقتي
    await db
      .from("customers")
      .update({ address: checked.address })
      .eq("tenant_id", row.tenant_id)
      .eq("id", customerId);
  }

  const orderNumber = linkOrderNumber();

  const { data: order, error: orderError } = await db
    .from("orders")
    .insert({
      tenant_id: row.tenant_id,
      shopify_order_id: `link-${crypto.randomUUID()}`,
      order_number: orderNumber,
      customer_id: customerId,
      order_status: "new",
      order_date: cairoToday(),
      shipping_price: 0,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return { ok: false, error: "معرفناش نسجّل الطلب، جرّب تاني" };
  }

  const { error: itemError } = await db.from("order_items").insert({
    tenant_id: row.tenant_id,
    order_id: order.id,
    variant_id: row.variant_id,
    quantity: checked.quantity,
    sale_price_at_order: v.sale_price,
    cost_price_at_order: v.cost_price,
  });

  if (itemError) {
    return { ok: false, error: "معرفناش نسجّل الطلب، جرّب تاني" };
  }

  lastSeen.set(id, now);

  // عدّاد اللينك — لو فشل مايأثرش على الطلب
  const { data: fresh } = await db
    .from("order_links")
    .select("orders_count")
    .eq("tenant_id", row.tenant_id)
    .eq("id", id)
    .maybeSingle();
  await db
    .from("order_links")
    .update({
      orders_count: Number((fresh as { orders_count: number } | null)?.orders_count ?? 0) + 1,
    })
    .eq("tenant_id", row.tenant_id)
    .eq("id", id);

  return { ok: true, orderNumber };
}
