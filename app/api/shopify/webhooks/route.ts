// ==========================================================================
// مسار ويب هوكس شوبيفاي
// --------------------------------------------------------------------------
// شوبيفاي بتنادي المسار ده. القرار كله في `lib/shopify/webhooks.ts` (دوال
// صافية)، وده بيوصّله بقاعدة البيانات.
//
// ⚠️ **الجسم بيتقرا خام (`text()`) مش JSON** — التوقيع محسوب على النص
// بالظبط، وأي تفكيك وإعادة بناء بيكسره.
//
// **والرد لازم يبقى سريع.** شوبيفاي بتستنى ٥ ثواني وبعدين بتعتبره فشل
// وتعيد المحاولة، فأي شغل تقيل هنا بيتحوّل لطوفان نداءات.
// ==========================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readShopifyApp } from "@/lib/shopify/app";
import { decideWebhook } from "@/lib/shopify/webhooks";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rawBody = await req.text();

  const db = createAdminClient();
  const app = await readShopifyApp(db);
  if (!app) {
    // التطبيق مش مظبّط عندنا — مانقدرش نتحقق من التوقيع أصلًا
    return NextResponse.json({ error: "التطبيق مش مظبّط" }, { status: 401 });
  }

  const decision = decideWebhook(
    {
      topic: req.headers.get("x-shopify-topic"),
      shop: req.headers.get("x-shopify-shop-domain"),
      signature: req.headers.get("x-shopify-hmac-sha256"),
      rawBody,
    },
    app.clientSecret
  );

  if (!decision.ok) {
    return NextResponse.json({ ok: decision.status === 200 }, {
      status: decision.status,
    });
  }

  const { topic, shop } = decision;

  try {
    // البيزنس صاحب المتجر ده
    const { data } = await db
      .from("tenant_credentials")
      .select("tenant_id")
      .eq("shopify_shop", shop)
      .maybeSingle();
    const tenantId = (data as { tenant_id: string } | null)?.tenant_id ?? null;

    if (topic === "app/uninstalled" || topic === "shop/redact") {
      // **بنمسح مفاتيح الربط بس — مش داتا البيزنس.**
      //
      // `app/uninstalled` معناها التوكن مات عند شوبيفاي، فلو سبناه
      // المزامنة هتفضل تناديه للأبد وتفشل.
      //
      // و`shop/redact` معناها المتجر شال التطبيق و٤٨ ساعة عدّت. شوبيفاي
      // بتطلب مسح **بيانات المتجر اللي جاية منها**، والأوردرات والعملاء
      // عند العميل نفسه — مش بتاعتها. فمابنمسحش شغل بيزنس شغّال بناءً على
      // ويب هوك؛ ده قرار صاحبه بياخده من شاشة البيزنسات.
      if (tenantId) {
        await db
          .from("tenant_credentials")
          .update({
            shopify_access_token: null,
            shopify_shop: null,
            updated_at: new Date().toISOString(),
          })
          .eq("tenant_id", tenantId);
      }
    }

    // `customers/data_request` و`customers/redact`:
    //
    // **بنسجّلهم ومابنعملش حاجة تانية بقصد.** إحنا مابنخزّنش بيانات عميل
    // المتجر لحساب شوبيفاي — بنخزّنها لحساب صاحب المتجر عشان يشحن
    // ويتابع أوردراته. الطلب ده بيتعامل معاه صاحب المتجر من شاشة العملاء،
    // والمسح الأعمى هنا معناه أوردر يفضل من غير صاحب.
    await db.from("activity_log").insert({
      tenant_id: tenantId,
      actor_name: "شوبيفاي",
      action: `shopify.${topic.replace("/", ".")}`,
      summary: `طلب من شوبيفاي: ${topic} — متجر ${shop}`,
    });
  } catch {
    // **الرد بيفضل ٢٠٠ حتى لو الشغل الداخلي وقع.** غير كده شوبيفاي بتعيد
    // المحاولة على طول، والمشكلة مش عندها.
  }

  return NextResponse.json({ ok: true });
}
