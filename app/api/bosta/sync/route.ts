// مسار المزامنة جوّه السيستم — البديل لدالة bosta-sync اللي في لوحة سوبابيز.
//
//   ?key=…            مفتاح الحماية (نفس SYNC_KEY)
//   &dry=1            يعرض اللي هيتغيّر من غير ما يكتب حاجة
//
// لحد ما نتأكد إنه بيطلع نفس أرقام الدالة القديمة، الاتنين شغالين مع بعض.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runBostaSync } from "@/lib/bosta/sync";
import { BostaError } from "@/lib/bosta/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const url = new URL(request.url);

  const guard = process.env.SYNC_KEY;
  if (!guard || url.searchParams.get("key") !== guard) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const apiKey = process.env.BOSTA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "مفتاح بوسطة مش متسجّل في إعدادات المشروع (BOSTA_API_KEY)" },
      { status: 500 }
    );
  }

  try {
    const summary = await runBostaSync({
      db: createAdminClient(),
      apiKey,
      dry: url.searchParams.get("dry") === "1",
    });
    return NextResponse.json(summary);
  } catch (e) {
    const status = e instanceof BostaError ? 502 : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "المزامنة وقعت" },
      { status }
    );
  }
}
