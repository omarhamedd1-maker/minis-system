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
import { runProductImport } from "@/lib/shopify/products";

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
    /**
     * نتيجة استيراد أوردرات شوبيفاي للبيزنس ده.
     *
     * في الوضع الجاف بيرجّع **اللي كان هيتعمل** (`dry: true`)، ولو اتخطّى
     * بيرجّع **السبب**. الاتنين دول مش رفاهية: النسخة الأولى كانت بترجّع
     * `null` في كل الحالات — مربوط أو مش مربوط أو وقع — فقعدت أدوّر في
     * حاجة سليمة وأنا فاكر إنها بايظة.
     */
    shopify:
      | {
          orders: number;
          customers: number;
          dry?: boolean;
          /** أوردرات اتلغت عند شوبيفاي واتقفلت عندنا */
          cancelled?: number;
          /**
           * ملغي عند شوبيفاي **بس ليه شحنة بوسطة** — مااتلمسش عن قصد.
           * الأرقام دي محتاجة عين، والشحنة عليها فلوس ورسوم عند بوسطة.
           */
          cancelledButShipped?: string[];
        }
      | { skipped: string }
      | null;
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
          // ⚠️⚠️ **المنتجات الأول — الترتيب ده مش تفصيلة.**
          //
          // الاستيراد **بيوقف الأوردر اللي منتجاته مش عندنا بقصد** (بند من
          // غير منتج = إجمالي غلط، وده أوحش من إن الأوردر ماييجيش). يعني
          // أول تشغيل لبيزنس جديد كان بيرجّع **صفر** — والسبب إن المنتجات
          // لسه مااتجابتش، مش إن فيه عطل.
          //
          // ودي كانت خطوة على المستخدم يعرفها بنفسه: «هات المنتجات الأول».
          // اتسجّلت في سجل عيوب التركيب (`docs/ONBOARDING.md`) لما ٢ سِك
          // اتركّب (١٧ أغسطس) — أول جلب رجّع صفر ووقفنا ندوّر في حاجة سليمة.
          //
          // **والتشغيل ده مالوش ضرر**: الجلب بيقارن برقم المنتج عند شوبيفاي
          // ومابيكرّرش، فاللفة اللي مالقتش جديد مابتكتبش حاجة.
          await runProductImport({ db, tenantId, dry });

          const r = await runOrderImport({ db, tenantId, dry });

          // **الإلغاء بيتقال في الحالتين** — سواء فيه أوردر جديد أو لأ.
          // في التجربة الجافة بيوري اللي **كان** هيتقفل.
          const review = r.ok
            ? r.plan.cancelledButShipped.map((x) => x.orderNumber)
            : [];
          const cancelInfo = r.ok
            ? {
                ...((dry ? r.plan.toCancel.length : (r.cancelled ?? 0))
                  ? { cancelled: dry ? r.plan.toCancel.length : (r.cancelled ?? 0) }
                  : {}),
                ...(review.length ? { cancelledButShipped: review } : {}),
              }
            : {};

          if (r.ok && r.added) shopify = { ...r.added, ...cancelInfo };
          else if (r.ok) {
            // ⚠️ **`dry` هنا معناها «الأرقام دي مش اللي اتعمل».**
            //
            // `added` بيتملا لما فيه حاجة اتضافت فعلًا. لو فاضي، ده إما
            // وضع تجربة **أو مافيش جديد يتضاف** — والاتنين بيرجّعوا نفس
            // الشكل. والنسخة القديمة كانت بتقول `dry: true` في الحالتين،
            // فالتشغيل الحقيقي اللي مالقاش جديد كان بيبان كأنه تجربة.
            //
            // ده ضيّع وقت فعلًا (١٧ أغسطس): كنت بستنى استيراد يشتغل
            // وبشوف `dry: true` فافتكرت إن التشغيل نفسه غلط.
            const newCustomers = r.plan.toImport.filter(
              (x) => !x.customerId
            ).length;
            shopify = {
              orders: r.plan.toImport.length,
              customers: newCustomers,
              ...(dry ? { dry: true } : {}),
              ...cancelInfo,
            };
          } else {
            shopify = { skipped: r.error };
          }
        } catch (e) {
          // ⚠️ **السبب لازم يبان.** الكاتش الصامت كان بيخلّي النتيجة `null`
          // من غير ما حد يعرف البيزنس مش مربوط ولا الجلب وقع.
          shopify = { skipped: e instanceof Error ? e.message : "الجلب وقع" };
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
