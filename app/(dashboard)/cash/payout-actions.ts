"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { allRows } from "@/lib/fetch-all-pages";
import { parseStatement } from "@/lib/payout-statement";
import { planImport, type ImportPlan } from "@/lib/payout-import";
import { ROUNDING_TOLERANCE } from "@/lib/payout-match";

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
