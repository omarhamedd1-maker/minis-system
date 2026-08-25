// ==========================================================================
// توكن شوبيفاي — يتطلب لما يلزم، مايتخزّنش للأبد
// --------------------------------------------------------------------------
// ⚠️⚠️ **توكن `client_credentials` بيموت بعد ٢٤ ساعة.** شوبيفاي بترجّعه
// ومعاه `expires_in: 86399` — والسيستم كان بيخزّنه في
// `tenant_credentials.shopify_access_token` ويفضل يستخدمه للأبد.
//
// النتيجة اللي عمر عاشها مرتين في يومين:
//
//   • يربط المتجر → توكن جديد يتخزّن → الأوردرات بتنزل
//   • يعدّي ٢٤ ساعة → التوكن يموت → **الاستيراد بيترفض في صمت**
//   • يربط تاني → تشتغل يوم → تقف تاني
//
// اتأكد بالتجربة على متجر ٢ سِك (٢٦ أغسطس ٢٠٢٦): التوكن المتخزّن رجّع
// **٤٠١**، وتوكن جديد من نفس المفاتيح رجّع **٢٠٠** واسم المتجر.
//
// **الحل**: التوكن بيتطلب من مفاتيح التطبيق وقت الاستخدام. والمتخزّن بقى
// **احتياطي** للمتاجر اللي حاطة توكن دائم بإيدها (تطبيق جوّه المتجر).
//
// ⚠️ **والتوكن بيتحفظ في الذاكرة لمدة قصيرة** — كل نداء بيطلب توكن جديد
// معناه طلب زيادة على شوبيفاي في كل لفة، والتخزين لساعة بيخلّي اللفة
// الواحدة تطلبه مرة.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAccessToken, ShopifyError } from "./client";
import { readShopifyApp } from "./app";
import { loadTenantCredentials, type TenantCredentials } from "../tenant-settings";

/**
 * التوكن بيعيش ٢٤ ساعة عند شوبيفاي — بنحتفظ بيه **ساعة بس**.
 *
 * ⚠️ **الهامش كبير بقصد**: اللفة اللي بتبدأ قبل الانتهاء بدقيقة كانت
 * هتستخدم توكن بيموت وهي شغّالة.
 */
const CACHE_MS = 60 * 60 * 1000;

const cache = new Map<string, { token: string; until: number }>();

/** للاختبارات — بيفضّي اللي محفوظ */
export function clearTokenCache(): void {
  cache.clear();
}

export type ResolvedToken =
  | { ok: true; shop: string; token: string; source: "fresh" | "stored" }
  | { ok: false; error: string };

/**
 * توكن شغّال للبيزنس ده.
 *
 * ⚠️⚠️ **الترتيب مقصود**: لو فيه مفاتيح تطبيق، بنطلب توكن جديد **حتى لو
 * فيه واحد متخزّن** — لأن المتخزّن هو بالظبط اللي بيموت. المتخزّن
 * بيتستخدم بس لما مافيش مفاتيح، يعني توكن دائم متحطّ بالإيد.
 */
export async function resolveShopifyToken(
  db: SupabaseClient,
  tenantId: string,
  creds?: TenantCredentials,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now()
): Promise<ResolvedToken> {
  const c = creds ?? (await loadTenantCredentials(db, tenantId));
  const shop = c.shopifyShop;

  if (!shop) return { ok: false, error: "البيزنس ده لسه مربطش متجر شوبيفاي" };

  const hit = cache.get(tenantId);
  if (hit && hit.until > now) {
    return { ok: true, shop, token: hit.token, source: "fresh" };
  }

  // مفاتيح البيزنس الأول، وبعدين مفاتيح تطبيق المنصة
  let clientId = c.shopifyClientId;
  let clientSecret = c.shopifyClientSecret;
  if (!clientId || !clientSecret) {
    const app = await readShopifyApp(db);
    if (app) {
      clientId = app.clientId;
      clientSecret = app.clientSecret;
    }
  }

  if (clientId && clientSecret) {
    try {
      const token = await fetchAccessToken(
        { shop, clientId, clientSecret },
        fetchImpl
      );
      cache.set(tenantId, { token, until: now + CACHE_MS });
      return { ok: true, shop, token, source: "fresh" };
    } catch (e) {
      // ⚠️ **المتخزّن آخر أمل مش أول اختيار** — لو التطبيق اتشال من المتجر،
      // الطلب بيفشل والمتخزّن غالبًا ميت هو كمان، بس محاولة أرخص من صمت.
      if (c.shopifyAccessToken) {
        return { ok: true, shop, token: c.shopifyAccessToken, source: "stored" };
      }
      return {
        ok: false,
        error:
          e instanceof ShopifyError || e instanceof Error
            ? e.message
            : "معرفناش نطلّع توكن من شوبيفاي",
      };
    }
  }

  // مافيش مفاتيح تطبيق — يبقى التوكن المتخزّن دائم ومتحطّ بالإيد
  if (c.shopifyAccessToken) {
    return { ok: true, shop, token: c.shopifyAccessToken, source: "stored" };
  }

  return { ok: false, error: "البيزنس ده لسه مربطش متجر شوبيفاي" };
}
