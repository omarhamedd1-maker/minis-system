// ==========================================================================
// باب ميتا — واتساب وإنستجرام وماسنجر بيرنّوا هنا
// --------------------------------------------------------------------------
// ⚠️⚠️ **التوقيع بيتحسب على الجسم الخام** — بنقرا `req.text()` الأول وبعدين
// نحلّله. `req.json()` بيستهلك الجسم، وإعادة تركيبه بـ`JSON.stringify`
// بتدّي نص تاني والتوقيع بيفشل دايمًا.
//
// ⚠️ **وبنرد ٢٠٠ حتى لو التخزين وقع.** ميتا بتعتبر أي رد غير ٢٠٠ فشلًا
// وبتفضل تعيد المحاولة لأيام، وبعد شوية بتقفل الاشتراك خالص — فالرد
// بالخطأ هنا بيوقّف القناة كلها مش رسالة واحدة. الغلط بيتسجّل في اللوج.
// ==========================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseMetaWebhook } from "@/lib/inbox/meta-payload";
import { verifySignature } from "@/lib/inbox/signature";
import { recordIncoming, applyStatuses } from "@/lib/inbox/store";

export const dynamic = "force-dynamic";

/**
 * مصافحة التسجيل — ميتا بتناديها مرة واحدة وقت ربط الويب هوك.
 *
 * ⚠️ **بترد بالتحدي كنص عادي** — أي حاجة تانية (JSON أو مسافة زيادة)
 * وميتا بترفض الربط من غير ما تقول السبب.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge") ?? "";

  const want = process.env.META_VERIFY_TOKEN ?? "";
  if (mode === "subscribe" && want && token === want) {
    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  return new Response("لأ", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();

  const ok = verifySignature(
    raw,
    req.headers.get("x-hub-signature-256"),
    process.env.META_APP_SECRET
  );
  if (!ok) {
    // ⚠️ التوقيع الغلط **بيترفض** — ده مش زي أوردر شوبيفاي الجديد اللي
    // أسوأ حالاته إننا نسحب أوردر موجود. هنا حد ممكن يحقن كلام في صندوق
    // رسايل عميل.
    return new Response("توقيع غلط", { status: 401 });
  }

  try {
    const parsed = parseMetaWebhook(JSON.parse(raw));
    const db = createAdminClient();

    const stored = await recordIncoming(db, parsed.messages);
    const statuses = await applyStatuses(db, parsed.statuses);

    return NextResponse.json({ ok: true, ...stored, statuses });
  } catch (e) {
    console.error("[meta/webhook]", e);
    // ⚠️ ٢٠٠ بقصد — اقرا الملاحظة فوق
    return NextResponse.json({ ok: false });
  }
}
