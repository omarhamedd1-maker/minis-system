"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission, type SessionUser } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { auditFields, reverseCashRows } from "@/lib/cash-reversal";
import { cairoToday } from "@/lib/format";
import { allRows } from "@/lib/fetch-all-pages";
import { parseStatement } from "@/lib/payout-statement";
import { planImport, type ImportPlan } from "@/lib/payout-import";
import { linkToManualCash, ROUNDING_TOLERANCE } from "@/lib/payout-match";

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
    // الحركة المربوطة بتحويل قبل كده مابتتحسبش
    manualCash: (cash.data ?? [])
      .filter((c) => !c.related_payout_id)
      .map((c) => ({
        id: c.id,
        amount: Number(c.amount),
        date: String(c.transaction_date).slice(0, 10),
      })),
    existingInvoices: new Set((payouts.data ?? []).map((p) => p.invoice_number)),
    // ⚠️ السماح ده للاستيراد التاريخي بس (تقريب الحركات اليدوية)
    tolerance: ROUNDING_TOLERANCE,
    // ⚠️ والأوردرات بتتربط من الإيميل — الكشف مافيهوش عددها (قرار ١٨ سبتمبر)
    matchOrders: false,
  });

  return {
    plan,
    codById: new Map((orders.data ?? []).map((o) => [o.id, Number(o.bosta_cod ?? 0)])),
    problems: statement.problems,
    columns: statement.columns,
  };
}

export type PreviewResult =
  | { ok: true; plan: ImportPlan; problems: Loaded["problems"]; columns: Loaded["columns"] }
  | { ok: false; error: string };

/** معاينة — **مابتكتبش حاجة** */
export async function previewPayoutImport(text: string): Promise<PreviewResult> {
  const me = await requirePermission("cash.edit");
  try {
    const { plan, problems, columns } = await buildPlan(text, me.tenantId);
    return { ok: true, plan, problems, columns };
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
    const { plan, codById } = await buildPlan(text, me.tenantId);

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

    await logActivity(
      me,
      "payout.import",
      `استورد كشف المحفظة: ${saved} مطابق · ${needsReview} محتاج مراجعة · ${skipped} متسجّل قبل كده`
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
  const { data: cash } = await allRows(db
    .from("cash_transactions")
    .select("id, amount, transaction_date, related_payout_id")
    .eq("tenant_id", me.tenantId)
    .eq("source_type", "manual")
    .eq("direction", "in")
    .overrideTypes<
      { id: string; amount: number; transaction_date: string; related_payout_id: string | null }[]
    >());
  const link = linkToManualCash(
    { net: amount, date },
    (cash ?? [])
      .filter((c) => !c.related_payout_id)
      .map((c) => ({ id: c.id, amount: Number(c.amount), date: String(c.transaction_date).slice(0, 10) })),
    new Set(),
    ROUNDING_TOLERANCE
  );
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
