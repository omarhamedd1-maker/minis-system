// ==========================================================================
// ترجمة حالة الشحنة عند بوسطة لحالة الأوردر عندنا — المصدر الوحيد للترجمة دي
// --------------------------------------------------------------------------
// الترتيب هنا مهم جدًا: الأخص الأول. الغلطتين اللي حصلوا قبل كده كان سببهم
// الترتيب (مثلاً "Out For Delivery" فيها كلمة deliver، فلو اتفحصت بعد
// "delivered" الأوردر بيبان متسلّم وهو لسه في الطريق).
// ==========================================================================

/** حالات إحنا اللي بنحددها بإيدنا — المزامنة مامنفعش تغيّرها */
export const LOCKED_STATUSES = ["cancelled", "returned_after_delivery"];

export type OrderStatus =
  | "cancelled"
  | "returned"
  | "returning"
  | "awaiting_action"
  | "delivered"
  | "out_for_delivery"
  | "shipped"
  | "ready";

// كل قاعدة بتتفحص بالترتيب، وأول واحدة تنطبق بتكسب
const RULES: { status: OrderStatus; match: (s: string) => boolean }[] = [
  // ملغي من بوسطة
  { status: "cancelled", match: (s) => s.includes("cancel") },

  // رجعت لنا فعلاً ووصلت المخزن
  {
    status: "returned",
    match: (s) =>
      s.includes("returned to origin") ||
      s.includes("returned to business") ||
      s === "returned" ||
      s.includes("exchanged & returned"),
  },

  // راجعة لنا بس لسه في الطريق
  { status: "returning", match: (s) => s.includes("return") },

  // بوسطة واقفة ومحتاجة تصرّف مننا
  {
    status: "awaiting_action",
    match: (s) =>
      s.includes("awaiting action") ||
      s.includes("action required") ||
      s.includes("exception") ||
      s.includes("on hold"),
  },

  // خرجت من الفرع وماشية للعميل — لازم تتفحص قبل "delivered"
  {
    status: "out_for_delivery",
    match: (s) => s.includes("out for delivery") || s.includes("with courier"),
  },

  // اتسلّمت فعلاً
  { status: "delivered", match: (s) => s.includes("deliver") },

  // المندوب استلمها منّا أو هي جوّه شبكة بوسطة
  {
    status: "shipped",
    match: (s) =>
      s.includes("picked") ||
      s.includes("transit") ||
      s.includes("received") ||
      s.includes("processing") ||
      s.includes("at warehouse") ||
      s.includes("hub"),
  },

  // الشحنة اتعملت ومستنية المندوب
  {
    status: "ready",
    match: (s) =>
      s.includes("created") ||
      s.includes("requested") ||
      s.includes("waiting for pickup") ||
      s.includes("pickup") ||
      s.includes("route"),
  },
];

// ==========================================================================
// أكواد بوسطة — دي المصدر الأدق، والنص الخشن بيكدب
// --------------------------------------------------------------------------
// مسار المزامنة بيرجّع `state.value` **مجمّعة**: "Delivered" بتشمل الشحنة
// اللي اتسلّمت **والشحنة اللي رجعت لنا** مع بعض. لقينا ٧٩ شحنة راجعة مكتوب
// عليها Delivered، منهم ٤٣ مربوطين بأوردرات عندنا كانوا محسوبين مبيعات.
//
// الأرقام دي اتستنتجت من شحنات حقيقية: جبنا كل شحنة لوحدها (اللي بترجّع
// الحالة التفصيلية) وقارنّاها بالكود اللي في المزامنة.
// ==========================================================================
const STATE_CODES: Record<number, OrderStatus> = {
  10: "ready", // Pickup requested — الشحنة اتعملت ومستنية المندوب
  24: "shipped", // Received at warehouse
  30: "shipped", // In transit between Hubs
  41: "out_for_delivery", // Out for delivery — المندوب ماشي بيها للعميل
  45: "delivered", // Delivered
  46: "returned", // Returned to business — **مش delivered**
  // ٤٧ = Exception: بوسطة واقفة ومستنية قرار مننا (`waitingForBusinessAction`).
  // الكود ده كان ناقص، فأوردر ١٣٦٤ قعد ٩ أيام عندنا "استلمه بوسطة" وهو
  // في الحقيقة العميل رفض يستلمه ومحتاج تصرّف.
  47: "awaiting_action",
  48: "awaiting_action", // Terminated — بوسطة وقفتها ومحتاجة قرار مننا
  104: "awaiting_action", // Archived — الشحنة اتقفلت، لازم نشوف حصل إيه
};

/**
 * حالة الأوردر من كائن الحالة كامل.
 *
 * فيه مصدرين للنص وفرقهم كبير:
 *
 * - **نص مجمّع** (اللي بيجي من مسار المزامنة): بيخلط المتسلّم بالراجع، فمينفعش
 *   نصدّقه. بنمشي بالكود، ولو الكود مش معروف ومكتوب "Delivered" مانغيّرش حاجة.
 * - **نص تفصيلي** (من جلب الشحنة لوحدها): ده اللي بوسطة نفسها بتعرضه، وأدق من
 *   أي جدول أكواد بنبنيه إحنا — فبيكسب على الكود.
 */
export function mapBostaDelivery(
  state:
    | { value?: string | null; code?: number | null }
    | null
    | undefined,
  /** النص جاي من جلب الشحنة لوحدها؟ ساعتها هو الأدق */
  detailed = false
): OrderStatus | null {
  const byText = mapBostaState(state?.value);
  if (detailed && byText) return byText;

  const code = state?.code;
  if (typeof code === "number" && STATE_CODES[code]) return STATE_CODES[code];

  // كود مش معروف + نص مجمّع مكتوب فيه Delivered = ممكن تكون راجعة.
  // مانخاطرش بفلوس على تخمين.
  if (!detailed && byText === "delivered") return null;
  return byText;
}

/** بيرجّع حالة الأوردر المقابلة، أو null لو الحالة مش معروفة (ساعتها منغيرش حاجة) */
export function mapBostaState(state: string | null | undefined): OrderStatus | null {
  const s = String(state ?? "").toLowerCase().trim();
  if (!s) return null;
  for (const rule of RULES) {
    if (rule.match(s)) return rule.status;
  }
  return null;
}

/**
 * شحنة ماتت — مش هتوصل ولا هترجع، ومحتاجة شحنة جديدة بدالها.
 * بوسطة بتأرشف الشحنة لو قعدت من غير بيك اب (حصل مع أوردر ١٣٣٦ و١١٥٢).
 */
export function isDeadShipment(
  state: string | null | undefined,
  code?: number | null
): boolean {
  if (code === 104 || code === 48) return true; // Archived · Terminated
  const s = String(state ?? "").toLowerCase();
  return (
    s.includes("archiv") ||
    s.includes("terminat") ||
    s.includes("cancel") ||
    s.includes("lost") ||
    s.includes("damaged")
  );
}

/** هل ينفع المزامنة تغيّر حالة الأوردر ده؟ */
export function canSyncChangeStatus(current: string | null | undefined): boolean {
  return !LOCKED_STATUSES.includes(String(current ?? ""));
}

/**
 * هل نجرّب نعدّل تحصيل الشحنة عند بوسطة؟
 *
 * **القايمة دي مقصود إنها قصيرة.** لو منعنا التعديل ونحن مش متأكدين، المندوب
 * بيحصّل مبلغ غلط من العميل — ودي خسارة فلوس حقيقية. أما لو جرّبنا وبوسطة
 * رفضت، مافيش ضرر وبنعرض سببها. فبنمنع الحالات **النهائية** بس، واللي بينهم
 * بوسطة هي اللي تقرر فيه.
 */
export function canEditDelivery(state: string | null | undefined): boolean {
  const s = String(state ?? "").toLowerCase().trim();
  if (!s) return false;

  const finished = [
    "deliver", // اتسلّمت، أو المندوب ماشي بيها للعميل
    "return",
    "cancel",
    "archived",
    "lost",
    "damaged",
    "exchanged",
  ];
  return !finished.some((w) => s.includes(w));
}
