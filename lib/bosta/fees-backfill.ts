// ==========================================================================
// جلب رسوم بوسطة الحقيقية وتخزينها — شوية شوية مع كل مزامنة
// --------------------------------------------------------------------------
// الكشف الحقيقي بييجي من جلب الشحنة **لوحدها** بس، ومسار البحث اللي المزامنة
// بتستخدمه مابيرجّعوش. يعني لو عايزينه لكل الأوردرات، ده ٣٠٠+ نداء لبوسطة —
// مينفعش كل ١٥ دقيقة.
//
// فبناخد دفعة صغيرة كل مرة، **من الأقدم للأحدث**: الشحنة القديمة دورة الكاش
// بتاعتها اتقفلت خلاص فرقمها نهائي وبتخرج من الطابور. والجديدة اللي لسه
// ماقفلتش بتفضل مستنية دورها من غير ما تقفل الطابور على غيرها.
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
    const { data, error, count } = await db
      .from("orders")
      .select("id, bosta_tracking", { count: "exact" })
      .eq("tenant_id", tenantId)
      .in("order_status", FINISHED)
      .not("bosta_tracking", "is", null)
      .is("bosta_fees_at", null)
      .order("bosta_created_at", { ascending: true, nullsFirst: false })
      .limit(limit);

    // الأعمدة لسه مااتعملتش (ملف SQL ماتشغّلش)؟ نعدّي بهدوء
    if (error) return out;
    rows = (data ?? []) as { id: string; bosta_tracking: string | null }[];
    out.remaining = Math.max(0, (count ?? rows.length) - rows.length);
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
