// اختبارات الجزء اللي بيتكلم مع الشبكة — الوقفات اللي بتمنعنا نغلط في
// أوردر حقيقي. القرار نفسه متختبر في `order-push-plan.test.ts`.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { runShopifyOrderPush } from "./order-push";

const TENANT = "00000000-0000-0000-0000-000000000001";

const CREDS = {
  tenant_id: TENANT,
  shopify_shop: "d8rtv0-uq.myshopify.com",
  shopify_access_token: "tok",
};

/** أوردر عندنا — بند واحد كمية ٢ بسعر ٦٤٩ */
const order = (over: Record<string, unknown> = {}) => ({
  id: "o1",
  tenant_id: TENANT,
  shopify_order_id: "7038153949417",
  order_status: "confirmed",
  discount: 0,
  order_items: [
    {
      quantity: 2,
      sale_price_at_order: 649,
      product_variants: { shopify_variant_id: "V1" },
    },
  ],
  ...over,
});

function fakeDb(orderRow: unknown): SupabaseClient {
  return {
    from(table: string) {
      const data = table === "orders" ? orderRow : CREDS;
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data, error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

/** بند شوبيفاي خام */
const node = (quantity: number, currentQuantity: number, base = 649, eff = base) => ({
  id: `gid://shopify/LineItem/${quantity}-${currentQuantity}-${eff}`,
  quantity,
  currentQuantity,
  variant: { legacyResourceId: "V1" },
  originalUnitPriceSet: { shopMoney: { amount: String(base) } },
  discountedUnitPriceSet: { shopMoney: { amount: String(eff) } },
});

/** بيرد بأوردر شوبيفاي، وبيسجّل كل نداء عشان نتأكد إن مافيش كتابة */
function fakeFetch(shopOrder: unknown) {
  const calls: string[] = [];
  const impl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    calls.push(String(body.query));
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { order: shopOrder } }),
    } as Response;
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const NOT_CANCELLED = { cancelledAt: null, lineItems: { nodes: [node(2, 2)] } };

describe("الأوردر اللي مش مربوط بشوبيفاي", () => {
  it("الأوردر اليدوي بيترفض قبل أي نداء", async () => {
    const { impl, calls } = fakeFetch(NOT_CANCELLED);
    const res = await runShopifyOrderPush({
      db: fakeDb(order({ shopify_order_id: "manual-abc" })),
      orderId: "o1",
      fetchImpl: impl,
    });
    expect(res).toMatchObject({ ok: false, status: 400 });
    // القديمة كانت بتفحص `import-` بس، فاليدوي كان بيعدّي ويقع عند شوبيفاي
    expect(calls).toHaveLength(0);
  });

  it("الأوردر المستورد بيترفض برضه", async () => {
    const { impl } = fakeFetch(NOT_CANCELLED);
    const res = await runShopifyOrderPush({
      db: fakeDb(order({ shopify_order_id: "import-1072" })),
      orderId: "o1",
      fetchImpl: impl,
    });
    expect(res).toMatchObject({ ok: false, status: 400 });
  });
});

describe("الأوردر الملغي", () => {
  it("ملغي عندنا: بنوقف من غير ما نكلّم شوبيفاي أصلًا", async () => {
    const { impl, calls } = fakeFetch(NOT_CANCELLED);
    const res = await runShopifyOrderPush({
      db: fakeDb(order({ order_status: "cancelled" })),
      orderId: "o1",
      fetchImpl: impl,
    });
    expect(res).toMatchObject({ ok: true, changed: 0 });
    expect("skipped" in res && res.skipped).toContain("ملغي عندنا");
    expect(calls).toHaveLength(0);
  });

  it("ملغي عند شوبيفاي: بنوقف بعد ما نقرا بس من غير ما نكتب", async () => {
    const { impl, calls } = fakeFetch({
      cancelledAt: "2026-07-20T00:00:00Z",
      lineItems: { nodes: [node(1, 0)] },
    });
    const res = await runShopifyOrderPush({
      db: fakeDb(order()),
      orderId: "o1",
      fetchImpl: impl,
    });
    expect(res).toMatchObject({ ok: true, changed: 0 });
    expect("skipped" in res && res.skipped).toContain("شوبيفاي");
    // نداء قراية واحد بس — مافيش أي mutation
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain("mutation");
  });
});

describe("وضع التجربة", () => {
  it("بيرجّع الخطة من غير ما يكتب حاجة", async () => {
    const { impl, calls } = fakeFetch({
      cancelledAt: null,
      lineItems: { nodes: [node(1, 1)] },
    });
    const res = await runShopifyOrderPush({
      db: fakeDb(order()),
      orderId: "o1",
      dry: true,
      fetchImpl: impl,
    });
    expect(res).toMatchObject({ ok: true, dry: true, changed: 1 });
    expect(calls.every((q) => !q.includes("mutation"))).toBe(true);
  });
});

describe("البند المكرر — الوقفة اللي بتمنع زيادة الكمية", () => {
  it("بنرفض التنفيذ لو فيه بندين لنفس المنتج", async () => {
    // ده أوردر ١٣٧٤: بند أصله ٢ بقى ١، وبند تاني بـ١. المجموع الحقيقي ٢
    // زي عندنا — بس في وضع القديمة بيبان كأنه ١ فبتحاول تحطه ٢ على بند
    // واحد، والنتيجة ٣ قطع.
    const nodes = [node(2, 1), node(1, 1)];
    const { impl, calls } = fakeFetch({ cancelledAt: null, lineItems: { nodes } });
    const res = await runShopifyOrderPush({
      db: fakeDb(order()),
      orderId: "o1",
      legacy: true,
      fetchImpl: impl,
    });
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(calls.every((q) => !q.includes("mutation"))).toBe(true);
  });

  it("والوضع الصح أصلًا مابيشوفش فرق في نفس الأوردر", async () => {
    const nodes = [node(2, 1), node(1, 1)];
    const { impl } = fakeFetch({ cancelledAt: null, lineItems: { nodes } });
    const res = await runShopifyOrderPush({
      db: fakeDb(order()),
      orderId: "o1",
      fetchImpl: impl,
    });
    expect(res).toMatchObject({ ok: true, changed: 0 });
  });
});

describe("البيزنس اللي لسه مربطش متجر", () => {
  it("بيرجّع سبب واضح", async () => {
    const db = {
      from(table: string) {
        const data =
          table === "orders" ? order() : { tenant_id: TENANT, shopify_shop: null };
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data, error: null }),
        };
        return chain;
      },
    } as unknown as SupabaseClient;

    const res = await runShopifyOrderPush({ db, orderId: "o1" });
    expect(res).toMatchObject({ ok: false, status: 400 });
  });
});
