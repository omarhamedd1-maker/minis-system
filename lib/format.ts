export function formatMoney(amount: number) {
  return (
    new Intl.NumberFormat("en-EG", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    }).format(amount) + " جنيه"
  );
}

// تاريخ اليوم بتوقيت مصر — السيرفر بيشتغل بالتوقيت العالمي المتأخر عننا
export function cairoToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(
    new Date()
  );
}

export function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Africa/Cairo",
  });
}

const ORDER_STATUS_LABELS: Record<string, { label: string; className: string }> =
  {
    new: { label: "جديد", className: "bg-blue-50 text-blue-700" },
    confirmed: { label: "مؤكد", className: "bg-sky-50 text-sky-700" },
    packed: { label: "تم التغليف", className: "bg-purple-50 text-purple-700" },
    // الشحنة اتعملت عند بوسطة ومستنية المندوب
    ready: { label: "جاهز للبيك اب", className: "bg-cyan-50 text-cyan-700" },
    // بوسطة شايلة الأوردر: المندوب استلمه منّنا، أو هو في مخزنهم، أو بين
    // الفروع. الاسم القديم كان "مع المندوب" وده كان بيكدب — شحنة قاعدة في
    // مخزن بوسطة ماحدش ماشي بيها.
    shipped: {
      label: "استلمه بوسطة",
      className: "bg-indigo-50 text-indigo-700",
    },
    // خرجت من الفرع وماشية للعميل
    out_for_delivery: {
      label: "في الطريق للعميل",
      className: "bg-violet-50 text-violet-700",
    },
    delivered: { label: "تم التسليم", className: "bg-green-50 text-green-700" },
    // بوسطة واقفة ومحتاجة تصرّف مننا (عنوان مش واضح / العميل مش بيرد...)
    awaiting_action: {
      label: "محتاج تصرّف",
      className: "bg-amber-100 text-amber-800",
    },
    // ماتسلمتش وراجعة لنا (لسه في الطريق)
    returning: {
      label: "في الطريق ليك",
      className: "bg-orange-50 text-orange-600",
    },
    cancelled: { label: "ملغي", className: "bg-red-50 text-red-700" },
    // رجعت لنا فعلاً ومااتسلمتش
    returned: {
      label: "رجع ومتسلمش",
      className: "bg-orange-100 text-orange-800",
    },
    // اتسلّم فعلاً وبعدين العميل رجّعه (كله أو جزء) — بشحنة عكسية
    // محميّة في الداتابيز بـ trigger عشان مزامنة بوسطة ماترجّعهاش "تم التسليم"
    returned_after_delivery: {
      label: "مرتجع بعد التسليم",
      className: "bg-rose-50 text-rose-700",
    },
  };

// طرق الدفع — كاش عند الاستلام / إنستا باي / فيزا / ديبوزيت (جزء مقدم)
export const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "cod", label: "كاش عند الاستلام" },
  { value: "instapay", label: "إنستا باي" },
  { value: "visa", label: "فيزا / أونلاين" },
];

export function paymentMethodLabel(value: string | null) {
  return (
    PAYMENT_METHODS.find((m) => m.value === (value ?? "cod"))?.label ??
    "كاش عند الاستلام"
  );
}

export const ORDER_STATUS_OPTIONS = Object.entries(ORDER_STATUS_LABELS).map(
  ([value, { label }]) => ({ value, label })
);

// حالات الشحن (بتتحدّث من بوسطة تلقائياً — مش بتتحط يدوي من القايمة)
export const SHIPMENT_STATUSES = [
  "ready",
  "shipped",
  "out_for_delivery",
  "delivered",
  "awaiting_action",
  "returning",
  "returned",
];

/**
 * حالات **مالهاش قايمة خالص** — بتتحط من مسارها بس.
 *
 * "مرتجع بعد التسليم" معناها العميل استلم فعلًا وبعدين رجّع، وده مالوش لازمة
 * غير لما تعمل شحنة مرتجع من جوّه الأوردر. لو اتحطت بالإيد من القايمة تبقى
 * الأرقام غلط: بضاعة راجعة مش مسجّلة، ومخزون ماترجعش، ورسوم بوسطة تتحسب غلط.
 */
export const MANUAL_ONLY_BY_FLOW = ["returned_after_delivery"];
// من ساعة ما المندوب يستلم فما فوق (بتتحسب عليها تكلفة بوسطة)
// المرتجع بعد التسليم اتسلّم فعلاً — فبوسطة خدت رسومها كاملة عليه
export const AT_CARRIER_STATUSES = [
  "shipped",
  "out_for_delivery",
  "delivered",
  "awaiting_action",
  "returning",
  "returned",
  "returned_after_delivery",
];

/**
 * الحالات اللي نقطة التعليق الحمرا بتبان فيها.
 *
 * التعليق بيبقى ليه لازمة وإنت **لسه بتجهّز** الأوردر — «العميل قال يتأجل»
 * أو «كلّمه الأول». بعد ما يروح لبوسطة خلاص الكلام ده عدّى، والنقطة الحمرا
 * بتفضل شادّة عينك على أوردرات مافيش حاجة تتعمل فيها.
 */
export const COMMENT_DOT_STATUSES = ["new", "confirmed", "packed", "ready"];

/**
 * الحالات اللي فيها **العميل دفع الشحن فعلاً**.
 *
 * الشحن بيتحصّل على الباب، فالأوردر اللي ماوصلش العميل مادفعش فيه ولا جنيه
 * شحن مهما كان مكتوب عليه رقم. و"مرتجع بعد التسليم" داخل معاهم لأن العميل
 * استلم ودفع بجد — والمرتجع بيرجّع تمن البضاعة بس مش الشحن
 * (`lib/refund.ts`).
 */
export const CUSTOMER_PAID_STATUSES = ["delivered", "returned_after_delivery"];

// الحالات اللي معناها الأوردر مش بيتحسب في المبيعات/الأرباح
export const EXCLUDED_STATUSES = [
  "cancelled",
  "returned",
  "returned_after_delivery",
];

// الشحن الأساسي اللي الباقة بتغطيه في كل شحنة — ثابت 88 في بوسطة
export const BUNDLE_COVERS = 88;

// ===== باقات بوسطة =====
// الباقة بتتدفع شهرياً وبتغطي الشحن الأساسي لعدد شحنات معيّن.
// نصيب الأوردر الواحد = سعر الباقة ÷ عدد شحناتها.
export const BOSTA_BUNDLES = [
  { key: "basic", label: "أساسية", price: 2000, shipments: 20 },
  { key: "plus", label: "بلس", price: 3950, shipments: 40 },
  { key: "pro", label: "احترافية", price: 4500, shipments: 50 },
] as const;

export function bundlePerOrder(price: number, shipments: number) {
  if (!shipments) return 0;
  return Math.round((price / shipments) * 100) / 100;
}

// الباقة الحالية — بتتقرأ من إعدادات السيستم، ودي القيمة الافتراضية لو مفيش إعداد
export const DEFAULT_BUNDLE = BOSTA_BUNDLES[0];

// أنواع المصاريف — بتتستخدم في صفحة المصاريف وفي فواتير الموردين
export const EXPENSE_CATEGORIES = [
  "بضاعة",
  "إعلانات",
  "شحن",
  "تغليف",
  "تصنيع وخامات",
  "مواصلات",
  "اشتراكات",
  "مرتجعات",
  "أخرى",
];

export const COST_COMPONENTS = [
  "ستانليس",
  "خشب",
  "حديد",
  "زجاج",
  "رخام",
  "دهان",
  "أخرى",
] as const;

// ==========================================================================
// "آخر حركة" — بديل خانة "فلوسك" اللي اتشالت
// --------------------------------------------------------------------------
// "فلوسك" كانت بتقول وصلت/مع بوسطة/لسه/مش جاية. المشكلة إنها كانت بتجاوب
// على سؤال محدش بيسأله وقت ما بيبص على قايمة الأوردرات، وأغلب الوقت بتقول
// "لسه" أو "مع بوسطة" — يعني خانة كاملة بتقول نفس الكلام لكل الأوردرات.
//
// اللي بيفرق فعلاً: **الأوردر ده قاعد من إمتى من غير ما يتحرك.** ده اللي
// بيكشف الواقف — شحنة المندوب مجاش ياخدها، أوردر محدش أكّده، أوردر متجمّد
// زي ١٠٨١ اللي قعد أسابيع. وبيبقى أحمر أول ما يعدّي حد معقول.
//
// الحالات النهائية (اتسلّم، اتلغى، رجع) مالهاش لون — دي خلصت ومحدش مستنيها.
// ==========================================================================

/** الحالات اللي خلصت — قعادها مش مشكلة */
const SETTLED = ["delivered", "cancelled", "returned", "returned_after_delivery"];

/** بعد كام يوم من غير حركة نعتبره واقف */
const IDLE_WARN_DAYS = 3;
const IDLE_BAD_DAYS = 7;

/**
 * آخر حاجة نعرف إنها حصلت في الأوردر، وقاعد من ساعتها بكام يوم.
 *
 * **مافيش عمود بيسجّل وقت آخر تغيير**، فبناخد أحدث تاريخ نعرفه: التسليم،
 * وإلا عمل الشحنة، وإلا تاريخ الأوردر. ده أقرب حاجة للحقيقة من غير ما
 * نضيف عمود ونضطر نملّيه بأثر رجعي لـ٣٠٠ أوردر قديم.
 */
export function lastMove(
  order: {
    order_status: string | null;
    order_date?: string | null;
    created_at?: string | null;
    bosta_created_at?: string | null;
    delivered_at?: string | null;
  },
  now: Date = new Date()
): { label: string; className: string; days: number } {
  const stamps = [order.delivered_at, order.bosta_created_at, order.order_date, order.created_at]
    .map((s) => (s ? new Date(s).getTime() : NaN))
    .filter((t) => Number.isFinite(t));

  if (stamps.length === 0) {
    return { label: "—", className: "text-gray-400", days: 0 };
  }

  const days = Math.max(
    0,
    Math.floor((now.getTime() - Math.max(...stamps)) / 86_400_000)
  );

  const label = days === 0 ? "النهاردة" : days === 1 ? "امبارح" : `من ${days} يوم`;

  const settled = SETTLED.includes(String(order.order_status ?? ""));
  const className = settled
    ? "text-gray-500"
    : days >= IDLE_BAD_DAYS
      ? "text-red-700 font-medium"
      : days >= IDLE_WARN_DAYS
        ? "text-amber-700"
        : "text-gray-500";

  return { label, className, days };
}

export function orderStatusBadge(status: string | null) {
  if (!status) {
    return { label: "غير محدد", className: "bg-gray-100 text-gray-600" };
  }
  return (
    ORDER_STATUS_LABELS[status.toLowerCase()] ?? {
      label: status,
      className: "bg-gray-100 text-gray-600",
    }
  );
}

/**
 * صندوق تجميع الأوردرات القديمة — **مش منتج حقيقي**.
 *
 * اتعمل وقت استيراد الأوردرات القديمة عشان الأوردر اللي مالوش بنود معروفة
 * يبقى ليه مكان. مالوش سعر ولا تكلفة ولا مخزون، فبيتخفي من شاشة المنتجات
 * ومن ملف التكاليف ومن أكتر المنتجات مبيعًا.
 */
export const LEGACY_BUCKET_PRODUCT = "أوردر قديم (منتجات متعددة)";
