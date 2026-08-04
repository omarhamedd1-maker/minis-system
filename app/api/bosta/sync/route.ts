// مسار المزامنة جوّه السيستم — البديل لدالة bosta-sync اللي في لوحة سوبابيز.
//
//   ?key=…            مفتاح الحماية (نفس SYNC_KEY)
//   &dry=1            يعرض اللي هيتغيّر من غير ما يكتب حاجة
//   &tenant=<uuid>    بيزنس واحد بس (لو مش موجود بيزامن كل البيزنسات الشغالة)
//
// كل بيزنس بيتزامن بمفتاحه هو وبأرقام رسومه هو. ولو واحد فيهم وقع،
// الباقي بيكمّل عادي — مشكلة عميل مابتوقفش باقي العملاء.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BostaNotLinked, runBostaSync, type SyncSummary } from "@/lib/bosta/sync";
import { recordSyncRun } from "@/lib/bosta/sync-runs";
import { activeTenantIds } from "@/lib/tenant-settings";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const url = new URL(request.url);

  const guard = process.env.SYNC_KEY;
  if (!guard || url.searchParams.get("key") !== guard) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const dry = url.searchParams.get("dry") === "1";
  const one = url.searchParams.get("tenant");
  const db = createAdminClient();

  try {
    const tenants = one ? [one] : await activeTenantIds(db);

    const results: Record<
      string,
      SyncSummary | { error: string } | { skipped: string }
    > = {};

    for (const tenantId of tenants) {
      const startedAt = Date.now();
      try {
        const summary = await runBostaSync({ db, tenantId, dry });
        results[tenantId] = summary;
        // بنسجّل كل تشغيل عشان نعرف لو الجدولة وقفت — من غير السجل ده
        // المزامنة تقدر تقف أسبوع ومحدش ياخد باله
        await recordSyncRun(db, {
          tenantId,
          ok: summary.errors.length === 0,
          dry,
          fetched: summary.fetched,
          matched: summary.matched,
          changed: summary.changed,
          unmatched: summary.unmatched,
          errors: summary.errors,
          durationMs: Date.now() - startedAt,
        });
      } catch (e) {
        // **البيزنس مش مربوط ببوسطة؟ دي مش مشكلة.** بنعدّيه بهدوء من غير ما
        // نسجّل تشغيل فاشل — وإلا السجل بيمتلي ٩٦ خطأ وهمي في اليوم ويخفي
        // الخطأ الحقيقي.
        if (e instanceof BostaNotLinked) {
          results[tenantId] = { skipped: e.message };
          continue;
        }
        // بيزنس وقع فعلاً؟ نسجّل ونكمّل الباقي
        const message = e instanceof Error ? e.message : "المزامنة وقعت";
        results[tenantId] = { error: message };
        await recordSyncRun(db, {
          tenantId,
          ok: false,
          dry,
          errors: message,
          durationMs: Date.now() - startedAt,
        });
      }
    }

    // بيزنس واحد؟ نرجّع نتيجته مباشرة زي الأول
    if (tenants.length === 1) {
      const only = results[tenants[0]];
      const failed = "error" in only;
      return NextResponse.json(only, { status: failed ? 502 : 200 });
    }

    return NextResponse.json({ dry, tenants: tenants.length, results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "المزامنة وقعت" },
      { status: 500 }
    );
  }
}
