// ==========================================================================
// جلب رسوم بوسطة الحقيقية وتخزينها — شوية شوية مع كل مزامنة
// --------------------------------------------------------------------------
// الكشف الحقيقي بييجي من جلب الشحنة **لوحدها** بس، ومسار البحث اللي المزامنة
// بتستخدمه مابيرجّعوش. يعني لو عايزينه لكل الأوردرات، ده ٣٠٠+ نداء لبوسطة —
// مينفعش كل ١٥ دقيقة.
//
// فبناخد دفعة صغيرة كل مرة. الشحنة اللي دورة الكاش بتاعتها اتقفلت بتاخد
// رقمها وتخرج من الطابور خالص، واللي لسه ماقفلتش بتستنى دورها.
//
// **والدفعة بتتاخد من مكان عشوائي في الطابور مش من أوله.** لأن فيه أوردرات
// عمرها ما هيبقى ليها كشف — ملغية أو شحنتها اتأرشفت من غير ما تتحرك — ولو
// مشينا بالترتيب دول هيقعدوا في أول الطابور للأبد ويمنعوا اللي وراهم.
//
// **والرقم بيتجاب مرة واحدة وخلاص** — بعد ما دورة الكاش تتقفل مابيتغيّرش.
//
// وقاعدة السيستم سارية هنا: **الجلب ده مايوقفش المزامنة**. بوسطة ردّت غلط أو
// الأعمدة لسه مااتعملتش؟ بنكمّل عادي.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchDeliveryWallet } from "./client";
import { realFees } from "./real-fees";

/** الحالات اللي الشحنة فيها خلصت — دي بس اللي ليها كشف نهائي */
const FINISHED = [
  "delivered",
  "returned",
  "returned_after_delivery",
  "cancelled",
];

/** كام أوردر في المزامنة الواحدة. صغيرة بقصد — المزامنة عندها ٥ دقايق بس */
const BATCH = 20;

export type BackfillResult = {
  /** اتجابت واتخزّنت */
  saved: number;
  /** الشحنة لسه ماقفلتش دورة الكاش — هنجرّب تاني بعدين */
  notReady: number;
  /** لسه مستنيين كام أوردر في الطابور */
  remaining: number;
};

export async function backfillRealFees(opts: {
  db: SupabaseClient;
  tenantId: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  limit?: number;
}): Promise<BackfillResult> {
  const { db, tenantId, apiKey, fetchImpl, limit = BATCH } = opts;
  const out: BackfillResult = { saved: 0, notReady: 0, remaining: 0 };

  let rows: { id: string; bosta_tracking: string | null }[] = [];
  try {
    // بنبني الاستعلام من جديد كل مرة — مانعيدش استخدام نفس الكائن
    const pending = () =>
      db
        .from("orders")
        .select("id, bosta_tracking", { count: "exact" })
        .eq("tenant_id", tenantId)
        .in("order_status", FINISHED)
        .not("bosta_tracking", "is", null)
        .is("bosta_fees_at", null)
        // ترتيب ثابت عشان الشباك العشوائي يبقى له معنى
        .order("order_date", { ascending: true });

    const { count } = await pending().range(0, 0);
    const total = count ?? 0;
    if (total === 0) return out;

    const start =
      total > limit ? Math.floor(Math.random() * (total - limit + 1)) : 0;
    const { data, error } = await pending().range(start, start + limit - 1);

    // الأعمدة لسه مااتعملتش (ملف SQL ماتشغّلش)؟ نعدّي بهدوء
    if (error) return out;
    rows = (data ?? []) as { id: string; bosta_tracking: string | null }[];
    out.remaining = Math.max(0, total - rows.length);
  } catch {
    return out;
  }

  for (const row of rows) {
    if (!row.bosta_tracking) continue;
    try {
      const wallet = await fetchDeliveryWallet(
        apiKey,
        String(row.bosta_tracking),
        fetchImpl
      );
      const fees = realFees(wallet);
      if (!fees) {
        out.notReady++;
        continue;
      }
      const { error } = await db
        .from("orders")
        .update({
          bosta_fees_real: fees.total,
          bosta_ship_fee_real: fees.shipping,
          bosta_fees_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (!error) out.saved++;
    } catch {
      // شحنة واحدة وقعت؟ الباقي يكمّل
    }
  }

  return out;
}
