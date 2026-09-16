// ==========================================================================
// عزل الكلام الإنجليزي جوّه الجملة العربي
// --------------------------------------------------------------------------
// ⚠️ **الجملة العربي اللي جوّاها إيميل أو دومين أو رقم تتبع بتتلخبط.**
// المتصفح بيرتّب الاتجاهات لوحده، فالنقطة والقوسين والفاصلة بيقفزوا لمكان
// تاني والجملة تبقى متداخلة. مثال حقيقي:
//
//   قبل:  اكتب دومينك زي ده: yourshop.myshopify.com، وبعدين اضغط
//   بعد:  ← نفس الجملة والدومين في مكانه بالظبط
//
// علامتين `U+2066` (ابدأ عزل من الشمال) و`U+2069` (اقفل العزل) بيقولوا
// للمتصفح: **الحتة دي وحدة واحدة، رتّبها جوّه نفسها وسيب الباقي**.
// الحرفين مالهمش شكل، فمحدش بيشوفهم.
//
// للنصوص العادية. أما في الشاشات فبنستخدم `dir="ltr"` على العنصر نفسه —
// المتصفح بيعمله عزل تلقائي.
// ==========================================================================

const LTR_ISOLATE = "⁦";
const POP_ISOLATE = "⁩";

/** بيعزل حتة إنجليزي جوّه جملة عربي عشان الترتيب مايتلخبطش */
export function ltr(text: string | number | null | undefined): string {
  const s = String(text ?? "").trim();
  if (!s) return "";
  return `${LTR_ISOLATE}${s}${POP_ISOLATE}`;
}

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

const ORDER_STATUS_LABELS: Record<string, { label: string }> =
  {
    new: { label: "جديد" },
    confirmed: { label: "مؤكد" },
    packed: { label: "تم التغليف" },
    // الشحنة اتعملت عند بوسطة ومستنية المندوب
    ready: { label: "جاهز للبيك اب" },
    // بوسطة شايلة الأوردر: المندوب استلمه منّنا، أو هو في مخزنهم، أو بين
    // الفروع. الاسم القديم كان "مع المندوب" وده كان بيكدب — شحنة قاعدة في
    // مخزن بوسطة ماحدش ماشي بيها.
    shipped: {
      label: "استلمه بوسطة",
    },
    // خرجت من الفرع وماشية للعميل
    out_for_delivery: {
      label: "في الطريق للعميل",
    },
    delivered: { label: "تم التسليم" },
    // بوسطة واقفة ومحتاجة تصرّف مننا (عنوان مش واضح / العميل مش بيرد...)
    awaiting_action: {
      label: "محتاج تصرّف",
    },
    // ماتسلمتش وراجعة لنا (لسه في الطريق)
    returning: {
      label: "في الطريق ليك",
    },
    cancelled: { label: "ملغي" },
    // رجعت لنا فعلاً ومااتسلمتش
    returned: {
      label: "رجع ومتسلمش",
    },
    // اتسلّم فعلاً وبعدين العميل رجّعه (كله أو جزء) — بشحنة عكسية
    // محميّة في الداتابيز بـ trigger عشان مزامنة بوسطة ماترجّعهاش "تم التسليم"
    returned_after_delivery: {
      label: "مرتجع بعد التسليم",
    },
  };

/**
 * كلاس شارة حالة الأوردر — من نظام التصميم (`app/globals.css`).
 *
 * ⚠️ **اسم الكلاس = `badge-` + مفتاح الحالة بالظبط**، وكل حالة ليها
 * قاعدة في `globals.css`. الاختبار `lib/order-status-class.test.ts` بيقع
 * لو حالة جديدة اتضافت هنا من غير شكلها هناك — من غيره الشارة بتطلع
 * نص عادي من غير لون ومحدش بياخد باله.
 *
 * ⚠️ **والمجهول بياخد `badge-neutral`** مش `badge-` + القيمة الغريبة.
 */
export function orderStatusClass(status: string | null | undefined): string {
  const key = String(status ?? "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ORDER_STATUS_LABELS, key)
    ? `badge badge-dot badge-${key}`
    : "badge badge-neutral";
}

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

/**
 * الطرق اللي معناها **الفلوس وصلت قبل ما الشحنة تتحرّك**.
 *
 * ⚠️ **القايمة مقفولة عن قصد، والمجهول بيتحسب كاش.** الفحص القديم كان
 * `!== "cod"` — أي قيمة غريبة في الخانة كانت بتعدّي كأنها دفع مقدم.
 * وده مش غلط ساكت: شريحة «بيدفع مقدم» بتقول للتاجر **«دول مفيش خطر رجوع
 * معاهم»**، فبيبعت لهم أغلى منتج عنده على أساس فلوسه مضمونة.
 *
 * وحصل بالفعل: بيزنس اتكتبت فيه الخانة **بالمسمّى العربي** بدل المفتاح
 * (`"كاش عند الاستلام"` مش `"cod"`)، فطلع **كل عملاءه** في الشريحة —
 * ١٨٢ من ١٨٢.
 *
 * الغلط في اتجاه الكاش أرخص: أسوأ حاجة إن عميل بيدفع مقدم مايبانش.
 */
const PREPAID_METHODS = new Set(["instapay", "visa"]);

export function isPrepaidMethod(value: string | null | undefined): boolean {
  return PREPAID_METHODS.has(String(value ?? "").trim());
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

// باقات بوسطة التقديرية (`BUNDLE_COVERS` · `BOSTA_BUNDLES` ·
// `bundlePerOrder` · `DEFAULT_BUNDLE`) اتمسحت ٢٤ أغسطس — ميتة من ٦ أغسطس
// ومحدش بينده عليها. الرسوم بقت بتتقرا **حقيقية من كشف حساب بوسطة**
// (`bosta_ship_fee_real`)، فنصيب الباقة التقديري بقى بيدغدغ.

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
  // ⚠️ التلاتة دول مابيدخلوش حساب الربح — lib/profit-exclusions.ts
  "باقة بوسطة",
  "سحوبات",
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
    return { label: "—", className: "text-ink-faint", days: 0 };
  }

  const days = Math.max(
    0,
    Math.floor((now.getTime() - Math.max(...stamps)) / 86_400_000)
  );

  const label = days === 0 ? "النهاردة" : days === 1 ? "امبارح" : `من ${days} يوم`;

  const settled = SETTLED.includes(String(order.order_status ?? ""));
  const className = settled
    ? "text-ink-muted"
    : days >= IDLE_BAD_DAYS
      ? "text-danger font-medium"
      : days >= IDLE_WARN_DAYS
        ? "text-warning"
        : "text-ink-muted";

  return { label, className, days };
}

/** اسم الحالة بالعربي — الشكل من `orderStatusClass` */
export function orderStatusBadge(status: string | null): { label: string } {
  if (!status) return { label: "غير محدد" };
  const key = status.toLowerCase();
  return {
    label: Object.prototype.hasOwnProperty.call(ORDER_STATUS_LABELS, key)
      ? ORDER_STATUS_LABELS[key].label
      : status,
  };
}

/**
 * صندوق تجميع الأوردرات القديمة — **مش منتج حقيقي**.
 *
 * اتعمل وقت استيراد الأوردرات القديمة عشان الأوردر اللي مالوش بنود معروفة
 * يبقى ليه مكان. مالوش سعر ولا تكلفة ولا مخزون، فبيتخفي من شاشة المنتجات
 * ومن ملف التكاليف ومن أكتر المنتجات مبيعًا.
 */
export const LEGACY_BUCKET_PRODUCT = "أوردر قديم (منتجات متعددة)";
