// ==========================================================================
// الأتمتة — «لو حصل كذا، اعمل كذا»
// --------------------------------------------------------------------------
// كل تنبيه في السيستم دلوقتي مكتوب في الكود بحدوده: الأوردر القاعد ٤ أيام،
// والمخزون تحت ١٤ يوم، والشحنة الواقفة ٥ أيام. الأرقام دي **قرار صاحب
// المتجر مش قرار الكود** — واحد بيستنى يومين، وواحد عنده منتج بيخلص في
// أسبوع. ودلوقتي عشان يتغيّر رقم لازم كود يتكتب ويترفع.
//
// ⚠️⚠️ **القواعد بتنبّه بس — مابتعملش حاجة في الداتا.** ولا بتلغي أوردر
// ولا بتغيّر حالة ولا بتبعت للعميل. السيستم اللي بيتصرّف لوحده في فلوس
// وشحنات محدش بيثق فيه، وأول غلطة بيتقفل. اللي بيتعمل: **إشعار**.
//
// ⚠️ **والقاعدة بترن مرة واحدة لكل حالة** — التاج بياخد رقم الأوردر، فالأوردر
// اللي عدّى الشرط بيتقال عليه مرة، مش كل ربع ساعة لحد ما يتصلّح.
//
// **الملف ده صافي** — بياخد قواعد وحقايق وبيرجّع اللي المفروض ينبّه.
// ==========================================================================

/** الحاجات اللي القاعدة بتراقبها */
export const TRIGGERS = {
  order_waiting: "أوردر قاعد من غير تأكيد",
  order_not_shipped: "أوردر متأكّد ومااتشحنش",
  shipment_stuck: "شحنة واقفة عند بوسطة",
  stock_low: "مخزون قرّب يخلص",
  big_order: "أوردر أكبر من مبلغ",
  cod_gap: "تحصيل بوسطة مختلف عن عندنا",
} as const;

export type Trigger = keyof typeof TRIGGERS;

/** الوحدة اللي الرقم بيتقاس بيها */
export const UNITS: Record<Trigger, "days" | "money" | "units"> = {
  order_waiting: "days",
  order_not_shipped: "days",
  shipment_stuck: "days",
  stock_low: "units",
  big_order: "money",
  cod_gap: "money",
};

/**
 * القاعدة بترن لما الرقم يعدّي الحد ولا لما ينزل تحته؟
 *
 * ⚠️⚠️ **المخزون هو الوحيد اللي بالعكس.** «نبّهني لما المخزون يقل عن ٥»
 * معناها الرقم **أقل** من الحد — عكس كل الباقي («قاعد أكتر من ٣ أيام»).
 * لو القاعدة كانت «أكبر من» للكل، تنبيه المخزون كان هيرن على اللي عنده
 * كتير بدل اللي قرّب يخلص — يعني بالظبط عكس المطلوب.
 */
export const DIRECTION: Record<Trigger, "above" | "below"> = {
  order_waiting: "above",
  order_not_shipped: "above",
  shipment_stuck: "above",
  stock_low: "below",
  big_order: "above",
  cod_gap: "above",
};

/** الصفحة اللي التنبيه بيوديها */
export function hitHref(trigger: Trigger, subjectId: string): string {
  // ⚠️ المخزون شكل مش أوردر — الرابط للمنتج
  return trigger === "stock_low"
    ? `/products?variant=${subjectId}`
    : `/orders/${subjectId}`;
}

export type Rule = {
  id: string;
  trigger: Trigger;
  /** الحد — «أكتر من كذا» */
  threshold: number;
  active: boolean;
};

/** حاجة اتقاست — أوردر أو شكل */
export type Fact = {
  trigger: Trigger;
  /** الأوردر أو الشكل — بيدخل في التاج فالتنبيه مايتكررش */
  subjectId: string;
  /** الاسم اللي بيتعرض */
  label: string;
  /** الرقم اللي بيتقارن بالحد */
  value: number;
};

export type Hit = {
  ruleId: string;
  trigger: Trigger;
  subjectId: string;
  label: string;
  value: number;
  threshold: number;
};

/**
 * الحد الأدنى المسموح — تحته القاعدة بترن على كل حاجة.
 *
 * ⚠️⚠️ **صفر مش حد.** «نبّهني على الأوردر اللي قاعد أكتر من ٠ يوم» معناها
 * تنبيه على **كل أوردر جديد** — يعني إشعار على كل بيعة. والحد ده بيمنع
 * القاعدة اللي بتقفل نفسها من أول يوم.
 */
export const MIN_THRESHOLD: Record<"days" | "money" | "units", number> = {
  days: 1,
  money: 1,
  units: 1,
};

/**
 * القاعدة دي سليمة؟
 *
 * ⚠️ **بيرجّع السبب بالعربي** — «القاعدة غلط» من غير سبب بتخلّي اللي
 * بيكتبها يجرّب لحد ما يزهق.
 */
export function checkRule(rule: {
  trigger: string;
  threshold: number;
}): { ok: true } | { ok: false; reason: string } {
  if (!(rule.trigger in TRIGGERS)) {
    return { ok: false, reason: "اختار الحاجة اللي عايز تراقبها" };
  }
  const unit = UNITS[rule.trigger as Trigger];
  const n = Number(rule.threshold);

  if (!Number.isFinite(n)) return { ok: false, reason: "اكتب رقم" };

  if (n < MIN_THRESHOLD[unit]) {
    return {
      ok: false,
      reason:
        unit === "days"
          ? "أقل حد يوم — الصفر معناه تنبيه على كل أوردر جديد"
          : "الرقم لازم يكون أكبر من صفر",
    };
  }

  // ⚠️ الرقم الخيالي معناه قاعدة عمرها ما هترن — والصمت بيبان كأنه شغل
  if (unit === "days" && n > 365) {
    return { ok: false, reason: "أكتر من سنة؟ القاعدة دي عمرها ما هترن" };
  }

  return { ok: true };
}

/**
 * اللي عدّى الحد.
 *
 * ⚠️ **أكبر من الحد، مش أكبر من أو يساوي** — «نبّهني بعد ٣ أيام» معناها
 * في اليوم الرابع. لو رن في اليوم التالت، اللي كتب القاعدة هيحس إنها
 * بترن بدري ومش هيثق في الأرقام.
 *
 * ⚠️ **والمخزون بالعكس** (`DIRECTION`) — بيرن لما الرقم ينزل تحت الحد.
 */
export function runRules(rules: Rule[], facts: Fact[]): Hit[] {
  const out: Hit[] = [];

  for (const rule of rules) {
    if (!rule.active) continue;
    const check = checkRule(rule);
    if (!check.ok) continue;

    const below = DIRECTION[rule.trigger] === "below";

    for (const fact of facts) {
      if (fact.trigger !== rule.trigger) continue;

      const crossed = below
        ? fact.value < rule.threshold
        : fact.value > rule.threshold;
      if (!crossed) continue;

      out.push({
        ruleId: rule.id,
        trigger: rule.trigger,
        subjectId: fact.subjectId,
        label: fact.label,
        value: fact.value,
        threshold: rule.threshold,
      });
    }
  }

  // ⚠️ الأبعد عن الحد الأول — ده اللي بيوجع أكتر. والبُعد بيتقاس بالفرق
  // عن الحد نفسه عشان النوعين (فوق وتحت) يترتبوا مع بعض صح.
  return out.sort(
    (a, b) => Math.abs(b.value - b.threshold) - Math.abs(a.value - a.threshold)
  );
}

/**
 * «٣ أيام» · «١٬٢٠٠ جنيه» · «٤ قطع»
 *
 * ⚠️ **الأيام بتتقرّب لرقم صحيح** — «٣٣٫٨ أيام» رقم دقيق ومالوش لازمة،
 * وبيخلّي الجملة تبان كأنها مولّدة بالغلط.
 */
export function amount(value: number, unit: "days" | "money" | "units"): string {
  const n = unit === "days" ? Math.round(value) : Math.round(value * 10) / 10;
  if (unit === "days") return n === 1 ? "يوم" : n === 2 ? "يومين" : `${n} أيام`;
  if (unit === "money") return `${n.toLocaleString("ar-EG")} جنيه`;
  return n === 1 ? "قطعة" : n === 2 ? "قطعتين" : `${n} قطع`;
}

/**
 * نص التنبيه.
 *
 * ⚠️ **بيقول اللي حصل والحد اللي إنت حطيته** — من غير ما يقول اعمل إيه.
 * الحد مذكور عشان اللي شايف الإشعار يفتكر إنه هو اللي طلبه.
 */
export function hitMessage(hit: Hit): string {
  const unit = UNITS[hit.trigger];
  return [
    TRIGGERS[hit.trigger],
    `${hit.label} — ${amount(hit.value, unit)} (حدك ${amount(hit.threshold, unit)})`,
  ].join("\n");
}

/**
 * تاج التنبيه.
 *
 * ⚠️⚠️ **بالقاعدة والحالة مش باليوم.** لو التاج باليوم، نفس الأوردر بينبّه
 * كل يوم لحد ما يتصلّح — والإشعار اللي بيتكرر بيتقفل بعد تلات مرات.
 * وبالحالة، الأوردر بيتقال عليه مرة واحدة وخلاص.
 */
export function hitTag(hit: Hit): string {
  return `rule-${hit.ruleId}-${hit.subjectId}`;
}
