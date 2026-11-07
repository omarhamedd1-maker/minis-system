import type { SupabaseClient } from "@supabase/supabase-js";
import { allRows } from "./fetch-all-pages";
import { moneyAtCourier, type AtCourier } from "./money-at-courier";

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

/**
 * «فلوس عند بوسطة» جاهزة للعرض — مصدر واحد لكل الشاشات.
 *
 * ⚠️ **الشاشات التلاتة كانت هتحسبه كل واحدة لوحدها** (الفلوس · التحويلات ·
 * صحة التشغيل)، وأول ما التعريف يتغيّر في واحدة بس بيبقى فيه رقمين
 * مختلفين لنفس السؤال.
 */
export async function loadAtCourier(
  db: SupabaseClient,
  tenantId: string,
  today: string
): Promise<AtCourier & { lastPayoutDate: string | null }> {
  const [{ data: last }, { data: orders }] = await Promise.all([
    db
      .from("courier_payouts")
      .select("payout_date")
      .eq("tenant_id", tenantId)
      .order("payout_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    allRows(db
      .from("orders")
      .select("bosta_cod, delivered_at")
      .eq("tenant_id", tenantId)
      .eq("order_status", "delivered")
      .overrideTypes<{ bosta_cod: number | null; delivered_at: string | null }[]>()),
  ]);
  const lastPayoutDate = (last?.payout_date as string | undefined) ?? null;
  return {
    ...moneyAtCourier({
      orders: (orders ?? []).map((o) => ({
        cod: Number(o.bosta_cod ?? 0),
        deliveredAt: o.delivered_at,
      })),
      lastPayoutDate,
      today,
    }),
    lastPayoutDate,
  };
}

/**
 * ==========================================================================
 * حركة الخزنة بتاعة التحويل — بتتعمل لوحدها (قرار عمر ٧ نوفمبر ٢٠٢٦)
 * --------------------------------------------------------------------------
 * قبل كده التحويل اللي مالوش حركة خزنة بنفس المبلغ كان بيقف على
 * «محتاج مراجعة» ويستنى حد يعمل الحركة بإيده. ودي كانت أكتر حاجة
 * بتوقّف التحويلات: ٢ سِك عندها ١٢٦ تحويل و٥١ حركة يدوية بس.
 *
 * دلوقتي الفلوس اللي بوسطة حوّلتها بتنزل الخزنة لوحدها.
 *
 * ⚠️ **`source_type = 'payout'` مش `'manual'`** — عشان تبان إنها جاية من
 * تحويل مش من إيد حد، وعشان متتعدّلش من شاشة الحركات اليدوية.
 *
 * ⚠️ **ومربوطة بالتحويل في الاتجاهين** (`related_payout_id` على الحركة،
 * و`cash_transaction_id` على التحويل). من غير الاتجاهين، إلغاء التحويل
 * مابيلاقيش حركته والفلوس بتفضل في الرصيد.
 * ==========================================================================
 */
export async function recordPayoutCash(
  db: SupabaseClient,
  input: {
    tenantId: string;
    payoutId: string;
    invoiceNumber: string | null;
    date: string;
    net: number;
    byName: string;
  }
): Promise<{ ok: true; cashId: string } | { ok: false; error: string }> {
  const { data, error } = await db
    .from("cash_transactions")
    .insert({
      // ⚠️ صريح — مفتاح الأدمن بيعدّي فوق قواعد العزل
      tenant_id: input.tenantId,
      direction: "in",
      amount: input.net,
      source_type: "payout",
      transaction_date: input.date,
      related_payout_id: input.payoutId,
      description: `تحويل بوسطة${input.invoiceNumber ? ` ${input.invoiceNumber}` : ""}`,
      created_by_name: input.byName,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "معرفناش نسجّل حركة الخزنة" };
  }

  const cashId = data.id as string;
  const { error: linkError } = await db
    .from("courier_payouts")
    .update({ cash_transaction_id: cashId })
    .eq("tenant_id", input.tenantId)
    .eq("id", input.payoutId);

  /*
    ⚠️⚠️ **الحركة مابتتمسحش لو الربط فشل.**

    الحركة اتعملت فعلًا والفلوس بقت في الرصيد — ومسحها بيخالف قاعدة
    السيستم (MONEY §٦.٢: الحركات بتتلغى بحركة عكسية، مابتتمسحش).
    وفيه اختبار بيقع لو حد حاول (`lib/cash-reversal.test.ts`).

    وهي مش ضايعة: `related_payout_id` اتكتب عليها وقت الإنشاء، فالحركة
    عارفة تحويلها حتى لو التحويل مش عارف حركته. والتحويل بيتعلّم
    «محتاج مراجعة» من اللي بينده، فالنقص بيبان مش بيختفي.
  */
  if (linkError) return { ok: false, error: linkError.message };

  return { ok: true, cashId };
}
