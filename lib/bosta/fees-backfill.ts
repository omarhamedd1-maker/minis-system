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
// ⚠️ **وفيه شحنات عمرها ما هيبقى ليها كشف** — قديمة أو اتأرشفت عند بوسطة
// من غير ما تتحرك. دول كانوا بيفضلوا في الطابور **للأبد**: ١٧ شحنة كانت
// بتتنده كل ١٥ دقيقة وبترجع فاضية = **١٬٦٠٠ نداء ضايع في اليوم**، وكمان
// بتاخد مكان في الدفعة من اللي لسه ليه أمل.
//
// الحل: **`bosta_fees_at` بقى «آخر محاولة» مش «وقت النجاح»** — بيتكتب حتى
// لما بوسطة ترجع فاضية، والشحنة مابتترجعش للطابور غير بعد `RETRY_AFTER_DAYS`.
// اللي نجح بيتعرف إن `bosta_fees_real` مليان، فمابيرجعش تاني أبدًا.
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

/**
 * الشحنة اللي بوسطة ردّت عليها فاضي بتستنى كام يوم قبل ما نجرّب تاني.
 *
 * تلات أيام: طويلة كفاية إن الشحنة الميتة ماتاكلش نداءات، وقصيرة كفاية إن
 * الشحنة اللي دورة كاشها اتقفلت متأخر تلحق تتجاب.
 */
export const RETRY_AFTER_DAYS = 3;

export type BackfillResult = {
  /** اتجابت واتخزّنت */
  saved: number;
  /** الشحنة لسه ماقفلتش دورة الكاش — هنجرّب تاني بعد `RETRY_AFTER_DAYS` */
  notReady: number;
  /** لسه مستنيين كام أوردر في الطابور */
  remaining: number;
};

/** طابور الجلب: مين مستاهل يتجرّب دلوقتي */
export function retryCutoff(now: Date, days = RETRY_AFTER_DAYS): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

export async function backfillRealFees(opts: {
  db: SupabaseClient;
  tenantId: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  limit?: number;
  /** للاختبار — الافتراضي دلوقتي */
  now?: Date;
}): Promise<BackfillResult> {
  const { db, tenantId, apiKey, fetchImpl, limit = BATCH } = opts;
  const now = opts.now ?? new Date();
  const out: BackfillResult = { saved: 0, notReady: 0, remaining: 0 };

  let rows: { id: string; bosta_tracking: string | null }[] = [];
  try {
    // **اللي نجح بيخرج بـ`bosta_fees_real`، واللي فشل بيستنى `RETRY_AFTER_DAYS`**
    // قبل ما يرجع للطابور. من غير الشرط التاني الشحنة الميتة بتتنده كل ١٥
    // دقيقة للأبد.
    const cutoff = retryCutoff(now);
    // بنبني الاستعلام من جديد كل مرة — مانعيدش استخدام نفس الكائن
    const pending = () =>
      db
        .from("orders")
        .select("id, bosta_tracking", { count: "exact" })
        .eq("tenant_id", tenantId)
        .in("order_status", FINISHED)
        .not("bosta_tracking", "is", null)
        .is("bosta_fees_real", null)
        .or(`bosta_fees_at.is.null,bosta_fees_at.lt.${cutoff}`)
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
        // **بنعلّم المحاولة حتى لما ترجع فاضية** — ده اللي بيخلّي الشحنة
        // الميتة تخرج من الطابور بدل ما تتنده كل ١٥ دقيقة
        out.notReady++;
        await db
          .from("orders")
          .update({ bosta_fees_at: now.toISOString() })
          .eq("id", row.id);
        continue;
      }
      const { error } = await db
        .from("orders")
        .update({
          bosta_fees_real: fees.total,
          bosta_ship_fee_real: fees.shipping,
          bosta_fees_at: now.toISOString(),
        })
        .eq("id", row.id);
      if (!error) out.saved++;
    } catch {
      // شحنة واحدة وقعت؟ الباقي يكمّل
    }
  }

  return out;
}
