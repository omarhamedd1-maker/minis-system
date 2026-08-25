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
import { NOT_LINKED_ERROR, runOrderImport } from "@/lib/shopify/orders";
import { runProductImport } from "@/lib/shopify/products";
import { shopifyImportFailMessage } from "@/lib/alert-messages";
import {
  productDrift,
  driftMessage,
  WINDOW_DAYS as DRIFT_DAYS,
} from "@/lib/product-drift";
import { seasonAlerts, seasonMessage } from "@/lib/seasons";
import { runAutomation } from "@/lib/automation-run";
import { notifyAll } from "@/lib/push/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * تنبيه إن استيراد شوبيفاي واقف — **مرة في اليوم لكل بيزنس، وبس لما الجدول موجود**.
 *
 * ⚠️⚠️ **من غير جدول `notification_log` بنسكت خالص.** التاج هو اللي بيمنع
 * التكرار، والجدول هو اللي بيحجز التاج. من غير الجدول التنبيه ده كان هيتبعت
 * كل ربع ساعة — ٩٦ مرة في اليوم، ودي بالظبط مصيبة ٢٠ أغسطس. لحد ما
 * `sql/notification-log.sql` يتشغّل، شاشة الصحة هي اللي بتوري العطل لوحدها.
 */
async function alertImportFailed(
  db: Parameters<typeof notifyAll>[0],
  tenantId: string,
  reason: string,
  today: string,
  dry: boolean
) {
  if (dry) return;
  try {
    // الفحص ده بسؤال «الجدول موجود؟» — والفلتر بالبيزنس عشان الحارس
    // يعدّيه، ومافيش قراية صفوف هنا أصلًا
    const { error } = await db
      .from("notification_log")
      .select("tag")
      .eq("tenant_id", tenantId)
      .limit(1);
    if (error) return; // الجدول مش موجود — الصمت أهون من ٩٦ تنبيه
    await notifyAll(db, tenantId, shopifyImportFailMessage(reason), {
      tag: `shopify-import-${today}`,
    });
  } catch {
    // التنبيه بس هو اللي مايبانش — الاستيراد بيتحقق تاني ربع ساعة بعده
  }
}

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
    /** منتجات نسبة رجوعها قفزت عن نفسها */
    drift?: { name: string; before: number; now: number }[] | null;
    /** مواسم قرّبت — شهر أو أسبوع */
    seasons?: { name: string; daysAway: number }[] | null;
    /** قواعد صاحب المتجر — كام قاعدة وكام حالة عدّت الحد */
    rules?: { rules: number; hits: number; sent: number } | null;
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
            // ⚠️ **مش كل تخطّي عطل.** «لسه مربطش» وضع طبيعي لبيزنس جديد
            // أو الديمو — تنبيهه كان هيضرب على ناس مالهمش ذنب. العطل
            // الحقيقي هو اللي **مربط وبيقف**: توكن باظ أو التطبيق اتشال —
            // وده معناه إن الأوردرات وقفت عن بيزنس بيشتغل فعلًا.
            if (r.error !== NOT_LINKED_ERROR) {
              await alertImportFailed(db, tenantId, r.error, today, dry);
            }
          }
        } catch (e) {
          // ⚠️ **السبب لازم يبان.** الكاتش الصامت كان بيخلّي النتيجة `null`
          // من غير ما حد يعرف البيزنس مش مربوط ولا الجلب وقع.
          const msg = e instanceof Error ? e.message : "الجلب وقع";
          shopify = { skipped: msg };
          // اللفة دي وقعت من غير ما توصل لفحص «مربوط ولا لأ»؟ التنبيه
          // محتاج يوصل برضه — العطل أثناء الجلب نفسه عطل فعلًا
          await alertImportFailed(db, tenantId, msg, today, dry);
        }

        // ⚠️⚠️ **المنتج اللي اتغيّر سلوكه** — النسبة الكلية بتخبّي ده تمامًا:
        // بتتحرك ١٪ بينما منتج واحد جوّاها اتضاعف تلات مرات.
        //
        // ⚠️ **مرة في الأسبوع مش كل يوم** — النسبة محسوبة على ٣٠ يوم،
        // فمابتتحركش من يوم للتاني، والتنبيه اليومي بنفس الكلام بيتقفل.
        let drift: Ok["drift"] = null;
        try {
          if (now.getUTCDay() === 6) {
            const since = new Date(now.getTime() - 2 * DRIFT_DAYS * 86_400_000)
              .toISOString()
              .slice(0, 10);

            type SoldRow = {
              order_status: string | null;
              order_date: string | null;
              order_items: {
                variant_id: string | null;
                product_variants: {
                  variant_name: string | null;
                  products: { name_ar: string | null; name: string | null } | null;
                } | null;
              }[];
            };

            const { data: sold } = await db
              .from("orders")
              .select(
                "order_status, order_date, order_items(variant_id, product_variants(variant_name, products(name_ar, name)))"
              )
              .eq("tenant_id", tenantId)
              .in("order_status", [
                "delivered",
                "returned",
                "returned_after_delivery",
              ])
              .gte("order_date", since)
              .limit(3000)
              // ⚠️ الوصلات بترجع كمصفوفات في النوع المولّد، وهي كائن واحد
              // فعلًا — `overrideTypes` بتصحّح ده زي باقي الشاشات
              .overrideTypes<SoldRow[]>();

            const lines = (sold ?? []).flatMap((o) =>
              (o.order_items ?? []).map((i) => ({
                variantId: i.variant_id,
                productName:
                  i.product_variants?.products?.name_ar ??
                  i.product_variants?.products?.name ??
                  null,
                variantName: i.product_variants?.variant_name ?? null,
                day: o.order_date,
                returned: ["returned", "returned_after_delivery"].includes(
                  String(o.order_status)
                ),
              }))
            );

            const moved = productDrift(lines, now);
            if (moved.length > 0) {
              drift = moved.map((d) => ({
                name: [d.productName, d.variantName].filter(Boolean).join(" · "),
                before: d.before,
                now: d.now,
              }));
              if (!dry) {
                await notifyAll(
                  db,
                  tenantId,
                  moved.map(driftMessage).join("\n"),
                  { tag: "drift-" + today }
                );
              }
            }
          }
        } catch {
          // التنبيه بس هو اللي مايبانش
        }

        // ⚠️ **المواسم** — تنبيه قبل كل مناسبة بشهر وبأسبوع.
        //
        // ⚠️ **والتاج بالموسم وباليوم** — من غيره التنبيه بيتكرر كل ربع
        // ساعة طول اليوم، والشباك ٣ أيام فيبقى ٢٨٨ مرة.
        let seasons: Ok["seasons"] = null;
        try {
          const due = seasonAlerts(now);
          if (due.length > 0) {
            seasons = due.map((d) => ({
              name: d.season.name,
              daysAway: d.daysAway,
            }));
            if (!dry) {
              for (const d of due) {
                await notifyAll(
                  db,
                  tenantId,
                  seasonMessage(d.season, d.daysAway),
                  { tag: `season-${d.season.key}-${d.daysAway}` }
                );
              }
            }
          }
        } catch {
          // التنبيه بس هو اللي مايبانش
        }

        // ⚠️ **قواعد صاحب المتجر** — الحدود اللي هو ظبّطها بنفسه.
        //
        // ⚠️ **بتنبّه بس** — مافيش تعديل في الداتا ولا رسايل للعملاء.
        // والبيزنس اللي مالوش قواعد بيتعدّى من غير أي استعلام.
        let rules: Ok["rules"] = null;
        try {
          const r = await runAutomation({ db, tenantId, now, dry });
          if (r.rules > 0) rules = r;
        } catch {
          // التنبيه بس هو اللي مايبانش
        }

        results[tenantId] = {
          recur,
          remind,
          prepaid,
          shopify,
          drift,
          seasons,
          rules,
        };
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
