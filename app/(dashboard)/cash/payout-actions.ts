"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission, type SessionUser } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { auditFields, reverseCashRows } from "@/lib/cash-reversal";
import { cairoToday } from "@/lib/format";
import { allRows } from "@/lib/fetch-all-pages";
import { parseStatement, type LedgerLine } from "@/lib/payout-statement";
import { planImport, type ImportPlan } from "@/lib/payout-import";
import { linkToManualCash, ROUNDING_TOLERANCE } from "@/lib/payout-match";
import { liveManualCash } from "@/lib/payout-cash";
import { matchPayout } from "@/lib/payout-match";
import { parsePayoutEmail } from "@/lib/payout-email";

/**
 * ==========================================================================
 * استيراد كشف محفظة شركة الشحن (TRANSFERS §٩.١ · الخطوة ٣)
 * --------------------------------------------------------------------------
 * ⛔⛔ **مافيش حركة خزنة بتتعمل هنا خالص.** التحويلات القديمة متسجّلة
 * حركات يدوية، والاستيراد **بيربط** بيها. اللي مالوش حركة بيتسجّل
 * «محتاج مراجعة» ومستني دوسة.
 *
 * المعاينة والتسجيل بياخدوا **نفس النص**، والخطة بتتحسب من الأول في
 * الاتنين — فاللي شفته هو اللي بيتسجّل، ومفيش حالة متخزّنة بينهم.
 * ==========================================================================
 */

const COURIER = "bosta";

type Loaded = {
  plan: ImportPlan;
  /** بنود الكشف الكامل — رسوم وتعويضات (§٧.١) */
  ledger: LedgerLine[];
  /** مبلغ التحصيل لكل أوردر — بيتسجّل على صف الربط */
  codById: Map<string, number>;
  problems: { line: number; reason: string; raw: string }[];
  columns: Record<string, string | undefined>;
};

async function buildPlan(text: string, tenantId: string): Promise<Loaded> {
  const statement = parseStatement(text);
  const db = createAdminClient();

  const [orders, cash, payouts, linked] = await Promise.all([
    allRows(db
      .from("orders")
      .select("id, bosta_cod, delivered_at")
      .eq("tenant_id", tenantId)
      .eq("order_status", "delivered")
      .overrideTypes<{ id: string; bosta_cod: number | null; delivered_at: string | null }[]>()),
    // ⚠️ **الملغي مش مرشّح** — `lib/payout-cash.ts`
    liveManualCash(db, tenantId),
    allRows(db
      .from("courier_payouts")
      .select("invoice_number")
      .eq("tenant_id", tenantId)
      .eq("courier", COURIER)
      .overrideTypes<{ invoice_number: string }[]>()),
    allRows(db
      .from("courier_payout_orders")
      .select("order_id")
      .eq("tenant_id", tenantId)
      .overrideTypes<{ order_id: string }[]>()),
  ]);

  // الأوردر اللي مربوط بتحويل قبل كده مابيدخلش المطابقة تاني
  const taken = new Set((linked.data ?? []).map((r) => r.order_id));

  const plan = planImport(statement.rows, {
    candidates: (orders.data ?? [])
      .filter((o) => !taken.has(o.id))
      .map((o) => ({
        orderId: o.id,
        cod: Number(o.bosta_cod ?? 0),
        deliveredAt: o.delivered_at,
      })),
    // الحيّة المش مربوطة بس (الفلترة جوّه `liveManualCash`)
    manualCash: cash,
    existingInvoices: new Set((payouts.data ?? []).map((p) => p.invoice_number)),
    // ⚠️ السماح ده للاستيراد التاريخي بس (تقريب الحركات اليدوية)
    tolerance: ROUNDING_TOLERANCE,
    // ⚠️ والأوردرات بتتربط من الإيميل — الكشف مافيهوش عددها (قرار ١٨ سبتمبر)
    matchOrders: false,
  });

  return {
    plan,
    ledger: statement.ledger,
    codById: new Map((orders.data ?? []).map((o) => [o.id, Number(o.bosta_cod ?? 0)])),
    problems: statement.problems,
    columns: statement.columns,
  };
}

export type PreviewResult =
  | {
      ok: true;
      plan: ImportPlan;
      problems: Loaded["problems"];
      columns: Loaded["columns"];
      /** عدد بنود الرسوم في الملف — صفر يعني الكشف مقصوص (§٧.١) */
      ledgerCount: number;
    }
  | { ok: false; error: string };

/** معاينة — **مابتكتبش حاجة** */
export async function previewPayoutImport(text: string): Promise<PreviewResult> {
  const me = await requirePermission("cash.edit");
  try {
    const { plan, problems, columns, ledger } = await buildPlan(text, me.tenantId);
    return { ok: true, plan, problems, columns, ledgerCount: ledger.length };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type ApplyResult =
  | { ok: true; saved: number; needsReview: number; skipped: number }
  | { ok: false; error: string };

/**
 * التسجيل: صفوف التحويلات وربطها بالأوردرات وبالحركات الموجودة.
 *
 * ⚠️ **مافيش حركة خزنة جديدة، ومفيش مبلغ حركة بيتعدّل.** أقصى اللي بيحصل
 * على الخزنة هو إن الحركة الموجودة بتعرف تحويلها.
 */
export async function applyPayoutImport(text: string): Promise<ApplyResult> {
  const me = await requirePermission("cash.edit");
  const db = createAdminClient();
  let saved = 0;
  let needsReview = 0;
  let skipped = 0;

  try {
    const { plan, codById, ledger } = await buildPlan(text, me.tenantId);

    for (const line of plan.rows) {
      if (line.status === "duplicate") {
        skipped++;
        continue;
      }
      const linkedCash =
        line.cash && line.cash.kind === "linked" ? line.cash.cashId : null;

      const { data: payout, error } = await db
        .from("courier_payouts")
        .insert({
          // ⚠️ **مش زيادة** — مفتاح الأدمن مالوش مستخدم داخل، والقيمة
          // الافتراضية في الداتابيز بترجّع بيزنس عمر
          tenant_id: me.tenantId,
          courier: COURIER,
          invoice_number: line.row.invoiceNumber,
          payout_date: line.row.date,
          gross_amount: line.row.gross,
          fees_amount: line.row.fees,
          net_amount: line.row.net,
          order_count: line.row.orderCount,
          status: line.status === "matched" ? "matched" : "needs_review",
          review_reason: line.reason ?? null,
          cash_transaction_id: linkedCash,
          // فرق التقريب بيتسجّل — هو فرق حقيقي في الرصيد
          rounding_diff:
            line.cash && line.cash.kind === "linked" ? (line.cash.rounding ?? 0) : 0,
          source: "import",
          created_by_name: me.fullName ?? me.email ?? null,
        })
        .select("id")
        .single();

      if (error || !payout) {
        // رقم فاتورة اتسجّل في نفس اللحظة من رفعة تانية — بيتعدّى
        skipped++;
        continue;
      }

      if (line.orderIds.length > 0) {
        // نصيب الأوردر من الرسوم بالنسبة لمبلغه — للعرض بس (§٧)
        const gross = line.row.gross || 1;
        const links = line.orderIds.map((orderId) => {
          const cod = codById.get(orderId) ?? 0;
          return {
            payout_id: payout.id as string,
            order_id: orderId,
            cod_amount: cod,
            fee_amount: Math.round(((line.row.fees * cod) / gross) * 100) / 100,
          };
        });
        // ⚠️ **`tenant_id` صريح** — مفتاح الأدمن بيعدّي فوق قواعد العزل،
        // والقيمة الافتراضية في الداتابيز بترجّع بيزنس عمر
        await db.from("courier_payout_orders").insert(
          links.map((l) => ({ tenant_id: me.tenantId, ...l }))
        );
        // وصلت فلوسها فعلًا — ودي الخانة اللي كل الشاشات بتسأل عليها
        await db
          .from("orders")
          .update({ cash_received_at: line.row.date })
          .eq("tenant_id", me.tenantId)
          .in("id", line.orderIds);
      }

      if (linkedCash) {
        await db
          .from("cash_transactions")
          .update({ related_payout_id: payout.id as string })
          .eq("tenant_id", me.tenantId)
          .eq("id", linkedCash);
      }

      if (line.status === "matched") saved++;
      else needsReview++;
    }

    /**
     * ⚠️ **بنود الرسوم بتتخزّن هنا** — لو الكشف مقصوص (٣ أعمدة) القايمة
     * فاضية ومفيش حاجة بتتكتب، والاستيراد بيفضل شغّال زي ما هو (§٧.١).
     */
    let feeLines = 0;
    if (ledger.length > 0) {
      // ⚠️ الكشف بينزل كامل كل مرة — فالموجود بيتعدّى بالمفتاح الفريد
      const { error: feeError } = await db.from("courier_fee_lines").upsert(
        ledger.map((l) => ({
          // ⚠️ **tenant_id صريح** — مفتاح الأدمن بيعدّي فوق قواعد العزل
          tenant_id: me.tenantId,
          courier: COURIER,
          txn_id: l.txnId,
          line_date: l.date,
          category: l.category,
          amount: l.amount,
        })),
        { onConflict: "tenant_id,courier,txn_id", ignoreDuplicates: true }
      );
      // الجدول لسه ماتعملش؟ التحويلات اتسجّلت خلاص — مانوقعش الاستيراد
      if (!feeError) feeLines = ledger.length;
    }

    await logActivity(
      me,
      "payout.import",
      `استورد كشف المحفظة: ${saved} مطابق · ${needsReview} محتاج مراجعة · ${skipped} متسجّل قبل كده` +
        (feeLines > 0 ? ` · ${feeLines} بند رسوم` : "")
    );
    revalidatePath("/cash");
    return { ok: true, saved, needsReview, skipped };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * ==========================================================================
 * المراجعة اليدوية (TRANSFERS §٨ · الخطوة ٤)
 * --------------------------------------------------------------------------
 * التلات حالات اللي الاستيراد بيسيبها مفتوحة:
 *   · **ناقص** — مفيش حركة خزنة بالمبلغ. الدوسة هي اللي بتعمل الحركة.
 *   · **فرق** — الحركة اليدوية مكتوبة برقم مختلف. يا يتصلّح **بحركة عكسية
 *     وحركة صح** (MONEY §٦.٢) يا يتقبل زي ما هو بسببه مكتوب.
 *   · **مربوط** — خلاص، مفيش شغل.
 *
 * ⚠️ **الحركة بتتعمل بدوسة بس** — الاستيراد نفسه عمره ما بيغيّر رصيد.
 * ==========================================================================
 */

type PayoutRow = {
  id: string;
  invoice_number: string;
  payout_date: string;
  net_amount: number;
  cash_transaction_id: string | null;
};

async function loadPayout(db: ReturnType<typeof createAdminClient>, tenantId: string, id: string) {
  const { data } = await db
    .from("courier_payouts")
    .select("id, invoice_number, payout_date, net_amount, cash_transaction_id")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  return (data ?? null) as PayoutRow | null;
}

/** حركة الخزنة بتاعة التحويل — نفس الشكل في كل الأفعال */
function payoutCashRow(p: PayoutRow, me: SessionUser) {
  return {
    direction: "in",
    amount: Number(p.net_amount),
    source_type: "payout",
    description: `تحويل ${p.invoice_number}`,
    transaction_date: p.payout_date,
    related_payout_id: p.id,
    ...auditFields(me, "app"),
  };
}

export type ReviewResult = { ok: true; message: string } | { ok: false; error: string };

/** «ناقص» → اعمل الحركة */
export async function createPayoutCash(payoutId: string): Promise<ReviewResult> {
  const me = await requirePermission("cash.edit");
  const db = createAdminClient();
  const p = await loadPayout(db, me.tenantId, payoutId);
  if (!p) return { ok: false, error: "التحويل ده مش موجود" };
  if (p.cash_transaction_id) return { ok: false, error: "التحويل ده مربوط بحركة خلاص" };

  const { data: row, error } = await db
    .from("cash_transactions")
    .insert({
      // ⚠️ **tenant_id صريح** — مفتاح الأدمن بيعدّي فوق قواعد العزل
      tenant_id: me.tenantId,
      ...payoutCashRow(p, me),
    })
    .select("id")
    .single();
  if (error || !row) return { ok: false, error: "معرفناش نعمل الحركة: " + (error?.message ?? "") };

  await db
    .from("courier_payouts")
    .update({ cash_transaction_id: row.id as string, status: "confirmed", review_reason: null })
    .eq("tenant_id", me.tenantId)
    .eq("id", p.id);
  await logActivity(me, "payout.cash", `عمل حركة خزنة لتحويل ${p.invoice_number} بمبلغ ${p.net_amount}`);
  revalidatePath("/cash");
  return { ok: true, message: `اتعملت حركة بمبلغ ${p.net_amount}` };
}

/**
 * «فرق» → الحركة القديمة تتلغي بحركة عكسية، وتتعمل حركة بالرقم الحقيقي.
 *
 * ⚠️ **مش تعديل في مكانه** — الدفتر لازم يفضل فيه أثر إن الرقم كان غلط
 * ومين صلّحه (MONEY §٦.٢).
 */
export async function fixPayoutCash(payoutId: string, cashId: string): Promise<ReviewResult> {
  const me = await requirePermission("cash.edit");
  const db = createAdminClient();
  const p = await loadPayout(db, me.tenantId, payoutId);
  if (!p) return { ok: false, error: "التحويل ده مش موجود" };

  const reversed = await reverseCashRows(db, me.tenantId, [cashId], me, cairoToday());
  if (reversed.error) return { ok: false, error: "معرفناش نلغي الحركة القديمة: " + reversed.error };

  const { data: row, error } = await db
    .from("cash_transactions")
    .insert({
      // ⚠️ **tenant_id صريح** — مفتاح الأدمن بيعدّي فوق قواعد العزل
      tenant_id: me.tenantId,
      ...payoutCashRow(p, me),
    })
    .select("id")
    .single();
  if (error || !row) return { ok: false, error: "معرفناش نعمل الحركة الجديدة: " + (error?.message ?? "") };

  await db
    .from("courier_payouts")
    .update({
      cash_transaction_id: row.id as string,
      status: "confirmed",
      review_reason: "اتصلّحت بحركة عكسية وحركة بالرقم الحقيقي",
    })
    .eq("tenant_id", me.tenantId)
    .eq("id", p.id);
  await logActivity(me, "payout.fix", `صلّح حركة تحويل ${p.invoice_number} للرقم ${p.net_amount}`);
  revalidatePath("/cash");
  return { ok: true, message: `اتصلّحت — الحركة القديمة اتلغت والجديدة بـ${p.net_amount}` };
}

/** «فرق» → سيبها زي ما هي، والفرق بيتكتب على التحويل */
export async function acceptPayoutDiff(payoutId: string, cashId: string, difference: number): Promise<ReviewResult> {
  const me = await requirePermission("cash.edit");
  const db = createAdminClient();
  const p = await loadPayout(db, me.tenantId, payoutId);
  if (!p) return { ok: false, error: "التحويل ده مش موجود" };

  const { error } = await db
    .from("courier_payouts")
    .update({
      cash_transaction_id: cashId,
      status: "confirmed",
      rounding_diff: difference,
      review_reason: `الفرق ${difference} اتقبل زي ما هو`,
    })
    .eq("tenant_id", me.tenantId)
    .eq("id", p.id);
  if (error) return { ok: false, error: "معرفناش نحفظ: " + error.message };

  await logActivity(me, "payout.accept", `قبل فرق ${difference} في تحويل ${p.invoice_number}`);
  revalidatePath("/cash");
  return { ok: true, message: "اتقبل الفرق" };
}

/**
 * إضافة تحويل بالإيد (TRANSFERS §٩).
 *
 * ⚠️ **لازمتها:** الكشف بينزل مرة كل فترة، والإيميل لسه مش موصّل — فالتحويل
 * اللي حصل النهاردة مالوش طريق يدخل بيه. من غير ده الخزنة بتفضل فيها حركة
 * يدوية مالهاش مصدر.
 *
 * ⚠️ **ومابتعملش حركة خزنة.** بتربط بالحركة الموجودة لو لقتها (بنفس سماح
 * الاستيراد — تقريب الجنيه)، وإلا بتتسجّل «ناقص» ودوسة «اعمل حركة» هي اللي
 * بتعمل الفلوس.
 */
export async function addPayoutManually(formData: FormData): Promise<ReviewResult> {
  const me = await requirePermission("cash.edit");
  const db = createAdminClient();

  const date = String(formData.get("payout_date") ?? "").slice(0, 10);
  const amount = Number(formData.get("net_amount"));
  const typed = String(formData.get("invoice_number") ?? "").trim();
  const fees = Number(formData.get("fees_amount") ?? 0) || 0;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "اكتب التاريخ ومبلغ أكبر من صفر" };
  }

  // رقم الفاتورة من بوسطة لو معاك، وإلا رقم من التاريخ عشان مايتكررش
  const invoice = typed || `MANUAL${date.replace(/-/g, "")}`;

  const { data: exists } = await db
    .from("courier_payouts")
    .select("id")
    .eq("tenant_id", me.tenantId)
    .eq("invoice_number", invoice)
    .maybeSingle();
  if (exists) return { ok: false, error: `${invoice} متسجّل قبل كده` };

  // حركة يدوية داخلة في نفس اليوم (± يوم) مش مربوطة بتحويل تاني
  // ⚠️ **والملغية مش مرشّحة** — `lib/payout-cash.ts`
  const cash = await liveManualCash(db, me.tenantId);
  const link = linkToManualCash({ net: amount, date }, cash, new Set(), ROUNDING_TOLERANCE);
  const linked = link.kind === "linked" ? link.cashId : null;

  // ⚠️⚠️ **مفيش حركة بالمبلغ ده؟ مايتسجّلش أصلًا** (قرار عمر ٢١ سبتمبر).
  //
  // التحويل اللي بيتسجّل من غير حركة بيفتح باب الازدواج: بتسجّله، تنسى
  // الحركة، وبعدين تدوس «اعمل حركة» وتكون سجّلتها بإيدك برضه. والترتيب
  // الصح إن الفلوس تتسجّل الأول لأنها هي اللي حصلت فعلًا.
  if (!linked) {
    return {
      ok: false,
      error:
        link.kind === "diff"
          ? `أقرب حركة في نفس اليوم فرقها ${link.difference} — راجع المبلغ أو سجّل الحركة الصح الأول`
          : "مفيش حركة خزنة بالمبلغ ده — سجّلها الأول من تاب الحركات",
    };
  }

  const { data: payout, error } = await db
    .from("courier_payouts")
    .insert({
      // ⚠️ **tenant_id صريح** — مفتاح الأدمن بيعدّي فوق قواعد العزل
      tenant_id: me.tenantId,
      courier: COURIER,
      invoice_number: invoice,
      payout_date: date,
      gross_amount: Math.round((amount + fees) * 100) / 100,
      fees_amount: fees,
      net_amount: amount,
      order_count: null,
      status: "confirmed",
      review_reason: null,
      cash_transaction_id: linked,
      rounding_diff: link.kind === "linked" ? (link.rounding ?? 0) : 0,
      source: "manual",
      created_by_name: me.fullName ?? me.email ?? null,
    })
    .select("id")
    .single();

  if (error || !payout) return { ok: false, error: "معرفناش نسجّل التحويل: " + (error?.message ?? "") };

  if (linked) {
    await db
      .from("cash_transactions")
      .update({ related_payout_id: payout.id as string })
      .eq("tenant_id", me.tenantId)
      .eq("id", linked);
  }

  await logActivity(me, "payout.manual", `سجّل تحويل ${invoice} بمبلغ ${amount}`);
  revalidatePath("/cash");
  return { ok: true, message: "اتسجّل واتربط بالحركة الموجودة" };
}

// ==========================================================================
// تلات أفعال على التحويل — ومافيش فيهم «حذف» (قرار عمر ٢١ سبتمبر)
// --------------------------------------------------------------------------
// ⚠️⚠️ **الحذف ممنوع في سجل مالي** (نفس قاعدة MONEY §٦.٢): بيغيّر الرصيد
// بأثر رجعي ومحدش يعرف ليه. فالفعل بيتسمّى باللي بيعمله:
//
//   فُك الربط    ← الحركة تفضل زي ما هي، والتحويل يرجع «محتاج مراجعة»
//   ألغِ التحويل ← يتشال، **وحركته هو** تتلغي بحركة عكسية
//   أخفِ         ← يتأرشف ويفضل في التاريخ وفي الحسابات
// ==========================================================================

/**
 * «فُك الربط» — التحويل بيسيب الحركة.
 *
 * ⚠️ **الحركة مابتتلمسش خالص** — الفلوس دخلت فعلًا، إحنا بس بنقول إن
 * الحركة دي مش بتاعة التحويل ده. الرصيد ما بيتغيّرش ولا مليم.
 */
export async function unlinkPayoutCash(payoutId: string): Promise<ReviewResult> {
  const me = await requirePermission("cash.edit");
  const db = createAdminClient();
  const p = await loadPayout(db, me.tenantId, payoutId);
  if (!p) return { ok: false, error: "التحويل ده مش موجود" };
  if (!p.cash_transaction_id) return { ok: false, error: "التحويل ده مش مربوط بحركة أصلًا" };

  const { error } = await db
    .from("courier_payouts")
    .update({
      cash_transaction_id: null,
      status: "needs_review",
      review_reason: "اتفك ربطه بالإيد — الحركة سايبة زي ما هي",
    })
    .eq("tenant_id", me.tenantId)
    .eq("id", p.id);
  if (error) return { ok: false, error: "معرفناش نفك الربط: " + error.message };

  await logActivity(me, "payout.unlink", `فك ربط تحويل ${p.invoice_number} عن حركة الخزنة`);
  revalidatePath("/cash");
  return { ok: true, message: "اتفك الربط — الحركة والرصيد زي ما هما" };
}

/**
 * «ألغِ التحويل» — الصف بيتشال، والفلوس بترجع صح.
 *
 * ⚠️⚠️ **الحركة العكسية بتتعمل للي السيستم عمله بس** (`source_type` =
 * `payout`). لو التحويل كان مربوط بحركة **موجودة قبله** (إيداع يدوي
 * مثلًا)، إلغاؤه مايلمسش الفلوس — الفلوس دي اتسجّلت لوحدها، وعكسها
 * كان هيشيل مبلغ حقيقي من الرصيد.
 *
 * ⚠️ **والحركة اللي اتلغت قبل كده مابتتعكسش تاني** — `reverseCashRows`
 * بيتأكد من ده، وده اللي بيمنع الخصم مرتين.
 */
export async function cancelPayout(payoutId: string): Promise<ReviewResult> {
  const me = await requirePermission("cash.edit");
  const db = createAdminClient();
  const p = await loadPayout(db, me.tenantId, payoutId);
  if (!p) return { ok: false, error: "التحويل ده مش موجود" };

  let reversedCount = 0;
  let ownCash = false;
  if (p.cash_transaction_id) {
    const { data: cash } = await db
      .from("cash_transactions")
      .select("id, source_type")
      .eq("tenant_id", me.tenantId)
      .eq("id", p.cash_transaction_id)
      .maybeSingle();
    ownCash = String(cash?.source_type ?? "") === "payout";
    if (ownCash) {
      const r = await reverseCashRows(db, me.tenantId, [p.cash_transaction_id], me, cairoToday());
      if (r.error) return { ok: false, error: "معرفناش نلغي الحركة: " + r.error };
      reversedCount = r.reversed;
    }
  }

  // الأوردرات بترجع «لسه مااتحصّلتش» — الصف نفسه بيتشال بالـcascade
  const { data: links } = await allRows(db
    .from("courier_payout_orders")
    .select("order_id")
    .eq("tenant_id", me.tenantId)
    .eq("payout_id", p.id)
    .overrideTypes<{ order_id: string }[]>());
  const orderIds = (links ?? []).map((l) => l.order_id as string);
  if (orderIds.length > 0) {
    await db
      .from("orders")
      .update({ cash_received_at: null })
      .eq("tenant_id", me.tenantId)
      .in("id", orderIds);
  }

  const { error } = await db
    .from("courier_payouts")
    .delete()
    .eq("tenant_id", me.tenantId)
    .eq("id", p.id);
  if (error) return { ok: false, error: "معرفناش نشيل التحويل: " + error.message };

  await logActivity(
    me,
    "payout.cancel",
    `ألغى تحويل ${p.invoice_number} بمبلغ ${p.net_amount}` +
      (reversedCount > 0 ? " — واتعملت حركة عكسية" : " — من غير حركة عكسية")
  );
  revalidatePath("/cash");
  revalidatePath("/orders");

  const money =
    reversedCount > 0
      ? `والحركة اتلغت بعكسية (الرصيد نقص ${p.net_amount})`
      : ownCash
        ? "وحركته كانت متلغية قبل كده — الرصيد زي ما هو"
        : "والحركة المربوطة سايبة زي ما هي — الرصيد زي ما هو";
  return {
    ok: true,
    message: `التحويل اتشال${orderIds.length > 0 ? ` و${orderIds.length} أوردر رجعوا مستنيين` : ""} ${money}`,
  };
}

/**
 * «أخفِ» — بيتأرشف.
 *
 * ⚠️ **مش حذف ومش حالة**: التحويل لسه في التاريخ ولسه مربوط ولسه محسوب،
 * هو بس مش ظاهر في التاب. اللي بيتخفي بيرجع بدوسة.
 */
export async function archivePayout(payoutId: string, archived: boolean): Promise<ReviewResult> {
  const me = await requirePermission("cash.edit");
  const db = createAdminClient();
  const p = await loadPayout(db, me.tenantId, payoutId);
  if (!p) return { ok: false, error: "التحويل ده مش موجود" };

  const { error } = await db
    .from("courier_payouts")
    .update({ archived })
    .eq("tenant_id", me.tenantId)
    .eq("id", p.id);
  // ⚠️ **العمود لسه ممكن مايكونش اتعمل** (`sql/transfers-04-actions.sql`).
  // القراية بترجع `42703`، لكن **الكتابة بترجع `PGRST204`** ونصها بيسمّي
  // العمود — فالاتنين لازم يتمسكوا، وإلا الرسالة بتطلع تقنية ومالهاش معنى.
  if (error) {
    const missing =
      error.code === "42703" ||
      error.code === "PGRST204" ||
      /archived/i.test(error.message ?? "");
    return {
      ok: false,
      error: missing
        ? "الإخفاء محتاج sql/transfers-04-actions.sql يتشغّل الأول"
        : "معرفناش نخفيه: " + error.message,
    };
  }

  await logActivity(me, "payout.archive", `${archived ? "خفى" : "رجّع"} تحويل ${p.invoice_number}`);
  revalidatePath("/cash");
  return { ok: true, message: archived ? "اتخفى — لسه في التاريخ" : "رجع يبان" };
}

/**
 * «جرّب المطابقة تاني» — بيعيد قراية الإيميل المتخزّن ويطابق من جديد.
 *
 * ⚠️⚠️ **التحويل اللي اتسجّل بقراية ناقصة بيفضل ناقص للأبد.** حصل على
 * `MONCOD21SEP26`: بوسطة بتترجم «orders» لـ«أمرًا»، والقارئ كان بيدوّر
 * على «أوردر/شحن/طلب» — فالعدد طلع فاضي والتحويل اتسجّل بـ**صفر أوردرات**
 * رغم إن التلاتة موجودين ومجموعهم بالمليم.
 *
 * فأي تحسين في القارئ لازم يكون ليه طريق يتطبّق على اللي اتسجّل — غير كده
 * كل إصلاح بيخدم الجاي بس، واللي فات بيفضل غلط.
 *
 * ⚠️ **مابيلمسش فلوس** — بيربط أوردرات ويصحّح العدد والحالة بس.
 */
export async function rematchPayout(payoutId: string): Promise<ReviewResult> {
  const me = await requirePermission("cash.edit");
  const db = createAdminClient();
  const { data: p } = await db
    .from("courier_payouts")
    .select("id, invoice_number, payout_date, gross_amount, order_count")
    .eq("tenant_id", me.tenantId)
    .eq("id", payoutId)
    .maybeSingle();
  if (!p) return { ok: false, error: "التحويل ده مش موجود" };

  // العدد من الصف، وإلا من الإيميل المتخزّن بعد ما القارئ اتحسّن
  let count = p.order_count as number | null;
  if (count === null) {
    const { data: mails } = await allRows(db
      .from("courier_payout_emails")
      .select("raw")
      .eq("tenant_id", me.tenantId)
      .ilike("raw", `%${p.invoice_number}%`)
      .overrideTypes<{ raw: string | null }[]>());
    for (const m of mails ?? []) {
      const again = parsePayoutEmail(String(m.raw ?? ""));
      if (again.ok && again.payout.orderCount) {
        count = again.payout.orderCount;
        break;
      }
    }
  }

  const [{ data: orders }, { data: taken }] = await Promise.all([
    allRows(db
      .from("orders")
      .select("id, bosta_cod, delivered_at")
      .eq("tenant_id", me.tenantId)
      .eq("order_status", "delivered")
      .overrideTypes<{ id: string; bosta_cod: number | null; delivered_at: string | null }[]>()),
    allRows(db
      .from("courier_payout_orders")
      .select("order_id")
      .eq("tenant_id", me.tenantId)
      .overrideTypes<{ order_id: string }[]>()),
  ]);
  const used = new Set((taken ?? []).map((t) => t.order_id));
  const match = matchPayout(
    { gross: Number(p.gross_amount), count, date: p.payout_date as string },
    (orders ?? [])
      .filter((o) => !used.has(o.id))
      .map((o) => ({ orderId: o.id, cod: Number(o.bosta_cod ?? 0), deliveredAt: o.delivered_at }))
  );

  if (!match.ok) {
    await db
      .from("courier_payouts")
      .update({ order_count: count, review_reason: match.reason })
      .eq("tenant_id", me.tenantId)
      .eq("id", p.id);
    return { ok: false, error: match.reason };
  }

  const codOf = new Map((orders ?? []).map((o) => [o.id, Number(o.bosta_cod ?? 0)]));
  // ⚠️ **tenant_id صريح** — مفتاح الأدمن بيعدّي فوق قواعد العزل
  await db.from("courier_payout_orders").insert(
    match.orderIds.map((orderId) => ({
      tenant_id: me.tenantId,
      payout_id: p.id as string,
      order_id: orderId,
      cod_amount: codOf.get(orderId) ?? 0,
      fee_amount: 0,
    }))
  );
  await db
    .from("orders")
    .update({ cash_received_at: p.payout_date })
    .eq("tenant_id", me.tenantId)
    .in("id", match.orderIds);
  await db
    .from("courier_payouts")
    .update({
      order_count: count,
      status: "matched",
      review_reason: null,
      // ⚠️ النافذة الزمنية نتيجتها **مرجّحة** مش مؤكدة
      match_confidence: match.how === "window" ? "likely" : "exact",
    })
    .eq("tenant_id", me.tenantId)
    .eq("id", p.id);

  await logActivity(
    me,
    "payout.rematch",
    `طابق تحويل ${p.invoice_number} من جديد — ${match.orderIds.length} أوردر (${match.how})`
  );
  revalidatePath("/cash");
  revalidatePath("/orders");
  return { ok: true, message: `اتطابق ${match.orderIds.length} أوردر` };
}

// ==========================================================================
// «صلّح كل الفروق» — التقريب اللي اتراكم على الحركات اليدوية
// --------------------------------------------------------------------------
// ⚠️⚠️ **الفرق ده مش شكلي — هو فرق حقيقي في الرصيد.** التحويلات القديمة
// اتسجّلت بإيد بأرقام مقرّبة (٥,٦٩١ بدل ٥,٦٩١٫١٥)، والاستيراد ربطها
// بالتحويل وسجّل الفرق بدل ما يعدّل الحركة. المجموع بيتراكم.
//
// ⚠️ **والتصليح بحركة عكسية + حركة بالرقم الصح** مش تعديل في مكانه
// (MONEY §٦.٢) — الدفتر لازم يفضل فيه أثر إن الرقم كان غلط ومين صلّحه.
//
// ⚠️ **والمعاينة بتتحسب من الحركة نفسها مش من `rounding_diff`** — العمود
// المتخزّن ممكن يكون اتكتب غلط، والحركة هي الحقيقة.
// ==========================================================================

export type RoundingRow = {
  payoutId: string;
  invoice: string;
  cashId: string;
  /** اللي متسجّل دلوقتي في الخزنة */
  oldAmount: number;
  /** اللي بوسطة حوّلته فعلًا */
  newAmount: number;
  difference: number;
};

export type RoundingPreview =
  | { ok: true; rows: RoundingRow[]; total: number }
  | { ok: false; error: string };

/** المعاينة — **مابتكتبش حاجة** */
export async function previewRoundingFixes(): Promise<RoundingPreview> {
  const me = await requirePermission("cash.edit");
  const db = createAdminClient();

  const { data: payouts } = await allRows(db
    .from("courier_payouts")
    .select("id, invoice_number, net_amount, cash_transaction_id")
    .eq("tenant_id", me.tenantId)
    .not("cash_transaction_id", "is", null)
    .overrideTypes<
      { id: string; invoice_number: string; net_amount: number; cash_transaction_id: string }[]
    >());

  const ids = (payouts ?? []).map((p) => p.cash_transaction_id);
  if (ids.length === 0) return { ok: true, rows: [], total: 0 };

  const [{ data: cash }, { data: reversals }] = await Promise.all([
    allRows(db
      .from("cash_transactions")
      .select("id, amount")
      .eq("tenant_id", me.tenantId)
      .in("id", ids)
      .overrideTypes<{ id: string; amount: number }[]>()),
    allRows(db
      .from("cash_transactions")
      .select("reversal_of")
      .eq("tenant_id", me.tenantId)
      .in("reversal_of", ids)
      .overrideTypes<{ reversal_of: string }[]>()),
  ]);
  const amountOf = new Map((cash ?? []).map((c) => [c.id, Number(c.amount)]));
  // ⚠️ اللي اتلغت خلاص برّه — تصليحها هيعمل عكسية تانية على حاجة ملغية
  const dead = new Set((reversals ?? []).map((r) => r.reversal_of));

  const rows: RoundingRow[] = [];
  for (const p of payouts ?? []) {
    if (dead.has(p.cash_transaction_id)) continue;
    const old = amountOf.get(p.cash_transaction_id);
    if (old === undefined) continue;
    const next = Number(p.net_amount);
    const diff = Math.round((next - old) * 100) / 100;
    if (diff === 0) continue;
    rows.push({
      payoutId: p.id,
      invoice: p.invoice_number,
      cashId: p.cash_transaction_id,
      oldAmount: old,
      newAmount: next,
      difference: diff,
    });
  }
  const total = Math.round(rows.reduce((s, r) => s + r.difference, 0) * 100) / 100;
  return { ok: true, rows, total };
}

export type RoundingApply =
  | { ok: true; fixed: number; total: number; failed: number }
  | { ok: false; error: string };

/**
 * التنفيذ — كل تحويل: حركة عكسية للقديمة، وحركة بالرقم الصح.
 *
 * ⚠️ **كل تعديل بيتسجّل في النشاط بالقيمة القديمة والجديدة** (شرط عمر) —
 * مش سطر واحد بيقول «اتصلّح ٢٣»، لأن ده مابيسمحش بمراجعة واحد فيهم.
 */
export async function fixAllRounding(): Promise<RoundingApply> {
  const me = await requirePermission("cash.edit");
  const db = createAdminClient();
  const preview = await previewRoundingFixes();
  if (!preview.ok) return { ok: false, error: preview.error };
  if (preview.rows.length === 0) return { ok: true, fixed: 0, total: 0, failed: 0 };

  const today = cairoToday();
  let fixed = 0;
  let failed = 0;
  let applied = 0;

  for (const r of preview.rows) {
    const p = await loadPayout(db, me.tenantId, r.payoutId);
    if (!p) { failed++; continue; }

    const reversed = await reverseCashRows(db, me.tenantId, [r.cashId], me, today);
    if (reversed.error) { failed++; continue; }

    const { data: row, error } = await db
      .from("cash_transactions")
      .insert({
        // ⚠️ **tenant_id صريح** — مفتاح الأدمن بيعدّي فوق قواعد العزل
        tenant_id: me.tenantId,
        ...payoutCashRow(p, me),
      })
      .select("id")
      .single();
    if (error || !row) { failed++; continue; }

    await db
      .from("courier_payouts")
      .update({
        cash_transaction_id: row.id as string,
        status: "confirmed",
        rounding_diff: 0,
        review_reason: null,
      })
      .eq("tenant_id", me.tenantId)
      .eq("id", p.id);

    await logActivity(
      me,
      "payout.rounding",
      `صلّح تقريب تحويل ${r.invoice}: ${r.oldAmount} ← ${r.newAmount} (فرق ${r.difference})`
    );
    fixed++;
    applied = Math.round((applied + r.difference) * 100) / 100;
  }

  await logActivity(
    me,
    "payout.rounding.all",
    `صلّح ${fixed} فرق تقريب بمجموع ${applied}` + (failed ? ` · ${failed} مااتصلّحوش` : "")
  );
  revalidatePath("/cash");
  return { ok: true, fixed, total: applied, failed };
}
