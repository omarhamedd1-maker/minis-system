// مسار توليد التاسكات المتكررة — بيتنادى من الكرون كل ساعة.
//
//   ?key=…   نفس مفتاح الحماية بتاع المزامنة (SYNC_KEY)
//
// بيلف على كل بيزنس شغّال. **مافيش خطر من التكرار**: التاسك مابيتولّدش لو
// فيه نسخة مفتوحة منه، فالنداء مرتين نتيجته زي المرة الواحدة.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cairoToday } from "@/lib/format";
import { generateRecurringTasks } from "@/lib/tasks-recur";
import { activeTenantIds } from "@/lib/tenant-settings";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const url = new URL(request.url);

  const guard = process.env.SYNC_KEY;
  if (!guard || url.searchParams.get("key") !== guard) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const db = createAdminClient();
  const today = cairoToday();

  try {
    const one = url.searchParams.get("tenant");
    const tenants = one ? [one] : await activeTenantIds(db);
    const results: Record<string, { created: number; checked: number } | { error: string }> = {};

    for (const tenantId of tenants) {
      try {
        results[tenantId] = await generateRecurringTasks({ db, tenantId, today });
      } catch (e) {
        // بيزنس وقع؟ الباقي يكمّل
        results[tenantId] = {
          error: e instanceof Error ? e.message : "التوليد وقع",
        };
      }
    }

    return NextResponse.json({ today, tenants: tenants.length, results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "التوليد وقع" },
      { status: 500 }
    );
  }
}
