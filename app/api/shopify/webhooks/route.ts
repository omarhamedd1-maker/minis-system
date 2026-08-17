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

import { NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readShopifyApp } from "@/lib/shopify/app";
import { decideWebhook } from "@/lib/shopify/webhooks";
import { runOrderImport } from "@/lib/shopify/orders";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rawBody = await req.text();

  const db = createAdminClient();

  // ⚠️ **البيزنس بيتحدّد قبل التحقق، والتحقق بسرّه هو.**
  //
  // التطبيق العام سرّه واحد، لكن البيزنس اللي مركّب **تطبيق جوّه متجره**
  // ويب هوكه موقّع بسر التطبيق ده هو — فالتحقق بسر التطبيق العام بيفشل
  // ويرجّع ٤٠١ على ويب هوك سليم.
  //
  // ومفيش خطر في إننا نقرا الدومين قبل التحقق: الدومين بيختار **المفتاح**
  // بس، والتوقيع لسه هو اللي بيفتح الباب. مفتاح غلط = توقيع مش مطابق = رفض.
  const shopHeader = String(req.headers.get("x-shopify-shop-domain") ?? "")
    .trim()
    .toLowerCase();

  const { data: credRow } = await db
    .from("tenant_credentials")
    .select("tenant_id, shopify_webhook_secret")
    .eq("shopify_shop", shopHeader)
    .maybeSingle();
  const cred = credRow as
    | { tenant_id: string; shopify_webhook_secret: string | null }
    | null;

  const app = await readShopifyApp(db);
  const secret = cred?.shopify_webhook_secret || app?.clientSecret || "";
  if (!secret) {
    // مفيش سر لا للبيزنس ولا للتطبيق — مانقدرش نتحقق أصلًا
    return NextResponse.json({ error: "التطبيق مش مظبّط" }, { status: 401 });
  }

  const decision = decideWebhook(
    {
      topic: req.headers.get("x-shopify-topic"),
      shop: req.headers.get("x-shopify-shop-domain"),
      signature: req.headers.get("x-shopify-hmac-sha256"),
      rawBody,
    },
    secret
  );

  const topicHeader = String(req.headers.get("x-shopify-topic") ?? "")
    .trim()
    .toLowerCase();

  // ⚠️⚠️ **الأوردر الجديد جرس مش رسالة.**
  //
  // إحنا **مابناخدش ولا حرف من جسم الطلب ده**. كل اللي بيعمله إنه يقول
  // «فيه حاجة جديدة»، وبعدين إحنا بنروح نجيب الأوردرات من شوبيفاي
  // **بتوكننا إحنا**. يعني حد يزوّر الطلب أقصى اللي يعمله إنه يخلّينا
  // نسأل شوبيفاي سؤال — مايقدرش يحقن أوردر ولا يغيّر رقم.
  //
  // وده بيحل مشكلة حقيقية: ويب هوك التطبيق اللي جوّه المتجر موقّع بسر
  // التطبيق ده، وإحنا مامعناش السر ده. لو طلبنا توقيع مطابق، الأوردر
  // مايوصلش وقت ما يحصل ونستنى اللفة ربع ساعة.
  //
  // **والموضوعات الإجبارية بتفضل بتطلب توقيع صح وبترجّع ٤٠١** — دي اللي
  // شوبيفاي بتختبرها في المراجعة، ودي اللي فيها داتا بنعمل عليها حاجة.
  if (topicHeader === "orders/create") {
    const tid = cred?.tenant_id ?? null;
    if (tid) {
      after(async () => {
        try {
          await runOrderImport({ db: createAdminClient(), tenantId: tid });
        } catch {
          // اللفة الدورية هتلقطه — الويب هوك مش الطريق الوحيد
        }
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (!decision.ok) {
    return NextResponse.json({ ok: decision.status === 200 }, {
      status: decision.status,
    });
  }

  const { topic, shop } = decision;
  const tenantId = cred?.tenant_id ?? null;

  // ===== الأوردر الجديد =====
  //
  // **الرد بيروح فورًا والاستيراد بيكمّل في الخلفية.** شوبيفاي بتستنى ٥
  // ثواني وبعدين بتعتبره فشل وتعيد المحاولة — وجلب الأوردرات أطول من كده.
  //
  // وبننادي **نفس دالة الاستيراد الدورية** مش مسار جديد: هي بتمنع التكرار
  // برقم الأوردر (`lib/shopify/no-duplicate-orders.test.ts`)، فالويب هوك
  // واللفة يشتغلوا مع بعض من غير أوردر مزدوج.
  if (topic === "orders/create") {
    if (tenantId) {
      after(async () => {
        try {
          await runOrderImport({ db: createAdminClient(), tenantId });
        } catch {
          // اللفة الدورية هتلقطه بعد ربع ساعة — الويب هوك مش الطريق الوحيد
        }
      });
    }
    return NextResponse.json({ ok: true });
  }

  try {

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
