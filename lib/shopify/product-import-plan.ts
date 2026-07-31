// ==========================================================================
// جلب المنتجات من شوبيفاي — القرار: إيه الجديد وإيه الناقص
// --------------------------------------------------------------------------
// **شوبيفاي مافيهاش تكلفة.** فيها سعر البيع بس. يعني أي منتج بييجي مننا أو
// منها بيقع بتكلفة صفر، والربح بيبان أكبر من الحقيقة لحد ما حد يملا التكلفة
// بإيده. ده مش عيب في الجلب — ده طبيعة شوبيفاي، فالشاشة لازم تقول للعميل
// بالبلدي: «دول محتاجين تكلفة».
//
// وعشان كده الجلب بيرجّع حاجتين: اللي هيتضاف، **واللي ناقصه تكلفة بعد ما
// يتضاف**. من غير التانية العميل الجديد هيفتكر إنه خلص وهو لسه مابدأش.
//
// **الملف ده صافي** — مافيش شبكة ولا قاعدة بيانات ولا أي استيراد.
// ==========================================================================

export type ShopifyVariantIn = {
  variantId: string;
  title: string | null;
  sku: string | null;
  price: number;
};

export type ShopifyProductIn = {
  productId: string;
  title: string;
  variants: ShopifyVariantIn[];
};

export type OurProductIn = {
  id: string;
  shopifyProductId: string | null;
  name: string | null;
};

export type OurVariantIn = {
  id: string;
  productId: string;
  shopifyVariantId: string | null;
  name: string | null;
  salePrice: number;
  costPrice: number;
};

export type ImportPlan = {
  /** منتجات عند شوبيفاي ومش عندنا خالص */
  newProducts: ShopifyProductIn[];
  /** شكل جديد لمنتج موجود عندنا (لون أو مقاس اتضاف عندهم) */
  newVariants: {
    ourProductId: string;
    productTitle: string;
    variant: ShopifyVariantIn;
  }[];
  /** سعر البيع اتغيّر عندهم */
  priceChanged: {
    ourVariantId: string;
    name: string;
    ours: number;
    shopify: number;
  }[];
  /** موجود عندنا وتكلفته صفر — الربح بيكدب لحد ما تتملا */
  needsCost: { ourVariantId: string; name: string; salePrice: number }[];
  /** عندنا ومش عند شوبيفاي — بنقول بس، مابنمسحش */
  onlyHere: { ourVariantId: string; name: string }[];
  /** أشكال هتتضاف وتكلفتها هتبقى صفر */
  newNeedingCost: number;
};

const label = (productTitle: string, variantTitle: string | null) => {
  const v = String(variantTitle ?? "").trim();
  // شوبيفاي بتسمّي الشكل الوحيد "Default Title" — مالهاش لازمة في الاسم
  if (!v || v.toLowerCase() === "default title") return productTitle;
  return `${productTitle} — ${v}`;
};

/** فرق أقل من قرش مش فرق */
const SAME_PRICE = 0.01;

export function planProductImport(
  shopify: ShopifyProductIn[],
  ourProducts: OurProductIn[],
  ourVariants: OurVariantIn[]
): ImportPlan {
  const plan: ImportPlan = {
    newProducts: [],
    newVariants: [],
    priceChanged: [],
    needsCost: [],
    onlyHere: [],
    newNeedingCost: 0,
  };

  const productByShopifyId = new Map<string, OurProductIn>();
  for (const p of ourProducts) {
    if (p.shopifyProductId) productByShopifyId.set(String(p.shopifyProductId), p);
  }

  const variantByShopifyId = new Map<string, OurVariantIn>();
  const ourProductName = new Map<string, string>();
  for (const p of ourProducts) ourProductName.set(p.id, p.name ?? "");
  for (const v of ourVariants) {
    if (v.shopifyVariantId) variantByShopifyId.set(String(v.shopifyVariantId), v);
  }

  const seenVariantIds = new Set<string>();

  for (const sp of shopify) {
    const ours = productByShopifyId.get(String(sp.productId));

    if (!ours) {
      plan.newProducts.push(sp);
      plan.newNeedingCost += sp.variants.length;
      for (const sv of sp.variants) seenVariantIds.add(String(sv.variantId));
      continue;
    }

    for (const sv of sp.variants) {
      const key = String(sv.variantId);
      seenVariantIds.add(key);
      const ourVariant = variantByShopifyId.get(key);

      if (!ourVariant) {
        plan.newVariants.push({
          ourProductId: ours.id,
          productTitle: sp.title,
          variant: sv,
        });
        plan.newNeedingCost++;
        continue;
      }

      if (Math.abs(Number(ourVariant.salePrice) - Number(sv.price)) >= SAME_PRICE) {
        plan.priceChanged.push({
          ourVariantId: ourVariant.id,
          name: label(sp.title, sv.title),
          ours: Number(ourVariant.salePrice),
          shopify: Number(sv.price),
        });
      }
    }
  }

  // الناقص: أي شكل عندنا تكلفته صفر — سواء جاي من شوبيفاي أو اتكتب بإيد
  for (const v of ourVariants) {
    const name = label(ourProductName.get(v.productId) ?? "", v.name);
    if (!(Number(v.costPrice) > 0)) {
      plan.needsCost.push({
        ourVariantId: v.id,
        name,
        salePrice: Number(v.salePrice),
      });
    }
    if (v.shopifyVariantId && !seenVariantIds.has(String(v.shopifyVariantId))) {
      plan.onlyHere.push({ ourVariantId: v.id, name });
    }
  }

  return plan;
}

/** فيه حاجة تتعمل أصلًا؟ */
export function importChangeCount(plan: ImportPlan): number {
  return plan.newProducts.length + plan.newVariants.length;
}
