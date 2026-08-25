// ==========================================================================
// المصروف بالصورة — تصوّر الفاتورة والسيستم يقراها
// --------------------------------------------------------------------------
// تسجيل المصاريف بيتأجّل لأنه شغل كتابة: نوع ومبلغ وتاريخ ووصف لكل ورقة.
// فالورق بيتكوّم، وآخر الشهر محدش فاكر الإيصال ده كان بتاع إيه — والمصروف
// اللي مااتسجّلش بيخلّي الأرباح تبان أعلى من الحقيقة.
//
// ⚠️⚠️ **القراية اقتراح مش تسجيل.** الرقم اللي بيتقرا من صورة **بيغلط**:
// الإضاءة، وخط الإيصال، والأرقام العربي، والفاتورة اللي فيها إجمالي وضريبة
// وخصم — كلها بتخلّي «٣٥٠» تبقى «٣٥» أو «٣٥٠٠». عشان كده اللي بيرجع
// بيتحط في الخانات **والمستخدم بيراجع ويأكّد**، مافيش حفظ تلقائي.
//
// ⚠️ **واللي مش متأكد منه بيرجع فاضي مش مخمّن.** الخانة الفاضية بتتملي في
// ثانية؛ الرقم الغلط بيدخل الحسابات ومحدش بيلاقيه.
//
// **الملف ده صافي** — بياخد اللي رجع من القراية وبيتحقق منه. النداء على
// كلود في `lib/receipt-read.ts`.
// ==========================================================================

import { EXPENSE_CATEGORIES } from "./format";

/**
 * أنواع المصاريف — **نفس قايمة السيستم**.
 *
 * ⚠️⚠️ **مش قايمة تانية بقصد.** لو الملف ده عمل قايمته، كلود هيرجّع نوع
 * زي «إيجار» والقايمة اللي في الشاشة مافيهاش، فالخانة تفضل فاضية والمستخدم
 * يشوف إن القراية «مابانتش» وهي بانت. القايمة الواحدة بتمنع ده تمامًا.
 */
export const CATEGORIES = EXPENSE_CATEGORIES;

export type Category = string;

/** أكبر مبلغ معقول لإيصال — أعلى من كده غالبًا قراية غلط */
export const MAX_AMOUNT = 500_000;

/** الصورة الأكبر من كده بتترفض قبل ما تتبعت */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** الأنواع اللي كلود بيقراها */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** اللي بيرجع من القراية — كله اختياري لأن أي حتة ممكن ماتبانش */
export type RawReceipt = {
  amount?: unknown;
  date?: unknown;
  vendor?: unknown;
  category?: unknown;
  note?: unknown;
};

export type ReadReceipt = {
  /** المبلغ — `null` يعني مابانش */
  amount: number | null;
  /** `2026-08-25` — و`null` لو مابانش */
  date: string | null;
  /** اسم المحل */
  vendor: string | null;
  /** نوع المصروف — واحد من `CATEGORIES` */
  category: Category | null;
  /** أي كلام زيادة من الإيصال */
  note: string | null;
  /** الحاجات اللي مابانتش أو اترفضت — بتتعرض للمستخدم */
  missing: string[];
};

/** بيحوّل الأرقام العربي لإنجليزي */
export function toEnglishDigits(text: string): string {
  return text.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/**
 * بيقرا المبلغ.
 *
 * ⚠️ **الفاصلة بتتشال والنقطة بتفضل** — «١٬٢٥٠٫٥٠» معناها ١٢٥٠٫٥ مش ١.
 * والفاصلة العربية `٬` والإنجليزية `,` الاتنين فواصل آلاف.
 */
export function parseAmount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 && value <= MAX_AMOUNT
      ? Math.round(value * 100) / 100
      : null;
  }
  if (typeof value !== "string") return null;

  const cleaned = toEnglishDigits(value)
    .replace(/[٬,\s]/g, "")
    .replace(/٫/g, ".")
    // بنشيل أي حاجة مش رقم ولا نقطة (جنيه · ج.م · EGP · LE)
    .replace(/[^\d.]/g, "");

  if (!cleaned || cleaned === ".") return null;

  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_AMOUNT) return null;
  return Math.round(n * 100) / 100;
}

/**
 * بيقرا التاريخ ويرجّعه `2026-08-25`.
 *
 * ⚠️⚠️ **التاريخ اللي في المستقبل بيترفض.** الإيصال عمره ما بيبقى بكرة،
 * والتاريخ الغلط بيوقّع المصروف في شهر تاني ويبوّظ تقرير الشهرين.
 *
 * ⚠️ **و`25/08/2026` عندنا يوم/شهر مش شهر/يوم** — الإيصال المصري بيتكتب
 * كده، والقراية بالعكس بتقلب أغسطس لمايو.
 */
export function parseDate(value: unknown, today: string): string | null {
  if (typeof value !== "string") return null;
  const raw = toEnglishDigits(value).trim();

  let y: number, m: number, d: number;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dmy = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);

  if (iso) {
    [, y, m, d] = iso.map(Number) as unknown as [unknown, number, number, number];
  } else if (dmy) {
    d = Number(dmy[1]);
    m = Number(dmy[2]);
    y = Number(dmy[3]);
    // سنة من رقمين: ٢٦ = ٢٠٢٦
    if (y < 100) y += 2000;
  } else {
    return null;
  }

  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  const out = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // التاريخ اللي مش موجود أصلًا (٣١ فبراير) بيترفض
  const check = new Date(`${out}T00:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.getUTCDate() !== d) return null;

  // ⚠️ بكرة مش تاريخ إيصال
  if (out > today) return null;

  return out;
}

/** بيتأكد إن النوع من القايمة — واللي بره بيرجع `null` */
export function parseCategory(value: unknown): Category | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return CATEGORIES.includes(clean) ? clean : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim().replace(/\s+/g, " ").slice(0, max);
  return clean || null;
}

/**
 * بيحوّل اللي رجع من القراية لحاجة تتعرض في الخانات.
 *
 * ⚠️ **`missing` هي اللي بتخلّي المستخدم يبص.** من غيرها الخانة الفاضية
 * بتبان كأنها اختيارية، والمصروف بيتحفظ ناقص.
 */
export function readReceipt(raw: RawReceipt, today: string): ReadReceipt {
  const amount = parseAmount(raw.amount);
  const date = parseDate(raw.date, today);
  const category = parseCategory(raw.category);

  const missing: string[] = [];
  if (amount === null) missing.push("المبلغ");
  if (date === null) missing.push("التاريخ");
  if (category === null) missing.push("النوع");

  return {
    amount,
    date,
    vendor: text(raw.vendor, 80),
    category,
    note: text(raw.note, 200),
    missing,
  };
}

/** «قرينا المبلغ والتاريخ — النوع مابانش» */
export function readSummary(r: ReadReceipt): string {
  if (r.missing.length === 0) return "قرينا كل حاجة — راجعها وأكّد.";
  if (r.amount === null && r.date === null && r.category === null) {
    return "معرفناش نقرا حاجة من الصورة. اكتبها بإيدك.";
  }
  return `${r.missing.join(" و")} مابانوش — كمّلهم وأكّد.`;
}

/** الصورة دي تنفع تتبعت؟ */
export function checkImage(file: {
  type: string;
  size: number;
}): { ok: true } | { ok: false; reason: string } {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, reason: "الصورة لازم تكون JPG أو PNG أو WebP" };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, reason: "الصورة كبيرة — أقصى حجم ٥ ميجا" };
  }
  if (file.size <= 0) return { ok: false, reason: "الصورة فاضية" };
  return { ok: true };
}
