// ==========================================================================
// الاتصال بشوبيفاي — الملف الوحيد اللي يعرف عنوانها وشكل ردودها
// --------------------------------------------------------------------------
// شوبيفاي مابتديش توكن دايم للتطبيقات المخصّصة — بتدي توكن عمره ٢٤ ساعة
// مقابل بيانات التطبيق (client credentials)، فبنطلعه في كل تشغيل.
//
// والمفاتيح بتتبعت كمُدخلات مش بتتقرا من الإعدادات، عشان كل بيزنس يستخدم
// تطبيقه هو — نفس أسلوب `lib/bosta/client.ts` بالظبط.
// ==========================================================================

const TIMEOUT_MS = 20000;
/**
 * إصدار الـAPI — شوبيفاي بتطلب واحد صريح في كل نداء.
 * ده نفس إصدار الدالة القديمة (`shopify-order-push`) بقصد، عشان المقارنة
 * بينهم تبقى على نفس الأرضية ومايبقاش فيه متغيّر تاني.
 */
export const SHOPIFY_API_VERSION = "2026-07";

export class ShopifyError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ShopifyError";
  }
}

export type ShopifyCreds = {
  shop: string;
  clientId: string;
  clientSecret: string;
};

/**
 * بينضّف دومين المتجر.
 * الناس بتلزقه بأشكال كتير: بـ https، بشرطة مالة في الآخر، أو الدومين
 * المخصّص. اللي شوبيفاي بتفهمه هو `xxx.myshopify.com` بس.
 */
export function normalizeShop(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\s+/g, "");
}

/** الدومين شكله صح؟ لو لأ بنقول قبل ما نضيّع نداء على الفاضي */
export function isValidShop(raw: string | null | undefined): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(normalizeShop(raw));
}

/** بيطلع توكن مؤقت من بيانات التطبيق */
export async function fetchAccessToken(
  creds: ShopifyCreds,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const shop = normalizeShop(creds.shop);
  if (!isValidShop(shop)) {
    throw new ShopifyError(
      "دومين المتجر مش مظبوط — لازم يبقى بالشكل ده: yourshop.myshopify.com",
      400
    );
  }
  if (!creds.clientId || !creds.clientSecret) {
    throw new ShopifyError("بيانات تطبيق شوبيفاي ناقصة", 400);
  }

  const res = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.access_token) {
    // شوبيفاي بترجّع ٤٠١ لو المفاتيح غلط، و٤٠٤ لو الدومين مش موجود
    const detail =
      json?.error_description ??
      json?.error ??
      (res.status === 404
        ? "المتجر ده مش موجود عند شوبيفاي"
        : `شوبيفاي ردّت بكود ${res.status}`);
    throw new ShopifyError(String(detail), res.status);
  }

  return String(json.access_token);
}

/** بينادي GraphQL بالتوكن */
export async function shopifyGraphQL<T>(
  shop: string,
  token: string,
  query: string,
  variables?: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
): Promise<T> {
  const res = await fetchImpl(
    `https://${normalizeShop(shop)}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  );

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ShopifyError(
      String(json?.errors ?? `شوبيفاي ردّت بكود ${res.status}`),
      res.status
    );
  }
  // GraphQL بترجّع ٢٠٠ مع أخطاء جوّه الجسم — لازم نفحصها
  if (json?.errors?.length) {
    const first = json.errors[0];
    throw new ShopifyError(String(first?.message ?? "شوبيفاي رفضت الطلب"), 400);
  }

  return json?.data as T;
}

export type ShopInfo = {
  name: string;
  domain: string;
  currency: string;
};

/**
 * زرار "جرّب الاتصال": بيطلع توكن وبيقرا اسم المتجر.
 * **بيقرا حاجة حقيقية بقصد** — الدرس اللي اتعلمناه من بوسطة إن فيه مسارات
 * بترد ٢٠٠ من غير ما تتحقق من المفتاح، فاختبار الاتصال لازم يجيب داتا فعلية.
 */
export async function testShopifyConnection(
  creds: ShopifyCreds,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: true; shop: ShopInfo } | { ok: false; error: string }> {
  try {
    const token = await fetchAccessToken(creds, fetchImpl);
    const data = await shopifyGraphQL<{
      shop: { name: string; myshopifyDomain: string; currencyCode: string };
    }>(
      creds.shop,
      token,
      `{ shop { name myshopifyDomain currencyCode } }`,
      undefined,
      fetchImpl
    );

    if (!data?.shop?.name) {
      return { ok: false, error: "الاتصال نجح بس معرفناش نقرا بيانات المتجر" };
    }

    return {
      ok: true,
      shop: {
        name: data.shop.name,
        domain: data.shop.myshopifyDomain,
        currency: data.shop.currencyCode,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "معرفناش نوصل لشوبيفاي",
    };
  }
}
