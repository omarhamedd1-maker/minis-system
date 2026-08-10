// ==========================================================================
// الفلوس اللي بتوصل قبل التسليم — المقدم وانستا باي
// --------------------------------------------------------------------------
// الأوردر اللي العميل دفع فيه مقدم، أو دفعه كله انستا، فلوسه بتوصل الخزنة
// **قبل** ما المندوب يتحرك. عمر كان بيكتبها بإيده سطر لكل أوردر.
//
// ⚠️ **وأهم شرط هنا: مانكررش اللي هو كاتبه.** عمر بيكتب «مقدم اوردر ١٤٠٦»
// و«اوردر ١٤٠٩ مدفوع انستا» — يعني الرقم جوّه الوصف، **بأرقام عربي**
// والأوردر متخزّن بأرقام إنجليزي. فالمقارنة لازم توحّد الأرقام الأول،
// وإلا السيستم هيشوف إن مفيش سطر ويكتب واحد تاني — والخزنة تبقى غلط.
//
// دوال صافية بالكامل.
// ==========================================================================

/** بيحوّل الأرقام العربي والفارسي لإنجليزي — «١٤٠٩» ← «1409» */
export function toLatinDigits(s: string | null | undefined): string {
  return String(s ?? "").replace(/[٠-٩۰-۹]/g, (d) => {
    const ar = "٠١٢٣٤٥٦٧٨٩".indexOf(d);
    if (ar >= 0) return String(ar);
    return String("۰۱۲۳۴۵۶۷۸۹".indexOf(d));
  });
}

/**
 * الوصف ده بيتكلم عن الأوردر ده؟
 *
 * بندوّر على الرقم **كرقم كامل** مش كجزء من رقم أطول — «١٤٠» مايطابقش
 * «١٤٠٦»، وإلا سطر أوردر واحد كان هيغطّي عشرة.
 */
export function mentionsOrder(
  description: string | null | undefined,
  orderNumber: string | null | undefined
): boolean {
  const num = toLatinDigits(orderNumber).replace(/\D/g, "");
  if (!num) return false;
  const text = toLatinDigits(description);
  return new RegExp(`(?<!\\d)${num}(?!\\d)`).test(text);
}

export type PrepaidOrder = {
  id: string;
  orderNumber: string | null;
  /** اللي اتدفع قبل التسليم */
  amountPaid: number;
  paymentMethod: string | null;
  orderDate: string | null;
};

export type CashRow = {
  id: string;
  direction: string | null;
  amount: number;
  description: string | null;
  relatedOrderId: string | null;
};

export type PrepaidPlan = {
  /** هيتسجّل سطر جديد */
  toAdd: { order: PrepaidOrder; amount: number }[];
  /**
   * سطر عمر كاتبه بإيده وبنربطه بالأوردر بس — **من غير سطر جديد**.
   * كده الخزنة ماتتغيّرش والسيستم يبقى عارف إن الأوردر ده متسجّل.
   */
  toAdopt: { order: PrepaidOrder; cashId: string }[];
  /**
   * **وقفنا عندها بقصد** — فيه سطر بنفس المبلغ بالظبط مكتوب بإيد ومش
   * مربوط بأي أوردر، بس رقمه رقم أوردر تاني.
   *
   * حصلت فعلًا: عمر كتب «ديبوزت اوردر ١٤١٣» بـ٣٠٠، والأوردر اللي فيه
   * مقدم ٣٠٠ هو **١٤١٦**. يا إما غلطة كتابة، يا إما ١٤١٣ فعلًا خد ٣٠٠
   * ومتسجّلش عليه. **الاتنين محتملين**، والتخمين هنا معناه ٣٠٠ جنيه
   * مزوّدين في الخزنة أو ناقصين — فبنسيبها لعمر يقرر.
   */
  needsReview: {
    order: PrepaidOrder;
    amount: number;
    cashId: string;
    cashDescription: string | null;
  }[];
  /** متسجّل ومربوط خلاص — مفيش حاجة تتعمل */
  alreadyDone: number;
};

/** الأوردر ده فلوسه وصلت قبل التسليم؟ وبكام؟ */
export function prepaidAmount(o: PrepaidOrder): number {
  const paid = Number(o.amountPaid ?? 0);
  return paid > 0 ? Math.round(paid * 100) / 100 : 0;
}

/**
 * بيقرر يتسجّل إيه في الخزنة.
 *
 * **مابيمسحش ولا بيعدّل مبلغ أبدًا** — بيضيف الناقص ويربط اللي متكتب
 * بإيد. أي حاجة تانية معناها إن السيستم يغيّر رقم عمر كتبه بنفسه.
 */
export function planPrepaidCash(
  orders: PrepaidOrder[],
  cash: CashRow[]
): PrepaidPlan {
  const plan: PrepaidPlan = {
    toAdd: [],
    toAdopt: [],
    needsReview: [],
    alreadyDone: 0,
  };

  const linked = new Set(
    cash.filter((c) => c.relatedOrderId).map((c) => c.relatedOrderId as string)
  );
  const incoming = cash.filter((c) => c.direction === "in");
  const takenRows = new Set<string>();

  for (const o of orders) {
    const amount = prepaidAmount(o);
    if (amount <= 0) continue;

    // مربوط خلاص
    if (linked.has(o.id)) {
      plan.alreadyDone++;
      continue;
    }

    // **سطر عمر كاتبه** — الرقم جوّه الوصف. بنربطه بدل ما نزوّد سطر
    const written = incoming.find(
      (c) =>
        !takenRows.has(c.id) &&
        !c.relatedOrderId &&
        mentionsOrder(c.description, o.orderNumber)
    );
    if (written) {
      takenRows.add(written.id);
      plan.toAdopt.push({ order: o, cashId: written.id });
      continue;
    }

    // **سطر بنفس المبلغ بالظبط ومربوطش بحاجة** — يبقى غالبًا هو نفسه
    // والرقم اتكتب غلط. مانضيفش، ونسيبها تتراجع
    const sameAmount = incoming.find(
      (c) =>
        !takenRows.has(c.id) &&
        !c.relatedOrderId &&
        Math.abs(c.amount - amount) < 0.01
    );
    if (sameAmount) {
      takenRows.add(sameAmount.id);
      plan.needsReview.push({
        order: o,
        amount,
        cashId: sameAmount.id,
        cashDescription: sameAmount.description,
      });
      continue;
    }

    plan.toAdd.push({ order: o, amount });
  }

  return plan;
}

/** وصف السطر اللي السيستم بيكتبه — بيقول المبلغ جايّ منين */
export function prepaidDescription(o: PrepaidOrder): string {
  const kind = o.paymentMethod === "instapay" ? "انستا باي" : "مقدم";
  return `${kind} أوردر ${o.orderNumber ?? "—"}`;
}
