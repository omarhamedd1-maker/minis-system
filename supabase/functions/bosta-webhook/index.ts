// ==========================================================================
// ويب هوك بوسطة — **جرس، مش رسالة**
// --------------------------------------------------------------------------
// بوسطة بتنده هنا أول ما حالة شحنة تتغيّر. الدالة **مابتقراش الحالة من جسم
// الطلب ومابتكتبش في الداتابيز** — بتحوّل النداء لمسارنا
// `app/api/bosta/webhook`، وهو اللي بيجيب الحالة من بوسطة بنفسه ويترجمها.
//
// ⚠️⚠️ **ليه الدالة اتفضّت من شغلها:**
//
// ١) **كانت بتلاقي الأوردر برقمه** — `.eq("order_number", cleanRef)` من غير
//    أي فلتر بيزنس. وأرقام الأوردرات بتتقاطع بين البيزنسات فعلًا: مينيز
//    و٢ سِك بينهم **١٤٠ رقم مشترك** (اتفحص ١٧ أغسطس ٢٠٢٦). يعني أول ما
//    بيزنس تاني يربط بوسطة، شحنة عنده رقمها ١٣٥٥ كانت هتغيّر حالة أوردر
//    ١٣٥٥ عند عمر — من غير أي رسالة خطأ. المسار بيلاقيه برقم التتبع،
//    وده فريد، فالبيزنس بيطلع من الصف نفسه.
//
// ٢) **الترجمة اللي كانت هنا كانت بتغلط**: أي حالة فيها `return` بتبقى
//    «رجعت» حتى وهي لسه في الطريق، و«Out For Delivery» بتبقى «مشحون».
//    والأهم إن **نوع الشحنة بيقلب معنى الكود**: كود ٤١ على شحنة رجوع معناه
//    راجعة ليك، وعلى شحنة إرسال معناه رايحة للعميل. الترجمة الصح في
//    `lib/bosta/order-status.ts` وماينفعش تتنسخ هنا وتفضل مظبوطة.
//
// **ولو النداء ماوصلش؟** مابنكتبش حاجة. المزامنة الدورية (كل ربع ساعة)
// بتلقط التغيير. تأخير ربع ساعة أحسن من حالة غلط.
// ==========================================================================

const WEBHOOK_KEY = Deno.env.get("BOSTA_WEBHOOK_KEY") ?? "";
const APP = "https://minis-system.vercel.app/api/bosta/webhook";

/** بيبعت لمسارنا بنفس المفتاح ويرجّع كود الرد */
async function forward(body: string): Promise<number> {
  const res = await fetch(`${APP}?key=${encodeURIComponent(WEBHOOK_KEY)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  return res.status;
}

Deno.serve(async (req) => {
  // **فحص التوصيلة** — بيرجّع كود رد المسار من غير ما يلمس أي داتا.
  // موجود عشان نعرف إن المفتاح مظبوط على الطرفين من غير ما حد يشوفه:
  // ٢٠٠ يعني الجرس واصل، ٤٠١ يعني المفتاح مختلف والتحديث الفوري واقف.
  if (req.method === "GET") {
    try {
      return new Response(`forward → ${await forward("{}")}`, { status: 200 });
    } catch (e) {
      return new Response(`forward threw: ${String(e)}`, { status: 200 });
    }
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!WEBHOOK_KEY || new URL(req.url).searchParams.get("key") !== WEBHOOK_KEY) {
    return new Response("Unauthorized", { status: 401 });
  }

  const raw = await req.text();

  try {
    const status = await forward(raw);
    if (status >= 200 && status < 300) return new Response("Forwarded", { status: 200 });
    console.error("الجرس مارنّش — المسار رد بـ", status, "| المزامنة الدورية هتلقطها");
  } catch (e) {
    console.error("الجرس وقع:", String(e), "| المزامنة الدورية هتلقطها");
  }

  // **٢٠٠ بردو**: بوسطة بتعيد المحاولة على أي رد تاني، والإعادة مش هتصلّح
  // مفتاح غلط — هتزوّد النداءات بس. المزامنة الدورية هي شبكة الأمان.
  return new Response("Queued for periodic sync", { status: 200 });
});
