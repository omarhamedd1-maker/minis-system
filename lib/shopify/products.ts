// ==========================================================================
// جلب المنتجات من شوبيفاي وإدخالها عندنا
// --------------------------------------------------------------------------
// القرار في `product-import-plan.ts` (صافي ومتختبر). الملف ده بيتكلم مع
// شوبيفاي وقاعدة البيانات بس.
//
// **بنضيف ومابنمسحش أبدًا.** المنتج اللي اتشال من شوبيفاي بيفضل عندنا —
// لأن ممكن يكون في أوردرات قديمة، ومسحه هيضيّع تكلفتها وتاريخها.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTenantCredentials } from "../tenant-settings";
import { ShopifyError, shopifyGraphQL } from "./client";
import {
  importChangeCount,
  planProductImport,
  type ImportPlan,
  type ShopifyProductIn,
} from "./product-import-plan";

export * from "./product-import-plan";

/** شوبيفاي بتحدّ الصفحة، فبنلف عليها بالمؤشر */
const PAGE_SIZE = 50;
const MAX_PAGES = 40;

const PRODUCTS_QUERY = `query($cursor: String, $size: Int!) {
  products(first: $size, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      legacyResourceId
      title
      featuredMedia { preview { image { url } } }
      variants(first: 100) {
        nodes { legacyResourceId title sku price }
      }
    }
  }
}`;

type RawProduct = {
  legacyResourceId?: string | null;
  title?: string | null;
  featuredMedia?: { preview?: { image?: { url?: string | null } | null } | null } | null;
  variants?: {
    nodes?: {
      legacyResourceId?: string | null;
      title?: string | null;
      sku?: string | null;
      price?: string | null;
    }[];
  } | null;
};

/** بيجيب كل المنتجات صفحة صفحة */
export async function fetchShopifyProducts(
  shop: string,
  token: string,
  fetchImpl?: typeof fetch
): Promise<ShopifyProductIn[]> {
  const out: ShopifyProductIn[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data: {
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: RawProduct[];
      };
    } = await shopifyGraphQL(
      shop,
      token,
      PRODUCTS_QUERY,
      { cursor, size: PAGE_SIZE },
      fetchImpl
    );

    for (const p of data.products?.nodes ?? []) {
      const productId = String(p.legacyResourceId ?? "");
      if (!productId) continue;
      out.push({
        productId,
        title: String(p.title ?? "").trim() || "منتج بدون اسم",
        imageUrl: p.featuredMedia?.preview?.image?.url ?? null,
        variants: (p.variants?.nodes ?? [])
          .filter((v) => v.legacyResourceId)
          .map((v) => ({
            variantId: String(v.legacyResourceId),
            title: v.title ?? null,
            sku: v.sku ?? null,
            price: Number(v.price ?? 0),
          })),
      });
    }

    if (!data.products?.pageInfo?.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }

  return out;
}

export type ImportResult =
  | {
      ok: true;
      dry: boolean;
      plan: ImportPlan;
      added?: { products: number; variants: number };
      /** اللي اتعمل فعلًا — بيتسجّل في `import_runs` عشان التراجع */
      undo?: { products: string[]; variants: string[] };
    }
  | { ok: false; error: string };

/**
 * بيجيب منتجات شوبيفاي ويقارنها باللي عندنا.
 * `dry` بيعرض الخطة من غير ما يكتب أي حاجة.
 */
export async function runProductImport(opts: {
  db: SupabaseClient;
  tenantId: string;
  dry?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<ImportResult> {
  const { db, tenantId, dry = false, fetchImpl } = opts;

  const creds = await loadTenantCredentials(db, tenantId);
  if (!creds.shopifyShop || !creds.shopifyAccessToken) {
    return { ok: false, error: "البيزنس ده لسه مربطش متجر شوبيفاي" };
  }

  let shopifyProducts: ShopifyProductIn[];
  try {
    shopifyProducts = await fetchShopifyProducts(
      creds.shopifyShop,
      creds.shopifyAccessToken,
      fetchImpl
    );
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof ShopifyError
          ? e.message
          : e instanceof Error
            ? e.message
            : "معرفناش نوصل لشوبيفاي",
    };
  }

  const [{ data: ourProducts }, { data: ourVariants }] = await Promise.all([
    // ⚠️ **الفلتر لازم**: من غيره المقارنة بتتم على منتجات كل البيزنسات،
    // فمنتج العميل الجديد بيتخطّى «لأنه موجود» وهو موجود عند حد تاني.
    db
      .from("products")
      .select("id, shopify_product_id, name_ar, name")
      .eq("tenant_id", tenantId)
      .overrideTypes<
        {
          id: string;
          shopify_product_id: string | null;
          name_ar: string | null;
          name: string | null;
        }[]
      >(),
    db
      .from("product_variants")
      .select("id, product_id, shopify_variant_id, variant_name, sale_price, cost_price")
      .eq("tenant_id", tenantId)
      .overrideTypes<
        {
          id: string;
          product_id: string;
          shopify_variant_id: string | null;
          variant_name: string | null;
          sale_price: number;
          cost_price: number;
        }[]
      >(),
  ]);

  const plan = planProductImport(
    shopifyProducts,
    (ourProducts ?? []).map((p) => ({
      id: p.id,
      shopifyProductId: p.shopify_product_id,
      // الاسم العربي أولى لو موجود — هو اللي العميل بيشوفه
      name: p.name_ar || p.name || "",
    })),
    (ourVariants ?? []).map((v) => ({
      id: v.id,
      productId: v.product_id,
      shopifyVariantId: v.shopify_variant_id,
      name: v.variant_name,
      salePrice: Number(v.sale_price ?? 0),
      costPrice: Number(v.cost_price ?? 0),
    }))
  );

  if (dry || importChangeCount(plan) === 0) {
    return { ok: true, dry, plan };
  }

  let addedProducts = 0;
  let addedVariants = 0;
  // بنسجّل اللي بيتعمل عشان التراجع يبقى ممكن
  const madeProducts: string[] = [];
  const madeVariants: string[] = [];

  // منتجات جديدة: المنتج الأول وبعدين أشكاله
  for (const p of plan.newProducts) {
    const { data: created, error } = await db
      .from("products")
      // ⚠️ **رقم البيزنس مش زيادة** — `db` بمفتاح الأدمن، والقيمة
      // الافتراضية في الداتابيز بترجّع **مينيز** لما مفيش مستخدم داخل.
      .insert({
        tenant_id: tenantId,
        shopify_product_id: p.productId,
        name: p.title,
        image_url: p.imageUrl ?? null,
      })
      .select("id")
      .maybeSingle();

    if (error || !created) continue;
    addedProducts++;
    madeProducts.push(created.id);

    for (const v of p.variants) {
      const { error: vErr } = await db.from("product_variants").insert({
        tenant_id: tenantId,
        product_id: created.id,
        shopify_variant_id: v.variantId,
        variant_name: v.title,
        sku: v.sku,
        sale_price: v.price,
        // **التكلفة صفر بقصد** — شوبيفاي مافيهاش تكلفة، والعميل هو اللي يملاها
        cost_price: 0,
        quantity_on_hand: 0,
      });
      if (!vErr) addedVariants++;
    }
  }

  // أشكال جديدة لمنتجات موجودة — دي بتتسجّل لوحدها في التراجع، لأن منتجها
  // موجود من قبل ومينفعش يتمسح معاها
  for (const nv of plan.newVariants) {
    const { data: made, error } = await db
      .from("product_variants")
      .insert({
        tenant_id: tenantId,
        product_id: nv.ourProductId,
        shopify_variant_id: nv.variant.variantId,
        variant_name: nv.variant.title,
        sku: nv.variant.sku,
        sale_price: nv.variant.price,
        cost_price: 0,
        quantity_on_hand: 0,
      })
      .select("id")
      .maybeSingle();
    if (!error && made) {
      addedVariants++;
      madeVariants.push(made.id);
    }
  }

  return {
    ok: true,
    dry: false,
    plan,
    added: { products: addedProducts, variants: addedVariants },
    undo: { products: madeProducts, variants: madeVariants },
  };
}
