// مسار النسخة الاحتياطية — بيتنادى من الكرون مرة في اليوم.
//
//   ?key=…      نفس مفتاح الحماية بتاع المزامنة (SYNC_KEY)
//   ?tenant=…   بيزنس واحد بس (للتجربة)
//   ?dry=1      بيقول إيه اللي هيتبعت من غير ما يبعت
//
// ⚠️⚠️ **الداتا بتطلع زي ما هي.** الأعمدة بتتاخد كلها (`*`) بقصد — النسخة
// اللي بتختار أعمدة بتفضل صح لحد ما نضيف عمود جديد، وساعتها بتبقى ناقصة
// وإحنا فاكرينها كاملة.
//
// ⚠️ **البيزنس اللي مالوش جروب تليجرام بيتعدّى بهدوء** — ده مش عطل، ده
// إعداد لسه مااتعملش.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activeTenantIds, loadTenantCredentials } from "@/lib/tenant-settings";
import { buildBackup, backupSummary, tooBig } from "@/lib/backup";
import { sendTelegramFile, sendTelegramMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** الجداول اللي النسخة بتاخدها — والترتيب ده هو ترتيب البعت */
const TABLES = [
  "orders",
  "order_items",
  "customers",
  "products",
  "product_variants",
  "expenses",
  "suppliers",
  "stock_movements",
] as const;

/** سقف الصفوف للجدول الواحد — الحماية من نسخة بتاكل الذاكرة */
const MAX_ROWS = 20_000;

function dayOf(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(at);
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  const guard = process.env.SYNC_KEY;
  if (!guard || url.searchParams.get("key") !== guard) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const dry = url.searchParams.get("dry") === "1";
  const only = url.searchParams.get("tenant");
  const db = createAdminClient();
  const day = dayOf(new Date());

  const tenants = only ? [only] : await activeTenantIds(db);
  const out: Record<string, unknown>[] = [];

  for (const tenantId of tenants) {
    try {
      const creds = await loadTenantCredentials(db, tenantId);
      const token = creds.telegramBotToken;
      const chat = creds.telegramChatId;

      if (!dry && !(token && chat)) {
        out.push({ tenantId, skipped: "مافيش جروب تليجرام" });
        continue;
      }

      const tables: { name: string; rows: Record<string, unknown>[] }[] = [];
      for (const name of TABLES) {
        // ⚠️ الجدول اللي مش موجود مايوقّفش النسخة — بنكمّل بالباقي
        const { data, error } = await db
          .from(name)
          .select("*")
          .eq("tenant_id", tenantId)
          .limit(MAX_ROWS);
        if (error) continue;
        tables.push({ name, rows: (data ?? []) as Record<string, unknown>[] });
      }

      const files = buildBackup({ day, tables });
      const { data: tenant } = await db
        .from("tenants")
        .select("name")
        .eq("id", tenantId)
        .maybeSingle();
      const storeName = (tenant as { name: string | null } | null)?.name ?? null;
      const summary = backupSummary(files, storeName);

      if (files.length === 0) {
        out.push({ tenantId, skipped: "مافيش داتا" });
        continue;
      }

      if (dry) {
        out.push({
          tenantId,
          summary,
          files: files.map((f) => ({ name: f.name, rows: f.rows })),
        });
        continue;
      }

      await sendTelegramMessage(token!, chat!, summary);

      const failed: string[] = [];
      for (const f of files) {
        if (tooBig(f)) {
          failed.push(`${f.name} أكبر من اللي تليجرام بيقبله`);
          continue;
        }
        const r = await sendTelegramFile(token!, chat!, f, null);
        if (!r.ok) failed.push(`${f.name}: ${r.error ?? "مانفعش"}`);
      }

      out.push({ tenantId, sent: files.length - failed.length, failed });
    } catch (e) {
      // ⚠️ بيزنس واحد وقع مايوقّفش الباقي
      out.push({ tenantId, error: e instanceof Error ? e.message : "خطأ" });
    }
  }

  return NextResponse.json({ ok: true, day, out });
}
