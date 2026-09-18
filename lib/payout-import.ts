/**
 * ==========================================================================
 * خطة استيراد كشف المحفظة (TRANSFERS §٩.١ · الخطوة ٣)
 * --------------------------------------------------------------------------
 * ⛔⛔ **الاستيراد بيربط — مايعملش حركة خزنة.** التحويلات القديمة متسجّلة
 * حركات يدوية بالفعل (مينيز ٢٤ حركة بـ١٢٦,٤٩٦ · 2 SEC ١١ بـ٢٥,١١٤)، فلو
 * الاستيراد عمل حركة لكل تحويل كانت الفلوس هتتعدّ **مرتين**.
 *
 * الخطة بترجّع لكل تحويل حالته، ومحدش بيكتب حاجة قبل ما عمر يشوفها:
 *
 * | الحالة | يعني إيه |
 * |---|---|
 * | `linked`  | له حركة يدوية بنفس المبلغ (± يوم) → بيتربط بيها |
 * | `gap`     | مفيش حركة خالص → مستني دوسة تعمل الحركة |
 * | `diff`    | حركة بمبلغ مختلف (٦,٤٠٠ يدوي مقابل ٦,٤٣٧٫٤٤) → مستني قرار |
 * | `duplicate` | رقم الفاتورة متسجّل قبل كده → بيتعدّى |
 *
 * ⚠️ **الأوردر والحركة بيتحجزوا لأول تحويل بياخدهم** — من غير الحجز، تحويلين
 * بنفس المبلغ كانوا هياخدوا نفس الحركة.
 *
 * **الملف ده صافي** — بياخد صفوف وبيرجّع خطة.
 * ==========================================================================
 */

import {
  linkToManualCash,
  matchPayout,
  type CashLink,
  type ManualCashRow,
  type MatchResult,
  type PayoutCandidate,
} from "./payout-match";
import type { StatementRow } from "./payout-statement";

export type PlanRow = {
  row: StatementRow;
  /** الأوردرات اللي المطابقة لقتها — فاضية لو ماطابقتش */
  orderIds: string[];
  match: MatchResult;
  cash: CashLink | null;
  /** `matched` = جاهز للتسجيل · `needs_review` = مستني عمر · `duplicate` = متسجّل قبل كده */
  status: "matched" | "needs_review" | "duplicate";
  /** ليه محتاج مراجعة — بيتكتب على الصف زي ما هو */
  reason?: string;
};

export type ImportPlan = {
  rows: PlanRow[];
  totals: {
    all: number;
    matched: number;
    needsReview: number;
    duplicates: number;
    /** مجموع الصافي لكل التحويلات الجديدة */
    net: number;
    /** رسوم شركة الشحن — ⚠️ للعرض بس، متخصومة من الأوردرات أصلًا */
    fees: number;
    /**
     * ⚠️ **مجموع فروق التقريب** — الحركات اليدوية مكتوبة بالجنيه الصحيح،
     * والفرق ده **فرق حقيقي في الرصيد**. من غير ما يتسجّل، الرصيد بيفضل
     * ناقص القروش دي للأبد (مينيز ~١٠ جنيه على ٧ شهور).
     */
    rounding: number;
  };
};

export function planImport(
  rows: StatementRow[],
  input: {
    candidates: PayoutCandidate[];
    manualCash: ManualCashRow[];
    /** أرقام الفواتير المتسجّلة قبل كده */
    existingInvoices: Set<string>;
    /**
     * فرق مقبول بين مبلغ التحويل والحركة اليدوية (تقريب عمر وهو بيكتب).
     * ⚠️ للاستيراد التاريخي بس — الإيميل بيدّي الرقم الصحيح.
     */
    tolerance?: number;
    /**
     * يربط الأوردرات كمان؟
     *
     * ⚠️⚠️ **الاستيراد التاريخي: لأ** (قرار عمر ١٨ سبتمبر). كشف المحفظة
     * مافيهوش عدد الأوردرات، و**٥٥ أوردر متسلّم في مينيز مالهمش `bosta_cod`**
     * (بوسطة بتصفّره بعد التسوية) — فأي مجموع بيتكسر. الاستيراد بيربط
     * **الفلوس بس**، وربط الأوردرات بيشتغل من الإيميل اللي بيقول العدد.
     */
    matchOrders?: boolean;
  }
): ImportPlan {
  // الأقدم الأول — بوسطة بتحوّل بالترتيب، والحجز لازم يمشي بنفس الترتيب
  const ordered = [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const takenOrders = new Set<string>();
  const takenCash = new Set<string>();
  const out: PlanRow[] = [];

  for (const row of ordered) {
    if (input.existingInvoices.has(row.invoiceNumber)) {
      out.push({
        row,
        orderIds: [],
        match: { ok: false, reason: "متسجّل قبل كده" },
        cash: null,
        status: "duplicate",
      });
      continue;
    }

    const free = input.candidates.filter((c) => !takenOrders.has(c.orderId));
    const match: MatchResult =
      input.matchOrders === false
        ? { ok: false, reason: "الأوردرات بتتربط من الإيميل — الكشف مافيهوش عددها" }
        : matchPayout({ gross: row.gross, count: row.orderCount }, free);
    const orderIds = match.ok ? match.orderIds : [];
    for (const id of orderIds) takenOrders.add(id);

    const cash = linkToManualCash(
      { net: row.net, date: row.date },
      input.manualCash,
      takenCash,
      input.tolerance ?? 0
    );
    if (cash.kind === "linked" || cash.kind === "diff") takenCash.add(cash.cashId);

    const reasons: string[] = [];
    // الأوردرات مش شرط للتسجيل لما الربط بيكون على الفلوس بس
    if (!match.ok && input.matchOrders !== false) reasons.push(match.reason);
    if (cash.kind === "gap") reasons.push("مفيش حركة خزنة بالمبلغ ده — محتاج دوسة");
    if (cash.kind === "diff") {
      reasons.push(`الحركة اليدوية فرقها ${cash.difference} — محتاج قرار`);
    }

    out.push({
      row,
      orderIds,
      match,
      cash,
      status: reasons.length === 0 ? "matched" : "needs_review",
      ...(reasons.length > 0 ? { reason: reasons.join(" · ") } : {}),
    });
  }

  // العرض بالأحدث الأول — زي الدفتر
  const rowsOut = [...out].reverse();
  const fresh = rowsOut.filter((r) => r.status !== "duplicate");
  return {
    rows: rowsOut,
    totals: {
      all: rowsOut.length,
      matched: rowsOut.filter((r) => r.status === "matched").length,
      needsReview: rowsOut.filter((r) => r.status === "needs_review").length,
      duplicates: rowsOut.filter((r) => r.status === "duplicate").length,
      net: round(fresh.reduce((s, r) => s + r.row.net, 0)),
      fees: round(fresh.reduce((s, r) => s + r.row.fees, 0)),
      rounding: round(
        fresh.reduce(
          (s, r) => s + (r.cash?.kind === "linked" ? (r.cash.rounding ?? 0) : 0),
          0
        )
      ),
    },
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
