// ==========================================================================
// مسار ويب هوك بوسطة — البديل لدالة `bosta-webhook` في لوحة سوبابيز
// --------------------------------------------------------------------------
// بوسطة بتنده عليه أول ما حالة شحنة تتغيّر، فالحالة بتتحدّث في ثواني بدل
// ما تستنى المزامنة الدورية (كل ربع ساعة).
//
// ⚠️⚠️ **الدالة القديمة كانت بتدوّر على الأوردر برقمه بس:**
//
//     .from("orders").select("id").eq("order_number", cleanRef)
//
// من غير أي فلتر بيزنس. **وأرقام الأوردرات بتتقاطع بين البيزنسات فعلًا** —
// مينيز و٢ سِك بينهم **١٤٠ رقم مشترك** (اتفحص ١٧ أغسطس ٢٠٢٦). يعني أول ما
// بيزنس تاني يربط بوسطة، شحنة عنده رقمها ١٣٥٥ كانت هتغيّر حالة أوردر ١٣٥٥
// عند عمر.
//
// **هنا بنلاقي الأوردر برقم التتبع** — ده فريد عند بوسطة ومخزّن عندنا،
// فالبيزنس بيطلع من الصف نفسه ومفيش تخمين.
//
// ⚠️ **والطلب ده جرس مش رسالة**: مابناخدش الحالة من جسم الطلب. بننادي
// المزامنة بتاعتنا اللي بتجيب الحالة من بوسطة وتعرف تفرّق بين كود ٤٥
// (اتسلّمت) و٤٦ (رجعت لنا) — والاتنين اسمهم عند بوسطة `Delivered`.
// الدالة القديمة كانت بتقرا النص وتقع في الفخ ده.
// ==========================================================================

import { NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BostaNotLinked, runBostaSync } from "@/lib/bosta/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** رقم التتبع بييجي بأكتر من شكل حسب نوع الحدث */
function readTracking(payload: unknown): string {
  const p = (payload ?? {}) as Record<string, unknown>;
  const d = (p.delivery ?? {}) as Record<string, unknown>;
  return String(
    p.trackingNumber ?? p.tracking_number ?? d.trackingNumber ?? ""
  ).trim();
}

export async function POST(req: Request) {
  const url = new URL(req.url);

  // نفس حماية الدالة القديمة — مفتاح في الرابط
  const guard = process.env.BOSTA_WEBHOOK_KEY || process.env.SYNC_KEY;
  if (!guard || url.searchParams.get("key") !== guard) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ error: "جسم مش JSON" }, { status: 400 });
  }

  const tracking = readTracking(payload);
  if (!tracking) {
    // **٢٠٠ مش خطأ** — بوسطة بتعيد المحاولة على أي رد تاني، والطلب اللي
    // مالوش رقم تتبع مش هيبقى ليه رقم تتبع مهما اتعاد
    return NextResponse.json({ ok: true, skipped: "مفيش رقم تتبع" });
  }

  const db = createAdminClient();

  // البيزنس بيطلع من الصف نفسه — مش من أي حاجة في الطلب
  const { data } = await db
    .from("orders")
    .select("tenant_id")
    .eq("bosta_tracking", tracking)
    .maybeSingle();

  const tenantId = (data as { tenant_id: string } | null)?.tenant_id ?? null;
  if (!tenantId) {
    // شحنة مش مربوطة بأوردر عندنا — المزامنة الدورية بتلقط دي
    return NextResponse.json({ ok: true, skipped: "الشحنة مش عندنا" });
  }

  // **الرد بيروح فورًا** — المزامنة أطول من صبر بوسطة
  after(async () => {
    try {
      await runBostaSync({ db: createAdminClient(), tenantId });
    } catch (e) {
      // البيزنس شال مفتاح بوسطة؟ اللفة الدورية هتتعامل معاها
      if (!(e instanceof BostaNotLinked)) {
        console.error("مزامنة الويب هوك وقعت:", e);
      }
    }
  });

  return NextResponse.json({ ok: true });
}
