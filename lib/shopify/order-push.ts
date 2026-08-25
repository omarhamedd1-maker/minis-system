// ==========================================================================
// دفع تعديلات الأوردر لشوبيفاي
// --------------------------------------------------------------------------
// **دي أخطر دالة في المشروع.** بتعدّل أوردرات حقيقية عند شوبيفاي — كميات
// وأسعار. غلطة هنا معناها عميل بيتحاسب على حاجة مش صح.
//
// القرار نفسه في `order-push-plan.ts` (صافي ومتختبر). الملف ده هو اللي
// بيتكلم مع الشبكة وقاعدة البيانات بس.
//
// وعشان الخصم ما يتراكمش (٦٤٩ ثم ٦٠٠ ثم ٥٠٢ — الباج اللي خد محاولات كتير)
// بنشيل **خصمنا القديم بالاسم** (`PRICE_EDIT_LABEL`) قبل ما نحط الجديد،
// والخصم الجديد بيتحسب من **سعر الكتالوج** مش من السعر الحالي. الاتنين دول
// هم اللي بيمنعوا التراكم — متلمسهمش.
//
// الكود القديم اللي كان في لوحة سوبابيز محفوظ في
// `supabase-edge-functions/shopify-order-push.ts` للمقارنة.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveShopifyToken } from "./token";
import { ShopifyError, shopifyGraphQL } from "./client";
import {
  NOT_SHOPIFY_PREFIXES,
  PRICE_EDIT_LABEL,
  changeCount,
  discountPercent,
  duplicatedVariants,
  planOrderPush,
  readShopLines,
  type OurItem,
  type PushPlan,
  type RawLineNode,
} from "./order-push-plan";

export * from "./order-push-plan";

const ORDER_LINES_QUERY = `query($id: ID!){
  order(id: $id) {
    cancelledAt
    lineItems(first: 100) { nodes {
      id
      quantity
      currentQuantity
      variant { legacyResourceId }
      originalUnitPriceSet { shopMoney { amount } }
      discountedUnitPriceSet { shopMoney { amount } }
    } }
  }
}`;

const EDIT_BEGIN = `mutation($id: ID!){
  orderEditBegin(id: $id) {
    calculatedOrder {
      id
      lineItems(first: 100) { nodes {
        id
        quantity
        variant { legacyResourceId }
        calculatedDiscountAllocations { discountApplication { id description } }
      } }
    }
    userErrors { message }
  }
}`;

export type PushResult =
  | {
      ok: true;
      changed: number;
      plan: PushPlan;
      dry: boolean;
      /** لو اتملّي: إحنا اللي قررنا منلمسش الأوردر، والسبب مكتوب */
      skipped?: string;
    }
  | { ok: false; error: string; status: number };

const EMPTY_PLAN: PushPlan = {
  onlyQty: [],
  priceFix: [],
  toAdd: [],
  toRemove: [],
  cantRaise: [],
};

type OrderRow = {
  id: string;
  tenant_id: string;
  shopify_order_id: string | null;
  order_status: string | null;
  discount: number | null;
  order_items:
    | {
        quantity: number;
        sale_price_at_order: number;
        product_variants: { shopify_variant_id: string | null } | null;
      }[]
    | null;
};

/**
 * بيدفع تعديلات الأوردر لشوبيفاي.
 *
 * `dry` بيرجّع الخطة من غير ما يكتب أي حاجة — استخدمه دايمًا الأول.
 * `legacy` للمقارنة بالدالة القديمة بس، مش للتشغيل الحقيقي.
 */
export async function runShopifyOrderPush(opts: {
  db: SupabaseClient;
  orderId: string;
  dry?: boolean;
  legacy?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<PushResult> {
  const { db, orderId, dry = false, legacy = false, fetchImpl } = opts;

  const { data, error } = await db
    .from("orders")
    .select(
      `id, tenant_id, shopify_order_id, order_status, discount,
       order_items(quantity, sale_price_at_order,
         product_variants(shopify_variant_id))`
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: "معرفناش نقرا الأوردر: " + error.message, status: 500 };
  }
  if (!data) return { ok: false, error: "الأوردر مش موجود", status: 404 };

  const order = data as unknown as OrderRow;
  const shopifyOrderId = order.shopify_order_id;

  // القديمة كانت بتفحص `import-` بس، فالأوردر اليدوي (`manual-`) كان بيعدّي
  // ويقع عند شوبيفاي بخطأ مش مفهوم. بنفحص الاتنين.
  if (
    !shopifyOrderId ||
    NOT_SHOPIFY_PREFIXES.some((p) => String(shopifyOrderId).startsWith(p))
  ) {
    return { ok: false, error: "الأوردر مش مربوط بشوبيفاي", status: 400 };
  }

  // ⚠️ توكن حيّ — المتخزّن بيموت بعد ٢٤ ساعة (اقرا `lib/shopify/token.ts`)
  const auth = await resolveShopifyToken(db, order.tenant_id);
  if (!auth.ok) return { ok: false, error: auth.error, status: 400 };
  const shop = auth.shop;
  const token = auth.token;

  const items: OurItem[] = (order.order_items ?? []).map((it) => ({
    shopifyVariantId: it.product_variants?.shopify_variant_id ?? null,
    quantity: Number(it.quantity),
    salePrice: Number(it.sale_price_at_order),
  }));

  // **الأوردر الملغي مابنلمسهوش.** أوردر ١٣٥٦ ملغي عندنا و"لاغي" عند شوبيفاي
  // وبنوده اتصفّرت — ومن غير الوقفة دي كنا هنحاول نرجّع بنوده تاني.
  if (order.order_status === "cancelled") {
    return {
      ok: true,
      changed: 0,
      plan: EMPTY_PLAN,
      dry,
      skipped: "الأوردر ملغي عندنا — مابنعدّلش أوردر ملغي عند شوبيفاي",
    };
  }

  const orderGid = `gid://shopify/Order/${shopifyOrderId}`;

  let nodes: RawLineNode[];
  let cancelledAt: string | null;
  try {
    const res = await shopifyGraphQL<{
      order: { cancelledAt: string | null; lineItems: { nodes: RawLineNode[] } } | null;
    }>(shop, token, ORDER_LINES_QUERY, { id: orderGid }, fetchImpl);

    if (!res?.order) {
      return { ok: false, error: "شوبيفاي مالقتش الأوردر ده", status: 404 };
    }
    nodes = res.order.lineItems?.nodes ?? [];
    cancelledAt = res.order.cancelledAt;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "معرفناش نوصل لشوبيفاي",
      status: e instanceof ShopifyError ? e.status : 502,
    };
  }

  // شوبيفاي هي الأصل هنا — ممكن الأوردر يتلغي عندها من غير ما نعرف
  if (cancelledAt) {
    return {
      ok: true,
      changed: 0,
      plan: EMPTY_PLAN,
      dry,
      skipped: "الأوردر ملغي عند شوبيفاي نفسها",
    };
  }

  const plan = planOrderPush(
    items,
    readShopLines(nodes, { legacy }),
    Number(order.discount ?? 0)
  );
  const changes = changeCount(plan);

  if (changes === 0 || dry) {
    return { ok: true, changed: changes, plan, dry };
  }

  // **وقفة أمان.** الأوردر اللي فيه أكتر من بند لنفس المنتج مالوش "بند واحد"
  // نظبّطه — والدالة القديمة كانت بتختار واحد منهم وتحط عليه الكمية كلها،
  // يعني بتزوّد الأوردر بدل ما تظبّطه. أوردر ١٣٧٤ عنده بندين لنفس المنتج
  // كمية ١ + ١، وإحنا عايزين ٢ — القديمة كانت هتحطها ٢ على واحد منهم فيبقى
  // الأوردر ٣ قطع والعميل يتحاسب على ٦٤٩ زيادة.
  const duplicated = duplicatedVariants(nodes);
  if (duplicated.length > 0) {
    return {
      ok: false,
      error:
        "الأوردر ده فيه أكتر من بند لنفس المنتج عند شوبيفاي — التعديل وقف " +
        "عشان منزوّدش كمية غلط. ظبّطه من لوحة شوبيفاي بإيدك.",
      status: 409,
    };
  }

  try {
    await applyPlan({ shop, token, orderGid, plan, fetchImpl });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "شوبيفاي رفضت التعديل",
      status: e instanceof ShopifyError ? e.status : 502,
    };
  }

  return { ok: true, changed: changes, plan, dry: false };
}

/** بينفّذ الخطة عند شوبيفاي — كله جوّه تعديل واحد بيتقفل في الآخر */
async function applyPlan(args: {
  shop: string;
  token: string;
  orderGid: string;
  plan: PushPlan;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const { shop, token, orderGid, plan, fetchImpl } = args;

  const call = <T>(query: string, variables: Record<string, unknown>) =>
    shopifyGraphQL<T>(shop, token, query, variables, fetchImpl);

  const fail = (step: string, errs: { message: string }[]): never => {
    throw new ShopifyError(`${step}: ${errs.map((e) => e.message).join(" — ")}`, 400);
  };

  const begin = await call<{
    orderEditBegin: {
      calculatedOrder: {
        id: string;
        lineItems: {
          nodes: {
            id: string;
            quantity: number;
            variant?: { legacyResourceId?: string | null } | null;
            calculatedDiscountAllocations?: {
              discountApplication?: { id?: string; description?: string } | null;
            }[];
          }[];
        };
      } | null;
      userErrors: { message: string }[];
    };
  }>(EDIT_BEGIN, { id: orderGid });

  if (begin.orderEditBegin.userErrors?.length) {
    fail("فتح التعديل", begin.orderEditBegin.userErrors);
  }
  const calc = begin.orderEditBegin.calculatedOrder;
  if (!calc) throw new ShopifyError("شوبيفاي مافتحتش التعديل", 502);

  const calcId = calc.id;
  const known = new Set<string>();
  const byVar = new Map<string, { lineId: string; ourDiscounts: string[] }>();

  for (const node of calc.lineItems.nodes) {
    known.add(node.id);
    const svid = node.variant?.legacyResourceId;
    if (!svid) continue;
    // خصوماتنا إحنا بس — بنعرفها بالاسم
    const ours = (node.calculatedDiscountAllocations ?? [])
      .filter(
        (a) => String(a?.discountApplication?.description ?? "") === PRICE_EDIT_LABEL
      )
      .map((a) => String(a.discountApplication?.id))
      .filter(Boolean);
    byVar.set(String(svid), { lineId: node.id, ourDiscounts: ours });
  }

  const setQuantity = async (lineId: string, qty: number) => {
    const r = await call<{ orderEditSetQuantity: { userErrors: { message: string }[] } }>(
      `mutation($id:ID!,$li:ID!,$q:Int!){
         orderEditSetQuantity(id:$id,lineItemId:$li,quantity:$q,restock:false){
           userErrors{ message } } }`,
      { id: calcId, li: lineId, q: qty }
    );
    if (r.orderEditSetQuantity.userErrors?.length) {
      fail("تغيير الكمية", r.orderEditSetQuantity.userErrors);
    }
  };

  const removeDiscount = async (applicationId: string) => {
    const r = await call<{
      orderEditRemoveLineItemDiscount: { userErrors: { message: string }[] };
    }>(
      `mutation($id:ID!,$d:ID!){
         orderEditRemoveLineItemDiscount(id:$id,discountApplicationId:$d){
           userErrors{ message } } }`,
      { id: calcId, d: applicationId }
    );
    if (r.orderEditRemoveLineItemDiscount.userErrors?.length) {
      fail("شيل الخصم القديم", r.orderEditRemoveLineItemDiscount.userErrors);
    }
  };

  const addDiscount = async (lineId: string, percent: number) => {
    const r = await call<{
      orderEditAddLineItemDiscount: { userErrors: { message: string }[] };
    }>(
      `mutation($id:ID!,$li:ID!,$d:OrderEditAppliedDiscountInput!){
         orderEditAddLineItemDiscount(id:$id,lineItemId:$li,discount:$d){
           userErrors{ message } } }`,
      {
        id: calcId,
        li: lineId,
        d: { description: PRICE_EDIT_LABEL, percentValue: percent },
      }
    );
    if (r.orderEditAddLineItemDiscount.userErrors?.length) {
      fail("حط الخصم", r.orderEditAddLineItemDiscount.userErrors);
    }
  };

  const addVariant = async (svid: string, qty: number) => {
    const r = await call<{
      orderEditAddVariant: {
        calculatedOrder: {
          lineItems: {
            nodes: {
              id: string;
              quantity: number;
              variant?: { legacyResourceId?: string | null } | null;
              originalUnitPriceSet?: { shopMoney?: { amount?: string } | null } | null;
            }[];
          };
        } | null;
        userErrors: { message: string }[];
      };
    }>(
      `mutation($id:ID!,$v:ID!,$q:Int!){
         orderEditAddVariant(id:$id,variantId:$v,quantity:$q,allowDuplicates:true){
           calculatedOrder{ lineItems(first:100){ nodes{
             id quantity variant{ legacyResourceId }
             originalUnitPriceSet{ shopMoney{ amount } } } } }
           userErrors{ message } } }`,
      { id: calcId, v: `gid://shopify/ProductVariant/${svid}`, q: qty }
    );
    if (r.orderEditAddVariant.userErrors?.length) {
      fail("إضافة منتج", r.orderEditAddVariant.userErrors);
    }
    // البند الجديد هو اللي لسه مشوفناهوش
    const fresh = (r.orderEditAddVariant.calculatedOrder?.lineItems?.nodes ?? []).find(
      (n) =>
        String(n.variant?.legacyResourceId ?? "") === svid &&
        !known.has(n.id) &&
        Number(n.quantity) > 0
    );
    if (!fresh) return null;
    known.add(fresh.id);
    return {
      id: fresh.id,
      base: Number(fresh.originalUnitPriceSet?.shopMoney?.amount ?? 0),
    };
  };

  for (const { svid, qty } of plan.onlyQty) {
    const line = byVar.get(svid);
    if (line) await setQuantity(line.lineId, qty);
  }

  for (const svid of plan.toRemove) {
    const line = byVar.get(svid);
    if (line) await setQuantity(line.lineId, 0);
  }

  for (const { svid, target, base } of plan.priceFix) {
    const line = byVar.get(svid);
    if (!line) continue;
    // **الترتيب ده هو اللي بيمنع تراكم الخصم** — القديم يتشال الأول
    for (const appId of line.ourDiscounts) await removeDiscount(appId);
    if (target < base - 0.009) {
      await addDiscount(line.lineId, discountPercent(base, target));
    }
  }

  for (const { svid, qty, price } of plan.toAdd) {
    const fresh = await addVariant(svid, qty);
    if (fresh && price < fresh.base - 0.009) {
      await addDiscount(fresh.id, discountPercent(fresh.base, price));
    }
  }

  const commit = await call<{
    orderEditCommit: { userErrors: { message: string }[] };
  }>(
    `mutation($id:ID!){
       orderEditCommit(id:$id,notifyCustomer:false,staffNote:"تعديل من Minis System"){
         userErrors{ message } } }`,
    { id: calcId }
  );
  if (commit.orderEditCommit.userErrors?.length) {
    fail("تثبيت التعديل", commit.orderEditCommit.userErrors);
  }
}
