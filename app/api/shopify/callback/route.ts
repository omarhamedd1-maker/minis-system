import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";
import { readShopifyApp } from "@/lib/shopify/app";
import { checkCallback } from "@/lib/shopify/oauth";

/** عمر التذكرة — لو الربط اتأخر أكتر من كده يبدأ من الأول */
const STATE_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * رجوع شوبيفاي بعد الموافقة.
 *
 * الترتيب هنا مقصود: **بنتحقق قبل ما نلمس أي حاجة.**
 *   ١. توقيع شوبيفاي (HMAC) — يثبت إن الرد منها فعلًا
 *   ٢. الـstate — يثبت إن الربط ده إحنا اللي بدأناه، ولأي بيزنس
 *   ٣. وبعدين بس نبدّل الكود بتوكن ونحفظه
 *
 * **مافيش تسجيل دخول مطلوب هنا** — شوبيفاي بترجّع المستخدم من عندها، وممكن
 * الجلسة تكون ضاعت. الأمان بييجي من التوقيع والـstate مش من الجلسة.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const params: Record<string, string> = {};
  searchParams.forEach((v, k) => (params[k] = v));

  const done = (msg: string, ok = false) =>
    redirect(`/settings?${ok ? "saved" : "error"}=` + encodeURIComponent(msg));

  const db = createAdminClient();
  const app = await readShopifyApp(db);
  if (!app) done("تطبيق شوبيفاي مش مظبّط");

  const checked = checkCallback(params, app!.clientSecret);
  if (!checked.ok) done(checked.error);
  const { shop, code, state } = checked as {
    ok: true;
    shop: string;
    code: string;
    state: string;
  };

  // الـstate: لازم يكون إحنا اللي عملناه، ولسه صالح، ومااتستخدمش قبل كده
  const { data: install } = await db
    .from("shopify_installs")
    .select("state, tenant_id, created_at, completed_at")
    .eq("state", state)
    .maybeSingle();

  if (!install) done("الربط ده مش معروف عندنا — ابدأ من الأول");
  if (install!.completed_at) done("الربط ده اتعمل قبل كده");
  if (
    Date.now() - new Date(install!.created_at).getTime() >
    STATE_MAX_AGE_MS
  ) {
    done("الربط اتأخر كتير — ابدأ من الأول");
  }

  // نبدّل الكود بتوكن
  let token = "";
  try {
    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: app!.clientId,
        client_secret: app!.clientSecret,
        code,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.access_token) {
      done(
        "شوبيفاي رفضت الربط: " +
          String(json?.error_description ?? json?.error ?? res.status)
      );
    }
    token = String(json.access_token);
  } catch (e) {
    done(e instanceof Error ? e.message : "معرفناش نوصل لشوبيفاي");
  }

  // **التاجر اللي جايّ من شوبيفاي مالوش بيزنس عندنا لسه.**
  //
  // مانقدرش نحفظ التوكن في `tenant_credentials` لأن مفيش بيزنس يتحفظ عليه.
  // فبنحطه مستنّي على التركيب نفسه، ونوديه يعمل بيزنسه — وأول ما يخلص
  // بيتسلّم التوكن (`claimPendingInstall`).
  if (!install!.tenant_id) {
    await db
      .from("shopify_installs")
      .update({
        completed_at: new Date().toISOString(),
        access_token: token,
        shop,
      })
      .eq("state", state);

    redirect(
      `/signup?install=${encodeURIComponent(state)}&shop=${encodeURIComponent(shop)}`
    );
  }

  const { error: saveError } = await db
    .from("tenant_credentials")
    .update({
      shopify_shop: shop,
      shopify_access_token: token,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", install!.tenant_id);

  if (saveError) done("معرفناش نحفظ الربط: " + saveError.message);

  await db
    .from("shopify_installs")
    .update({ completed_at: new Date().toISOString(), shop })
    .eq("state", state);

  await logActivity(null, "settings.shopify", `ربط متجر شوبيفاي ${shop}`);
  done(`تمام — اتربط متجر ${shop}`, true);
}
