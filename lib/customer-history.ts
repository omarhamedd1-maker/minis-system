// ==========================================================================
// تاريخ العميل — هو ده بيرجّع كتير ولا لأ؟
// --------------------------------------------------------------------------
// في الدفع عند الاستلام، أخطر حاجة إن حد يطلب وميستلمش. الشحنة بتروح وترجع
// وإنت دافع رسوم الاتجاهين، والبضاعة قعدت أسبوع برّه المخزن على الفاضي.
//
// اللي بيأكّد الأوردر لازم يشوف الرقم ده **قبل** ما يمسك التليفون.
//
// **النسب بتتحسب على الأوردرات اللي خلصت بس** (اتسلّمت أو رجعت أو اتلغت) —
// الأوردر اللي لسه في الطريق مش نتيجة، وحسابه ضمن النسبة بيكدب. عميل عنده
// أوردر واحد شغّال دلوقتي مش "نسبة تسليمه صفر".
//
// الملف ده صافي — مافيش شبكة ولا قاعدة بيانات، فينفع يتختبر بالأرقام.
// ==========================================================================

/** البضاعة رجعت لنا فعلًا — قبل التسليم أو بعده */
const RETURNED_STATUSES = ["returned", "returned_after_delivery"];

export type CustomerRisk = "new" | "good" | "watch" | "bad";

export type CustomerHistory = {
  /** كل أوردراته عندنا */
  total: number;
  delivered: number;
  /** رجعت لنا — قبل التسليم أو بعده */
  returned: number;
  cancelled: number;
  /** لسه شغّالة، مش نتيجة */
  inProgress: number;
  /** اللي خلصت وليها نتيجة — عليها بتتحسب النسب */
  settled: number;
  /** من صفر لواحد. `null` لو مفيش أوردر خلص */
  returnRate: number | null;
  cancelRate: number | null;
  risk: CustomerRisk;
};

/**
 * حدود التصنيف.
 * مافيش رقم مقدّس هنا — دي نقطة بداية معقولة تتظبط لما يبقى عندنا داتا
 * كفاية نعرف منها متوسط الرجيع الحقيقي.
 */
const WATCH_FROM = 0.25;
const BAD_FROM = 0.5;

/** أقل عدد أوردرات خالصة نقدر نحكم منها — أوردر واحد رجع مش "عميل بيرجّع" */
const MIN_SETTLED_TO_JUDGE = 2;

export function summarizeCustomerHistory(
  statuses: (string | null)[]
): CustomerHistory {
  let delivered = 0;
  let returned = 0;
  let cancelled = 0;
  let inProgress = 0;

  for (const raw of statuses) {
    const status = String(raw ?? "");
    if (status === "delivered") delivered++;
    else if (RETURNED_STATUSES.includes(status)) returned++;
    else if (status === "cancelled") cancelled++;
    else inProgress++;
  }

  const settled = delivered + returned + cancelled;
  const returnRate = settled > 0 ? returned / settled : null;
  const cancelRate = settled > 0 ? cancelled / settled : null;

  let risk: CustomerRisk = "new";
  if (settled >= MIN_SETTLED_TO_JUDGE && returnRate !== null) {
    if (returnRate >= BAD_FROM) risk = "bad";
    else if (returnRate >= WATCH_FROM) risk = "watch";
    else risk = "good";
  }

  return {
    total: statuses.length,
    delivered,
    returned,
    cancelled,
    inProgress,
    settled,
    returnRate,
    cancelRate,
    risk,
  };
}

/**
 * "أوردرين" مش "٢ أوردر".
 * السيستم كله بيتكلم مصري، والعدد لو اتكتب غلط بيبان إنه مترجم.
 */
export function orderCountWord(n: number): string {
  if (n === 1) return "أوردر واحد";
  if (n === 2) return "أوردرين";
  if (n >= 3 && n <= 10) return `${n} أوردرات`;
  return `${n} أوردر`;
}

/**
 * الرجيع يتلوّن؟ مابنلوّنش من غير سبب — لو الرجيع في حدوده الطبيعية يفضل
 * زي باقي الأرقام، عشان اللون لما يبان يبقى معناه حاجة.
 */
export function shouldFlagReturns(h: CustomerHistory): boolean {
  return h.returned > 0 && (h.risk === "bad" || h.risk === "watch");
}

export type HistorySegment = { text: string; highlight: boolean };

/**
 * تفصيل صغير يتكتب تحت العدد: "استلم ٢ · رجّع ١".
 *
 * **مش صندوق ومش مربعات.** ده سطر في نفس الجدول اللي فيه الاسم والتليفون،
 * وتحته شرح صغير — نفس أسلوب "إجمالي مصاريف الشحن" وتحته تفصيله.
 * الصندوق بيتعمل لما يكون فيه حسبة ليها نتيجة، وده عدّ مش حسبة.
 */
export function historySegments(h: CustomerHistory): HistorySegment[] {
  const flag = shouldFlagReturns(h);
  const out: HistorySegment[] = [];

  if (h.delivered > 0) out.push({ text: `استلم ${h.delivered}`, highlight: false });
  if (h.returned > 0) out.push({ text: `رجّع ${h.returned}`, highlight: flag });
  if (h.cancelled > 0) out.push({ text: `ألغى ${h.cancelled}`, highlight: false });
  if (h.inProgress > 0)
    out.push({ text: `${h.inProgress} لسه شغّال`, highlight: false });

  return out;
}

/** الشكل اللي بيتعرض في الشاشة */
export function riskBadge(risk: CustomerRisk): {
  label: string;
  className: string;
} {
  switch (risk) {
    case "bad":
      return {
        label: "بيرجّع كتير",
        className: "bg-red-100 text-red-800",
      };
    case "watch":
      return {
        label: "خد بالك",
        className: "bg-amber-100 text-amber-800",
      };
    case "good":
      return {
        label: "عميل منتظم",
        className: "bg-green-50 text-green-700",
      };
    default:
      return {
        label: "لسه مافيش تاريخ",
        className: "bg-gray-100 text-gray-600",
      };
  }
}

/** ٠.٣٣٣ تبقى "٣٣٪" */
export function ratePercent(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}
