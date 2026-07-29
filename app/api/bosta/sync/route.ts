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
import { runBostaSync, type SyncSummary } from "@/lib/bosta/sync";
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
      SyncSummary | { error: string }
    > = {};

    for (const tenantId of tenants) {
      try {
        results[tenantId] = await runBostaSync({ db, tenantId, dry });
      } catch (e) {
        // بيزنس وقع؟ نسجّل ونكمّل الباقي
        results[tenantId] = {
          error: e instanceof Error ? e.message : "المزامنة وقعت",
        };
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
