import type { SupabaseClient } from "@supabase/supabase-js";
import { allRows } from "./fetch-all-pages";

/**
 * ==========================================================================
 * حركات الخزنة اللي ينفع تحويل يتربط بيها (TRANSFERS §٩.١)
 * --------------------------------------------------------------------------
 * ⚠️⚠️ **الحركة الملغية مش مرشّحة.** إلغاء الحركة بيعمل **حركة عكسية**
 * والأصلية بتفضل في الدفتر (MONEY §٦.٢) — فهي لسه موجودة في الجدول
 * ومجموعها صفر. ولو تحويل اتربط بيها:
 *
 *   - الشاشة بتقول «مربوط بحركة خزنة» والفلوس مش في الرصيد
 *   - والفحص (`lib/payout-health.ts`) بيرجّعه «محتاج مراجعة» بعد الربط
 *
 * يعني الربط بيحصل وبعدين بيتفك — والمفروض ما يحصلش من الأصل.
 *
 * حصل على مينيز (٢٢ سبتمبر): بركة المرشحين كان فيها ٩ حركات، **٣ منهم
 * ملغيين**، واتنين منهم بنفس مبلغ التحويل الجديد بالظبط.
 *
 * ⚠️ **والدالة دي المصدر الوحيد للمرشحين** — الاستيراد والمراجعة والتحويل
 * اليدوي بيندهوها، عشان مايبقاش فيه تعريف تاني بيفوّت حالة.
 * ==========================================================================
 */

export type LiveCashRow = {
  id: string;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
};

/**
 * حركات «تحصيل يدوي داخل» اللي **لسه حيّة ومش مربوطة** بتحويل.
 *
 * `extraUsed` = حركات اتحجزت في نفس العملية (الاستيراد بيحجز واحدة ورا
 * التانية قبل ما يكتب حاجة).
 */
export async function liveManualCash(
  db: SupabaseClient,
  tenantId: string
): Promise<LiveCashRow[]> {
  const [{ data: rows }, { data: reversals }] = await Promise.all([
    allRows(db
      .from("cash_transactions")
      .select("id, amount, transaction_date, related_payout_id")
      .eq("tenant_id", tenantId)
      .eq("source_type", "manual")
      .eq("direction", "in")
      .overrideTypes<
        { id: string; amount: number; transaction_date: string; related_payout_id: string | null }[]
      >()),
    allRows(db
      .from("cash_transactions")
      .select("reversal_of")
      .eq("tenant_id", tenantId)
      .eq("source_type", "reversal")
      .overrideTypes<{ reversal_of: string | null }[]>()),
  ]);

  const dead = new Set(
    (reversals ?? []).map((r) => r.reversal_of).filter((v): v is string => Boolean(v))
  );

  return (rows ?? [])
    // الحركة المربوطة بتحويل قبل كده مابتتحسبش
    .filter((c) => !c.related_payout_id)
    // ⚠️ واللي اتلغت كمان — فلوسها مش في الرصيد
    .filter((c) => !dead.has(c.id))
    .map((c) => ({
      id: c.id,
      amount: Number(c.amount),
      date: String(c.transaction_date).slice(0, 10),
    }));
}
