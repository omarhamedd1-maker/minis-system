"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { checkLinkOrder, linkOrderNumber, type LinkOrderInput } from "@/lib/order-link";
import { cairoToday } from "@/lib/format";

/**
 * العميل بيبعت أوردره من اللينك.
 *
 * ⚠️⚠️ **الصفحة دي مفتوحة للكل** — فكل حاجة بتتقرا من الداتابيز بمعرّف
 * اللينك، ومافيش حاجة بتتاخد من اللي العميل بعته غير اسمه وتليفونه وعنوانه
 * والكميات. **الأسعار بتتقرا من المنتجات** — لو كانت جاية من الصفحة، أي حد
 * كان يقدر يعدّلها ويطلب بجنيه.
 *
 * ⚠️ **والعميل مايقدرش يطلب حاجة مش في اللينك** — أي معرّف مش في بنود
 * اللينك بيتشال قبل ما نحسب حاجة.
 *
 * ⚠️ **والأوردر بيدخل «جديد» مش مؤكد**، **والمخزون مابينزلش** — الأوردر لسه
 * ممكن يتلغي في التأكيد، وخصم مخزون على أوردر مش مؤكد بيخلّي الرقم يكدب.
 */
export type LinkResult =
  | { ok: true; orderNumber: string }
  | { ok: false; error: string };

/** ⚠️ حد بسيط ضد التكرار — نفس اللينك مايقبلش أوردر كل تانية */
const lastSeen = new Map<string, number>();
const MIN_GAP_MS = 20_000;

export async function submitLinkOrder(
  linkId: string,
  input: LinkOrderInput & { items?: { variantId: string; quantity: number }[] }
): Promise<LinkResult> {
  const id = String(linkId ?? "").trim();
  if (!id) return { ok: false, error: "اللينك مش مظبوط" };

  const wanted = (input.items ?? []).filter(
    (i) => i && String(i.variantId ?? "").trim() && Number(i.quantity) > 0
  );
  if (wanted.length === 0) {
    return { ok: false, error: "اختار منتج واحد على الأقل" };
  }

  const checked = checkLinkOrder({ ...input, quantity: 1 });
  if (!checked.ok) return checked;

  const now = Date.now();
  if (now - (lastSeen.get(id) ?? 0) < MIN_GAP_MS) {
    return { ok: false, error: "استنى شوية وحاول تاني" };
  }

  const db = createAdminClient();

  const { data: link } = await db
    .from("order_links")
    .select("tenant_id, variant_id, active, order_link_items(variant_id)")
    .eq("id", id)
    .maybeSingle();

  const row = link as {
    tenant_id: string;
    variant_id: string | null;
    active: boolean;
    order_link_items: { variant_id: string }[] | null;
  } | null;

  if (!row || !row.active) {
    return { ok: false, error: "اللينك ده مش شغّال دلوقتي" };
  }

  // ⚠️ اللينكات القديمة عندها شكل واحد في `variant_id` بدل الجدول
  const allowed = new Set(
    (row.order_link_items ?? [])
      .map((i) => i.variant_id)
      .concat(row.variant_id ? [row.variant_id] : [])
  );
  const items = wanted.filter((i) => allowed.has(i.variantId));
  if (items.length === 0) {
    return { ok: false, error: "المنتجات دي مش في اللينك" };
  }

  const { data: variants } = await db
    .from("product_variants")
    .select("id, sale_price, cost_price")
    .in(
      "id",
      items.map((i) => i.variantId)
    );

  const priced = new Map(
    ((variants ?? []) as { id: string; sale_price: number; cost_price: number }[]).map(
      (v) => [v.id, v]
    )
  );
  if (priced.size === 0) {
    return { ok: false, error: "المنتجات دي مش متاحة دلوقتي" };
  }

  // الشحن الثابت — الفشل معناه صفر، مش رقم مخترع
  const shipping = await (async () => {
    const { data, error } = await db
      .from("tenant_credentials")
      .select("flat_shipping_price")
      .eq("tenant_id", row.tenant_id)
      .maybeSingle();
    if (error) return 0;
    return (
      Number(
        (data as { flat_shipping_price: number | null } | null)?.flat_shipping_price ?? 0
      ) || 0
    );
  })();

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
      shipping_price: shipping,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return { ok: false, error: "معرفناش نسجّل الطلب، جرّب تاني" };
  }

  let added = 0;
  for (const item of items) {
    const v = priced.get(item.variantId);
    if (!v) continue;
    const { error } = await db.from("order_items").insert({
      tenant_id: row.tenant_id,
      order_id: order.id,
      variant_id: item.variantId,
      quantity: item.quantity,
      sale_price_at_order: v.sale_price,
      cost_price_at_order: v.cost_price,
    });
    if (!error) added++;
  }

  if (added === 0) {
    return { ok: false, error: "معرفناش نسجّل الطلب، جرّب تاني" };
  }

  lastSeen.set(id, now);

  const { data: fresh } = await db
    .from("order_links")
    .select("orders_count")
    .eq("tenant_id", row.tenant_id)
    .eq("id", id)
    .maybeSingle();
  await db
    .from("order_links")
    .update({
      orders_count:
        Number((fresh as { orders_count: number } | null)?.orders_count ?? 0) + 1,
    })
    .eq("tenant_id", row.tenant_id)
    .eq("id", id);

  return { ok: true, orderNumber };
}
