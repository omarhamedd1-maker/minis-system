// مسار شغل التاسكات الدوري — بيتنادى من الكرون كل ربع ساعة.
//
//   ?key=…      نفس مفتاح الحماية بتاع المزامنة (SYNC_KEY)
//   ?tenant=…   بيزنس واحد بس (للتجربة)
//   ?dry=1      يعرض من غير ما يبعت ولا يكتب
//
// **بيعمل حاجتين**: يولّد نسخ التاسكات المتكررة، ويبعت التنبيهات اللي
// ميعادها جه. الاتنين على نفس المسار عشان مهمة كرون واحدة تكفّي.
//
// بيلف على كل بيزنس شغّال. **مافيش خطر من التكرار**: التاسك مابيتولّدش لو
// فيه نسخة مفتوحة منه، والتنبيه بيتعلّم أول ما يتبعت.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cairoToday } from "@/lib/format";
import { generateRecurringTasks } from "@/lib/tasks-recur";
import { runTaskReminders } from "@/lib/task-reminders-run";
import { recordPrepaidCash } from "@/lib/prepaid-cash-run";
import { activeTenantIds } from "@/lib/tenant-settings";
import { runOrderImport } from "@/lib/shopify/orders";

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
  const dry = url.searchParams.get("dry") === "1";
  const now = new Date();

  type Ok = {
    recur: { created: number; checked: number };
    remind: { sent: number; checked: number; silent: number };
    prepaid: { added: number; adopted: number; alreadyDone: number; review: number };
    /** `null` = البيزنس ده مش مربوط بشوبيفاي، أو الجلب وقع */
    shopify: { orders: number; customers: number } | null;
  };

  try {
    const one = url.searchParams.get("tenant");
    const tenants = one ? [one] : await activeTenantIds(db);
    const results: Record<string, Ok | { error: string }> = {};

    for (const tenantId of tenants) {
      try {
        // **التوليد الأول والتنبيهات بعده** — النسخة الجديدة ممكن يكون
        // عليها تنبيه، فالترتيب ده بيخلّيها تاخده في نفس اللفة
        const recur = dry
          ? { created: 0, checked: 0 }
          : await generateRecurringTasks({ db, tenantId, today });
        const remind = await runTaskReminders({ db, tenantId, today, now, dry });

        // الفلوس المقدمة وانستا — بتتسجّل في الخزنة بالمبلغ ورقم الأوردر
        const p = await recordPrepaidCash({ db, tenantId, dry });
        const prepaid = {
          added: p.added,
          adopted: p.adopted,
          alreadyDone: p.alreadyDone,
          review: p.review.length,
        };

        // ⚠️ **استيراد أوردرات شوبيفاي — ده اللي بيخلّي أي بيزنس يشتغل.**
        //
        // استقبال الأوردر الجديد كان في دوال سوبابيز، وهي مربوطة بمتجر
        // واحد (`SHOPIFY_SHOP` متغيّر بيئة واحد للمشروع كله). يعني أي
        // بيزنس تاني بيربط شوبيفاي، أوردراته ماكانتش هتوصل خالص.
        //
        // وده بيلف على كل بيزنس بمفاتيحه هو، ومن غير ما نلمس إعدادات
        // الويب هوكس عند شوبيفاي. الاستيراد بيمنع التكرار برقم الأوردر،
        // فتشغيله كل ربع ساعة مالوش ضرر.
        let shopify: Ok["shopify"] = null;
        try {
          const r = await runOrderImport({ db, tenantId, dry });
          if (r.ok && r.added) shopify = r.added;
        } catch {
          // البيزنس ده مش مربوط أو شوبيفاي وقعت — الباقي يكمّل
        }

        results[tenantId] = { recur, remind, prepaid, shopify };
      } catch (e) {
        // بيزنس وقع؟ الباقي يكمّل
        results[tenantId] = {
          error: e instanceof Error ? e.message : "الشغل وقع",
        };
      }
    }

    return NextResponse.json({ today, dry, tenants: tenants.length, results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "الشغل وقع" },
      { status: 500 }
    );
  }
}
