// ==========================================================================
// جلب الأوردرات والعملاء من شوبيفاي وإدخالهم عندنا
// --------------------------------------------------------------------------
// القرار في `order-import-plan.ts` (صافي ومتختبر). الملف ده بيتكلم مع
// شوبيفاي وقاعدة البيانات بس.
//
// **مابنلمسش المخزون هنا بقصد.** الأوردرات دي تاريخ حصل خلاص، ومخزونها
// اتحرّك في الواقع من زمان. لو خصمناها تاني المخزون هيطلع بالسالب.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTenantCredentials } from "../tenant-settings";
import { ShopifyError, shopifyGraphQL } from "./client";
import {
  customerKey,
  planOrderImport,
  type OrderImportPlan,
  type ShopifyOrderIn,
} from "./order-import-plan";

export * from "./order-import-plan";

const PAGE_SIZE = 50;
const MAX_PAGES = 60;

const ORDERS_QUERY = `query($cursor: String, $size: Int!) {
  orders(first: $size, after: $cursor, sortKey: CREATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    nodes {
      legacyResourceId
      name
      createdAt
      cancelledAt
      displayFulfillmentStatus
      currentTotalDiscountsSet { shopMoney { amount } }
      totalShippingPriceSet { shopMoney { amount } }
      shippingAddress { name phone address1 address2 city province }
      lineItems(first: 100) {
        nodes {
          title
          currentQuantity
          variant { legacyResourceId }
          discountedUnitPriceSet { shopMoney { amount } }
        }
      }
    }
  }
}`;

type RawOrder = {
  legacyResourceId?: string | null;
  name?: string | null;
  createdAt?: string | null;
  cancelledAt?: string | null;
  displayFulfillmentStatus?: string | null;
  currentTotalDiscountsSet?: { shopMoney?: { amount?: string } } | null;
  totalShippingPriceSet?: { shopMoney?: { amount?: string } } | null;
  shippingAddress?: {
    name?: string | null;
    phone?: string | null;
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    province?: string | null;
  } | null;
  lineItems?: {
    nodes?: {
      title?: string | null;
      currentQuantity?: number | null;
      variant?: { legacyResourceId?: string | null } | null;
      discountedUnitPriceSet?: { shopMoney?: { amount?: string } } | null;
    }[];
  } | null;
};

/** العنوان بيتجمّع من قطع شوبيفاي في سطر واحد */
function joinAddress(a: RawOrder["shippingAddress"]): string | null {
  const parts = [a?.address1, a?.address2, a?.city, a?.province]
    .map((p) => String(p ?? "").trim())
    .filter(Boolean);
  return parts.length > 0 ? [...new Set(parts)].join(" — ") : null;
}

export async function fetchShopifyOrders(
  shop: string,
  token: string,
  fetchImpl?: typeof fetch
): Promise<ShopifyOrderIn[]> {
  const out: ShopifyOrderIn[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data: {
      orders: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: RawOrder[];
      };
    } = await shopifyGraphQL(
      shop,
      token,
      ORDERS_QUERY,
      { cursor, size: PAGE_SIZE },
      fetchImpl
    );

    for (const o of data.orders?.nodes ?? []) {
      const id = String(o.legacyResourceId ?? "");
      if (!id) continue;

      out.push({
        shopifyOrderId: id,
        orderNumber: String(o.name ?? "").replace("#", "").trim(),
        createdAt: o.createdAt ?? null,
        cancelled: Boolean(o.cancelledAt),
        fulfilled: String(o.displayFulfillmentStatus ?? "") === "FULFILLED",
        discount: Number(o.currentTotalDiscountsSet?.shopMoney?.amount ?? 0),
        shipping: Number(o.totalShippingPriceSet?.shopMoney?.amount ?? 0),
        customer: {
          // **مش بناخد رقم العميل عند شوبيفاي بقصد.** الحقل ده محتاج صلاحية
          // `read_customers` اللي بتخلّي التطبيق يعدّي مراجعة بيانات شخصية
          // عند شوبيفاي — وده أسابيع انتظار وخطوة موافقة على كل عميل جديد.
          // وعنوان الشحن فيه نفس اللي محتاجينه (اسم وتليفون وعنوان) ومسموح
          // بـ`read_orders` لوحدها، فالمطابقة بتحصل بالتليفون.
          shopifyCustomerId: null,
          fullName: o.shippingAddress?.name ?? null,
          phone: o.shippingAddress?.phone ?? null,
          address: joinAddress(o.shippingAddress),
        },
        lines: (o.lineItems?.nodes ?? [])
          // البند اللي اتشال من الأوردر كميته الحالية صفر — مش بند
          .filter((l) => Number(l.currentQuantity ?? 0) > 0)
          .map((l) => ({
            shopifyVariantId: l.variant?.legacyResourceId
              ? String(l.variant.legacyResourceId)
              : null,
            title: String(l.title ?? "").trim() || "بند بدون اسم",
            quantity: Number(l.currentQuantity ?? 0),
            unitPrice: Number(l.discountedUnitPriceSet?.shopMoney?.amount ?? 0),
          })),
      });
    }

    if (!data.orders?.pageInfo?.hasNextPage) break;
    cursor = data.orders.pageInfo.endCursor;
  }

  return out;
}

export type OrderImportResult =
  | {
      ok: true;
      dry: boolean;
      plan: OrderImportPlan;
      added?: { orders: number; customers: number };
      /** اللي اتعمل فعلًا — بيتسجّل في `import_runs` عشان التراجع */
      undo?: { orders: string[]; customers: string[] };
    }
  | { ok: false; error: string };

export async function runOrderImport(opts: {
  db: SupabaseClient;
  tenantId: string;
  dry?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<OrderImportResult> {
  const { db, tenantId, dry = false, fetchImpl } = opts;

  const creds = await loadTenantCredentials(db, tenantId);
  if (!creds.shopifyShop || !creds.shopifyAccessToken) {
    return { ok: false, error: "البيزنس ده لسه مربطش متجر شوبيفاي" };
  }

  let shopifyOrders: ShopifyOrderIn[];
  try {
    shopifyOrders = await fetchShopifyOrders(
      creds.shopifyShop,
      creds.shopifyAccessToken,
      fetchImpl
    );
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof ShopifyError || e instanceof Error
          ? e.message
          : "معرفناش نوصل لشوبيفاي",
    };
  }

  // ⚠️⚠️ **الفلتر على البيزنس هنا هو اللي بيخلّي الاستيراد صح — مش رفاهية.**
  //
  // مفتاح الأدمن بيعدّي على الـRLS، فمن غيره التلات قوايم دي بترجّع صفوف
  // **كل البيزنسات**. والنتيجة تلات أعطال في نفس الوقت:
  //
  //   ١. **أوردر العميل الجديد بيتخطّى.** المقارنة برقم الأوردر، ورقم زي
  //      «١٠٠١» موجود عند كذا بيزنس — فالاستيراد بيقول «ده عندي خلاص»
  //      ويعدّيه. العميل يشوف أوردراته ناقصة ومحدش يعرف ليه.
  //   ٢. **العميل بيتربط بعميل بيزنس تاني** — المطابقة بالتليفون، والتليفون
  //      مش فريد بين البيزنسات.
  //   ٣. **بند الأوردر بياخد منتج بيزنس تاني** بتكلفته هو، فالأرباح تغلط.
  const [{ data: ourOrders }, { data: ourCustomers }, { data: ourVariants }] =
    await Promise.all([
      db
        .from("orders")
        .select("shopify_order_id, order_number")
        .eq("tenant_id", tenantId)
        .overrideTypes<
          { shopify_order_id: string | null; order_number: string | null }[]
        >(),
      db
        .from("customers")
        .select("id, shopify_customer_id, phone")
        .eq("tenant_id", tenantId)
        .overrideTypes<
          { id: string; shopify_customer_id: string | null; phone: string | null }[]
        >(),
      db
        .from("product_variants")
        .select("id, shopify_variant_id, cost_price")
        .eq("tenant_id", tenantId)
        .overrideTypes<
          { id: string; shopify_variant_id: string | null; cost_price: number }[]
        >(),
    ]);

  const variantByShopifyId = new Map<string, { id: string; cost: number }>();
  for (const v of ourVariants ?? []) {
    if (v.shopify_variant_id) {
      variantByShopifyId.set(String(v.shopify_variant_id), {
        id: v.id,
        cost: Number(v.cost_price ?? 0),
      });
    }
  }

  const plan = planOrderImport(
    shopifyOrders,
    (ourOrders ?? []).map((o) => ({
      shopifyOrderId: o.shopify_order_id,
      orderNumber: o.order_number,
    })),
    (ourCustomers ?? []).map((c) => ({
      id: c.id,
      shopifyCustomerId: c.shopify_customer_id,
      phone: c.phone,
    })),
    new Set(variantByShopifyId.keys())
  );

  if (dry || plan.toImport.length === 0) return { ok: true, dry, plan };

  let addedOrders = 0;
  let addedCustomers = 0;
  // بنسجّل اللي بيتعمل عشان التراجع يبقى ممكن
  const madeOrders: string[] = [];
  const madeCustomers: string[] = [];
  // عملاء اتعملوا في نفس الدفعة — عشان عميل ليه أوردرين مايتعملش مرتين
  const created = new Map<string, string>();

  for (const item of plan.toImport) {
    const o = item.order;
    let customerId = item.customerId;

    if (!customerId) {
      // نفس المفتاح اللي القرار اتبنى عليه — لو اختلفوا، العدد اللي اتعرض
      // هيبقى غير اللي اتنفّذ
      const key = customerKey(o);
      customerId = created.get(key) ?? null;

      if (!customerId) {
        const { data: newCustomer } = await db
          .from("customers")
          .insert({
            // ⚠️ **الخانة دي مش زيادة.** `db` هنا بمفتاح الأدمن وبيعدّي على
            // الـRLS، والقيمة الافتراضية في الداتابيز بتقرا المستخدم الداخل
            // — ومفيش مستخدم. فبترجّع **مينيز**.
            //
            // والمسار ده بالذات اتعمل عشان **أي بيزنس جديد** يشتغل، فكان
            // هيسحب متجر العميل كله جوّه بيزنس عمر.
            tenant_id: tenantId,
            shopify_customer_id: o.customer?.shopifyCustomerId ?? null,
            full_name: o.customer?.fullName ?? "بدون اسم",
            phone: o.customer?.phone ?? null,
            address: o.customer?.address ?? null,
          })
          .select("id")
          .maybeSingle();

        if (newCustomer) {
          customerId = newCustomer.id;
          created.set(key, newCustomer.id);
          addedCustomers++;
          madeCustomers.push(newCustomer.id);
        }
      }
    }

    const { data: newOrder, error: orderError } = await db
      .from("orders")
      .insert({
        tenant_id: tenantId,
        shopify_order_id: o.shopifyOrderId,
        order_number: o.orderNumber,
        customer_id: customerId,
        order_status: item.status,
        order_date: o.createdAt,
        discount: o.discount,
        shipping_price: o.shipping,
        delivered_at: item.status === "delivered" ? o.createdAt : null,
        cancelled_at: item.status === "cancelled" ? o.createdAt : null,
      })
      .select("id")
      .maybeSingle();

    if (orderError || !newOrder) continue;
    addedOrders++;
    madeOrders.push(newOrder.id);

    for (const line of o.lines) {
      const variant = variantByShopifyId.get(String(line.shopifyVariantId));
      if (!variant) continue;
      await db.from("order_items").insert({
        tenant_id: tenantId,
        order_id: newOrder.id,
        variant_id: variant.id,
        quantity: line.quantity,
        sale_price_at_order: line.unitPrice,
        // التكلفة وقت الأوردر = تكلفة المنتج دلوقتي. لو صفر، ملف التكاليف
        // هو اللي بيصلّحها.
        cost_price_at_order: variant.cost,
      });
    }
  }

  return {
    ok: true,
    dry: false,
    plan,
    added: { orders: addedOrders, customers: addedCustomers },
    undo: { orders: madeOrders, customers: madeCustomers },
  };
}
