// ==========================================================================
// صفحة التتبع اللي العميل بيفتحها
// --------------------------------------------------------------------------
// العميل دلوقتي بيروح على موقع بوسطة عشان يعرف شحنته فين — وده اسم شركة
// الشحن مش اسم متجرك. الصفحة دي بتخلّيه يفضل عندك.
//
// ⚠️⚠️ **الصفحة دي مفتوحة من غير حساب — أي حد معاه رقم التتبع بيفتحها.**
// عشان كده اللي بيتعرض فيها **محدود بقصد**: الحالة والتاريخ واسم المتجر وبس.
// مافيش تليفون ولا عنوان ولا مبلغ ولا اسم عميل — دي بيانات لو ظهرت لحد
// عنده رقم تتبع بس تبقى تسريب.
//
// ⚠️ **ومافيش أسماء منتجات كمان** — «مقبض ستارة دهبي» على صفحة مفتوحة
// معناها إن أي حد يعرف اشتريت إيه.
//
// **الملف ده صافي** — بياخد حالة وبيرجّع خطوات.
// ==========================================================================

export type TrackStep = {
  label: string;
  /** الخطوة دي عدّت؟ */
  done: boolean;
  /** إحنا واقفين عندها دلوقتي؟ */
  current: boolean;
};

export type TrackView = {
  /** الجملة الكبيرة فوق */
  headline: string;
  /** سطر تحتها بيشرح */
  detail: string;
  steps: TrackStep[];
  /** الشحنة خلصت مشوارها (وصلت أو رجعت)؟ */
  finished: boolean;
};

/** خط سير الشحنة الطبيعي */
const JOURNEY: { key: string; label: string }[] = [
  { key: "confirmed", label: "الأوردر اتأكد" },
  { key: "ready", label: "جاهز عند شركة الشحن" },
  { key: "shipped", label: "المندوب استلمه" },
  { key: "out_for_delivery", label: "في الطريق ليك" },
  { key: "delivered", label: "اتسلّم" },
];

/** الحالة الحالية فين في الخط — و`-1` لو بره الخط */
function positionOf(status: string): number {
  const i = JOURNEY.findIndex((s) => s.key === status);
  if (i >= 0) return i;
  // الحالات اللي قبل التأكيد
  if (status === "new" || status === "packed") return 0;
  return -1;
}

const HEADLINES: Record<string, { headline: string; detail: string }> = {
  new: {
    headline: "أوردرك وصلنا",
    detail: "هنكلّمك نأكّد ونجهّزه.",
  },
  confirmed: {
    headline: "أوردرك اتأكد",
    detail: "بنجهّزه دلوقتي.",
  },
  packed: {
    headline: "أوردرك اتجهّز",
    detail: "هيروح لشركة الشحن قريّب.",
  },
  ready: {
    headline: "جاهز عند شركة الشحن",
    detail: "المندوب هيستلمه ويطلع بيه.",
  },
  shipped: {
    headline: "الشحنة مع شركة الشحن",
    detail: "ماشية في السكة ليك.",
  },
  out_for_delivery: {
    headline: "المندوب في الطريق ليك",
    detail: "خلّي تليفونك جنبك.",
  },
  delivered: {
    headline: "اتسلّم — ألف هنا",
    detail: "لو فيه أي مشكلة كلّمنا.",
  },
  awaiting_action: {
    headline: "الشحنة واقفة",
    detail: "بنحاول نوصلك — لو فيه حاجة نعرفها كلّمنا.",
  },
  returning: {
    headline: "الشحنة راجعة",
    detail: "لو ده مش قصدك كلّمنا وهنبعتها تاني.",
  },
  returned: {
    headline: "الشحنة رجعت لنا",
    detail: "لو عايزها تاني كلّمنا.",
  },
  returned_after_delivery: {
    headline: "المرتجع وصلنا",
    detail: "لو فيه فلوس ترجع، هتوصلك.",
  },
  cancelled: {
    headline: "الأوردر اتلغى",
    detail: "لو ده غلط كلّمنا.",
  },
};

const FINISHED = ["delivered", "returned", "returned_after_delivery", "cancelled"];

/**
 * شكل صفحة التتبع لحالة أوردر.
 *
 * ⚠️ **الحالة اللي مش معروفة بتدّي رسالة محايدة** — «حالة غير معروفة» على
 * صفحة بيقراها عميل بتخوّف من غير سبب.
 */
export function trackView(status: string | null | undefined): TrackView {
  const s = String(status ?? "").trim();
  const copy = HEADLINES[s] ?? {
    headline: "شحنتك في السكة",
    detail: "بنتابعها، ولو فيه جديد هنقولك.",
  };

  const at = positionOf(s);
  const failed = ["returning", "returned", "returned_after_delivery", "cancelled"];

  const steps: TrackStep[] = JOURNEY.map((step, i) => ({
    label: step.label,
    // الشحنة اللي رجعت أو اتلغت: الخطوات اللي بعد وقوفها مابتتعلّمش خالص
    done: at >= 0 && i < at,
    current: at === i && !failed.includes(s),
  }));

  return {
    headline: copy.headline,
    detail: copy.detail,
    steps,
    finished: FINISHED.includes(s),
  };
}
