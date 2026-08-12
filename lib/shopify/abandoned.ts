// ==========================================================================
// السلات المتروكة — عميل وصل للدفع وساب
// --------------------------------------------------------------------------
// شوبيفاي بتحتفظ بالـcheckout اللي مخلصش ومعاه التليفون والإيميل. مينو
// بتجيب الأوردرات المكتملة بس، فدي فلوس واقفة على بُعد مكالمة ومحدش شايفها.
//
// **الصلاحية `read_orders` وبس** — التطبيق واخدها خلاص، فمفيش نسخة جديدة
// ولا مراجعة تانية من شوبيفاي.
//
// ⚠️ **بس من غير حقل `customer`.** المستندات بتقول إن الاستعلام محتاج
// `read_orders`، والمتجر الحقيقي رفض أول محاولة:
//
//   Access denied for customer field. Required access: read_customers
//
// فالاسم والتليفون بيتقروا من **عنوان الفوترة** بدل كارت العميل. الفرق
// عمليًا صغير: من ٣٣ سلة في مينيز، ٢٢ فيهم تليفون كده.
//
// ⚠️ **السلة مش أوردر.** مابتتحطش في جدول الأوردرات ولا بتدخل في أي رقم
// مبيعات — لسه مفيش بيع حصل. لو دخلت، المبيعات هتكدب والأرباح معاها.
// ==========================================================================

import { shopifyGraphQL } from "./client";

const PAGE_SIZE = 50;
const MAX_PAGES = 20;

const QUERY = `query($cursor: String, $size: Int!) {
  abandonedCheckouts(first: $size, after: $cursor, sortKey: CREATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      abandonedCheckoutUrl
      createdAt
      totalPriceSet { shopMoney { amount } }
      billingAddress { name phone city province }
      lineItems(first: 50) {
        nodes { title quantity variant { legacyResourceId } }
      }
    }
  }
}`;

type RawCart = {
  id?: string | null;
  abandonedCheckoutUrl?: string | null;
  createdAt?: string | null;
  totalPriceSet?: { shopMoney?: { amount?: string } } | null;
  billingAddress?: {
    name?: string | null;
    phone?: string | null;
    city?: string | null;
    province?: string | null;
  } | null;
  lineItems?: {
    nodes?: {
      title?: string | null;
      quantity?: number | null;
      variant?: { legacyResourceId?: string | null } | null;
    }[];
  } | null;
};

export type AbandonedCart = {
  id: string;
  url: string | null;
  createdAt: string | null;
  total: number;
  customerName: string | null;
  phone: string | null;
  city: string | null;
  items: { title: string; quantity: number; variantId: string | null }[];
};

function toCart(raw: RawCart): AbandonedCart {
  return {
    id: String(raw.id ?? ""),
    url: raw.abandonedCheckoutUrl ?? null,
    createdAt: raw.createdAt ?? null,
    total: Number(raw.totalPriceSet?.shopMoney?.amount ?? 0),
    customerName: raw.billingAddress?.name?.trim() || null,
    // التليفون هو اللي بيخلّي السلة قابلة للمتابعة أصلاً
    phone: raw.billingAddress?.phone?.trim() || null,
    city: raw.billingAddress?.city?.trim() || null,
    items: (raw.lineItems?.nodes ?? []).map((i) => ({
      title: String(i.title ?? "منتج"),
      quantity: Number(i.quantity ?? 0),
      variantId: i.variant?.legacyResourceId ?? null,
    })),
  };
}

export async function fetchAbandonedCarts(
  shop: string,
  token: string,
  fetchImpl: typeof fetch = fetch
): Promise<AbandonedCart[]> {
  const out: AbandonedCart[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data: {
      abandonedCheckouts?: {
        pageInfo?: { hasNextPage?: boolean; endCursor?: string };
        nodes?: RawCart[];
      };
    } = await shopifyGraphQL(
      shop,
      token,
      QUERY,
      { cursor, size: PAGE_SIZE },
      fetchImpl
    );

    for (const n of data.abandonedCheckouts?.nodes ?? []) out.push(toCart(n));

    if (!data.abandonedCheckouts?.pageInfo?.hasNextPage) break;
    cursor = data.abandonedCheckouts.pageInfo.endCursor ?? null;
    if (!cursor) break;
  }

  return out;
}

export type CartTriage = {
  /** فيها تليفون وقيمتها تستاهل مكالمة */
  callable: AbandonedCart[];
  /** مفيش تليفون — مفيش طريقة نلحقها */
  unreachable: AbandonedCart[];
  /** العميل ده اشترى بعد كده، فالسلة دي خلصت لوحدها */
  recovered: AbandonedCart[];
  callableValue: number;
};

/** بيشيل المسافات والرموز ويوحّد أول الرقم عشان المقارنة تظبط */
export function normalizePhone(phone: string | null | undefined): string {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (!d) return "";
  // ٢٠١٠… و٠١٠… و١٠… كلهم نفس الرقم
  const noCountry = d.startsWith("20") ? d.slice(2) : d;
  return noCountry.replace(/^0+/, "");
}

/**
 * بيقسّم السلات لللي يستاهل مكالمة واللي لأ.
 *
 * **السلة اللي صاحبها اشترى بعدها بتتشال** — لو اتصلنا بيه هنبان إننا
 * مش عارفين إنه اشترى، وده أسوأ من إننا ماتصلناش.
 *
 * ودي بتتقارن **بالتليفون** مش بالإيميل: في مصر التليفون هو المُعرّف —
 * كتير بيسيبوا الإيميل فاضي أو بيكتبوا أي حاجة.
 */
export function triageCarts(
  carts: AbandonedCart[],
  /** تليفونات العملاء اللي عندهم أوردر فعلاً */
  buyerPhones: (string | null)[],
  /** أقل قيمة تستاهل مكالمة */
  minValue = 0
): CartTriage {
  const bought = new Set(buyerPhones.map(normalizePhone).filter(Boolean));

  const callable: AbandonedCart[] = [];
  const unreachable: AbandonedCart[] = [];
  const recovered: AbandonedCart[] = [];

  for (const c of carts) {
    const p = normalizePhone(c.phone);
    if (p && bought.has(p)) {
      recovered.push(c);
      continue;
    }
    if (!p) {
      unreachable.push(c);
      continue;
    }
    if (c.total < minValue) continue;
    callable.push(c);
  }

  callable.sort((a, b) => b.total - a.total);

  return {
    callable,
    unreachable,
    recovered,
    callableValue: Math.round(callable.reduce((s, c) => s + c.total, 0) * 100) / 100,
  };
}
