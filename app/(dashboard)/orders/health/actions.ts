"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser, can } from "@/lib/permissions";
import { cairoToday } from "@/lib/format";
import { carrierRates, leadTime, type OpsOrder } from "@/lib/ops-metrics";
import { collectionAging, type Aging } from "@/lib/collection-aging";
import {
  breakdownReturnReasons,
  type ReasonBreakdown,
} from "@/lib/return-reasons";
import { findDrift, type DriftRow } from "@/lib/shopify/drift";
import { customerReturnRates, productReturnRates, type RateReport } from "@/lib/return-rates";
import { priceTests, type PriceTest } from "@/lib/price-tests";
import { shippingByDay, type TimingReport } from "@/lib/shipping-timing";
import { discountImpact, type DiscountReport } from "@/lib/discount-impact";
import { codGaps, type GapReport } from "@/lib/cod-gap";
import { prepaidValue } from "@/lib/prepaid-value";
import { fetchShopifyOrders } from "@/lib/shopify/orders";
import { resolveShopifyToken } from "@/lib/shopify/token";

export type HealthReport =
  | {
      ok: true;
      /** الدفع المقدم بيوفّر كام — من رجوع الدفع عند الاستلام */
      prepaid: ReturnType<typeof prepaidValue>;
      rates: ReturnType<typeof carrierRates>;
      lead: ReturnType<typeof leadTime>;
      aging: Aging;
      reasons: ReasonBreakdown;
      /**
       * أوردرات إجماليها عندنا مختلف عن شوبيفاي.
       *
       * `null` معناها **مافيش مقارنة**: البيزنس مش مربوط بشوبيفاي، أو
       * الجلب وقع. مش نفس معنى القايمة الفاضية (يعني كله مطابق).
       */
      drift: DriftRow[] | null;
      /** المنتجات اللي بترجع أكتر من غيرها */
      productReturns: RateReport;
      /** العملاء اللي بيرجّعوا */
      customerReturns: RateReport;
      /** المنتجات اللي اتباعت بأكتر من سعر — وأنهي سعر كسب */
      prices: PriceTest[];
      /** الشحن حسب يوم الأسبوع في الأسبوع */
      timing: TimingReport;
      /** الخصم كسّب ولا خسّر */
      discounts: DiscountReport;
      /** رقمنا مقابل رقم بوسطة */
      codGap: GapReport;
    }
  | { ok: false; error: string };

/**
 * صحة التشغيل — الأرقام اللي بتقول إيه اللي بيضيع.
 *
 * **قراية بالكامل.** كل الحساب في دوال صافية متختبرة، والصفحة دي بتجيب
 * الصفوف وبتناديهم بس.
 */
export async function loadHealth(): Promise<HealthReport> {
  const me = await getSessionUser();
  if (!me || !can(me, "finance.dashboard")) {
    return { ok: false, error: "مالكش صلاحية" };
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("orders")
    .select(
      `order_number, order_status, order_date, delivered_at, bosta_tracking,
       bosta_created_at, bosta_cod, bosta_collected, cash_received_at,
       return_reason, discount, shipping_price, customer_id,
       amount_paid, bosta_fees_real, bosta_shipping_cost,
       customers(full_name),
       order_items(quantity, sale_price_at_order, variant_id,
         product_variants(variant_name, products(name_ar, name)))`
    )
    .eq("tenant_id", me.tenantId)
    .limit(5000);

  if (error) return { ok: false, error: "معرفناش نقرا الأوردرات" };

  const rows = (data ?? []) as unknown as OpsOrder[];

  const codes = await loadDiscountCodes(db, me.tenantId);

  /**
   * ⚠️⚠️ **قيمة الدفع المقدم بتتحسب من رجوع الاستلام، مش من مقارنة
   * الطريقتين.** عند مينيز فيه ٦ أوردرات مدفوعة مقدم بس — «صفر رجوع»
   * عليهم مش دليل، ده نفس فخ «١٠٠٪ على أوردر واحد».
   *
   * الرقم القوي هو رجوع الدفع عند الاستلام على مئات الأوردرات.
   */
  const money = rows as unknown as {
    order_status: string | null;
    amount_paid: number | null;
    discount: number | null;
    shipping_price: number | null;
    bosta_fees_real: number | null;
    bosta_shipping_cost: number | null;
    order_items: { quantity: number; sale_price_at_order: number }[] | null;
  }[];

  const SETTLED = ["delivered", "returned", "returned_after_delivery"];
  const RETURNED = ["returned", "returned_after_delivery"];

  let codSettled = 0;
  let codReturned = 0;
  let prepaidCount = 0;
  let deliveredTotal = 0;
  let deliveredCount = 0;
  const returnFees: number[] = [];

  for (const o of money) {
    const status = String(o.order_status);
    const paid = Number(o.amount_paid ?? 0) > 0;
    if (paid) prepaidCount++;

    const total =
      (o.order_items ?? []).reduce(
        (a, i) => a + Number(i.quantity) * Number(i.sale_price_at_order),
        0
      ) -
      Number(o.discount ?? 0) +
      Number(o.shipping_price ?? 0);

    if (status === "delivered" && total > 0) {
      deliveredTotal += total;
      deliveredCount++;
    }

    if (!paid && SETTLED.includes(status)) {
      codSettled++;
      if (RETURNED.includes(status)) {
        codReturned++;
        // ⚠️ الرسوم الحقيقية لو موجودة، والتقديرية لو لسه — مش صفر
        const fee = Number(o.bosta_fees_real ?? o.bosta_shipping_cost ?? 0);
        if (fee > 0) returnFees.push(fee);
      }
    }
  }

  const avgReturnFee =
    returnFees.length > 0
      ? returnFees.reduce((a, b) => a + b, 0) / returnFees.length
      : 0;

  return {
    ok: true,
    prepaid: prepaidValue({
      codSettled,
      codReturned,
      prepaidCount,
      returnShippingCost: avgReturnFee,
      averageOrder: deliveredCount > 0 ? deliveredTotal / deliveredCount : 0,
    }),
    rates: carrierRates(rows),
    lead: leadTime(rows),
    aging: collectionAging(rows as never, cairoToday()),
    reasons: breakdownReturnReasons(rows as never),
    drift: await loadDrift(db, me.tenantId, rows as never),
    productReturns: productReturnRates(toRate(rows as never)),
    customerReturns: customerReturnRates(toRate(rows as never)),
    prices: priceTests(toPrice(rows as never)),
    timing: shippingByDay(
      rows.map((o) => ({
        orderStatus: o.order_status,
        bostaTracking: o.bosta_tracking,
        bostaCreatedAt: o.bosta_created_at,
        deliveredAt: o.delivered_at,
      }))
    ),
    // ⚠️ **الإجمالي هنا هو اللي العميل دفعه** (بنود − خصم + شحن) مش قيمة
    // البضاعة — الفرق ده هو الفرق بين «الخصم بيزوّد الأوردر» و«بياكله».
    codGap: codGaps(
      rows.map((o) => {
        const r = o as unknown as {
          order_number: string | null;
          order_status: string | null;
          bosta_cod: number | null;
          bosta_collected: boolean | null;
          discount: number | null;
          shipping_price: number | null;
          order_items: { quantity: number; sale_price_at_order: number }[] | null;
        };
        return {
          orderNumber: r.order_number,
          orderStatus: r.order_status,
          bostaCod: r.bosta_cod,
          bostaCollected: r.bosta_collected,
          itemsTotal: (r.order_items ?? []).reduce(
            (s, i) => s + Number(i.quantity) * Number(i.sale_price_at_order),
            0
          ),
          discount: Number(r.discount ?? 0),
          shipping: Number(r.shipping_price ?? 0),
        };
      })
    ),
    discounts: discountImpact(
      rows.map((o) => ({
        orderStatus: o.order_status,
        itemsTotal: (o.order_items ?? []).reduce(
          (s, i) => s + Number(i.quantity) * Number(i.sale_price_at_order),
          0
        ),
        discount: Number(o.discount ?? 0),
        shipping: Number(o.shipping_price ?? 0),
        code:
          codes.get(
            String(
              (o as unknown as { order_number?: string | null }).order_number ?? ""
            )
          ) ?? null,
      }))
    ),
  };
}

type RowForDrift = {
  order_number: string | null;
  order_status: string | null;
  discount: number | null;
  shipping_price: number | null;
  bosta_cod: number | null;
  bosta_collected: boolean | null;
  order_items: { quantity: number; sale_price_at_order: number }[] | null;
};

/**
 * الفرق بين إجمالينا وإجمالي شوبيفاي.
 *
 * ⚠️ **بيتحسب مع فتح الصفحة، مش مخزّن.** ده بيكلّف نداء واحد لشوبيفاي،
 * بس بيضمن إن الرقم اللي بتشوفه هو الرقم دلوقتي — والبديل (عمود مخزّن)
 * بيحتاج تغيير في الداتابيز وبيقدم من غير ما حد ياخد باله.
 *
 * **وأي عطل هنا بيرجّع `null` مش استثناء** — صفحة صحة التشغيل كلها
 * ماتقعش عشان شوبيفاي مردّتش.
 */
async function loadDrift(
  db: ReturnType<typeof createAdminClient>,
  tenantId: string,
  rows: RowForDrift[]
): Promise<DriftRow[] | null> {
  try {
    // ⚠️ توكن حيّ — المتخزّن بيموت بعد ٢٤ ساعة (`lib/shopify/token.ts`)
    const auth = await resolveShopifyToken(db, tenantId);
    if (!auth.ok) return null;

    const shopifyOrders = await fetchShopifyOrders(auth.shop, auth.token);

    return findDrift(
      rows
        .filter((o) => o.order_number)
        .map((o) => ({
          orderNumber: String(o.order_number),
          orderStatus: String(o.order_status ?? ""),
          itemsTotal: (o.order_items ?? []).reduce(
            (s, i) => s + Number(i.quantity) * Number(i.sale_price_at_order),
            0
          ),
          discount: Number(o.discount ?? 0),
          shipping: Number(o.shipping_price ?? 0),
          bostaCod: o.bosta_cod === null ? null : Number(o.bosta_cod),
          bostaCollected: Boolean(o.bosta_collected),
        })),
      shopifyOrders.map((s) => ({
        orderNumber: s.orderNumber,
        cancelled: s.cancelled,
        total:
          s.lines.reduce((a, l) => a + l.quantity * l.unitPrice, 0) -
          Number(s.discount ?? 0) +
          Number(s.shipping ?? 0),
      }))
    );
  } catch {
    return null;
  }
}

/**
 * تحويل صف الأوردر لشكل حسبة نسب الرجوع.
 *
 * ⚠️ **اسم الشكل بيتحط جنب اسم المنتج** — منتج ليه ٤٤ شكل كان بيطلع ٤٤
 * سطر بنفس الاسم بالظبط في الشاشة، ومحدش يعرف أنهي واحد فيهم اللي بيرجع.
 */
function toRate(rows: Record<string, unknown>[]) {
  return rows.map((o) => ({
    orderStatus: o.order_status as string | null,
    customerId: (o.customer_id as string | null) ?? null,
    customerName:
      (o.customers as { full_name?: string | null } | null)?.full_name ?? null,
    items: ((o.order_items ?? []) as Record<string, unknown>[]).map((i) => {
      const v = i.product_variants as
        | { variant_name?: string | null; products?: { name_ar?: string | null; name?: string | null } | null }
        | null;
      const base = v?.products?.name_ar || v?.products?.name || "منتج";
      const variant = String(v?.variant_name ?? "").trim();
      return {
        variantId: (i.variant_id as string | null) ?? null,
        productName: variant ? `${base} — ${variant}` : base,
      };
    }),
  }));
}

/**
 * تحويل صف الأوردر لشكل مقارنة الأسعار.
 *
 * ⚠️ السعر بيتاخد من **البند نفسه** (`sale_price_at_order`) مش من المنتج
 * الحالي — وده بالظبط اللي بيخلي المقارنة ممكنة: سعر النهارده مايقولش
 * حاجة عن اللي اتباع بيه الشهر اللي فات.
 */
function toPrice(rows: Record<string, unknown>[]) {
  return rows.map((o) => ({
    orderDate: (o.order_date as string | null) ?? null,
    orderStatus: (o.order_status as string | null) ?? null,
    items: ((o.order_items ?? []) as Record<string, unknown>[]).map((i) => {
      const v = i.product_variants as
        | { variant_name?: string | null; products?: { name_ar?: string | null; name?: string | null } | null }
        | null;
      const base = v?.products?.name_ar || v?.products?.name || "منتج";
      const variant = String(v?.variant_name ?? "").trim();
      return {
        variantId: (i.variant_id as string | null) ?? null,
        productName: variant ? `${base} — ${variant}` : base,
        quantity: Number(i.quantity) || 0,
        price: Number(i.sale_price_at_order) || 0,
      };
    }),
  }));
}

/**
 * كود الخصم لكل أوردر.
 *
 * ⚠️⚠️ **بره الاستعلام الأساسي بقصد.** العمود ده اتعمل ١٩ أغسطس ٢٠٢٦
 * (`sql/discount-code-and-followup.sql`)، ولو لسه مااتشغّلش الـ`select`
 * بيرجّع **خطأ** — ولو كان جوّه الاستعلام الكبير كان هيوقّع شاشة صحة
 * التشغيل كلها بدل ما يضيّع تفصيلة واحدة.
 *
 * الفشل هنا = خريطة فاضية، والشاشة بتقول إن تفصيل الأكواد لسه بيتملى.
 */
async function loadDiscountCodes(
  db: ReturnType<typeof createAdminClient>,
  tenantId: string
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const { data, error } = await db
      .from("orders")
      .select("order_number, discount_code")
      .eq("tenant_id", tenantId)
      .not("discount_code", "is", null)
      .limit(5000);
    if (error) return out;
    for (const row of (data ?? []) as { order_number: string | null; discount_code: string | null }[]) {
      const n = String(row.order_number ?? "").trim();
      const c = String(row.discount_code ?? "").trim();
      if (n && c) out.set(n, c);
    }
  } catch {
    // العمود لسه مااتعملش — الشاشة بتشتغل من غير تفصيل الأكواد
  }
  return out;
}
