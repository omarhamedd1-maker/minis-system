// ==========================================================================
// بحث واحد لكل حاجة
// --------------------------------------------------------------------------
// دلوقتي عشان تلاقي حاجة لازم تعرف **هي فين الأول**: رقم الأوردر في شاشة
// الأوردرات، والتليفون في العملاء، ورقم التتبع مالوش بحث أصلًا. والخانة
// الواحدة بتشيل الخطوة دي.
//
// الملف ده بيقرا اللي اتكتب ويقول **يدوّر على إيه** — عشان مانضربش خمس
// استعلامات على كل حرف.
//
// ⚠️ **الأرقام في مصر بتيجي بأشكال كتير**: `0100 123 4567` و`+201001234567`
// و`٠١٠٠١٢٣٤٥٦٧` كلهم نفس التليفون. التطبيع هنا بيخلّيهم رقم واحد.
//
// **الملف ده صافي** — نص داخل وخطة بحث خارجة.
// ==========================================================================

/** أرقام عربية ← إنجليزية */
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function toEnglishDigits(text: string): string {
  let out = "";
  for (const ch of text) {
    const i = ARABIC_DIGITS.indexOf(ch);
    out += i >= 0 ? String(i) : ch;
  }
  return out;
}

/** بيسيب الأرقام بس — للتليفونات وأرقام التتبع */
export function digitsOnly(text: string): string {
  return toEnglishDigits(text).replace(/[^0-9]/g, "");
}

export type SearchPlan = {
  /** النص بعد التنضيف — ده اللي بيتبعت للبحث بالاسم */
  text: string;
  /** الأرقام اللي جوّاه، لو فيه */
  digits: string;
  /** ندوّر على رقم أوردر؟ */
  orderNumber: boolean;
  /** ندوّر على تليفون؟ */
  phone: boolean;
  /** ندوّر على رقم تتبع بوسطة؟ */
  tracking: boolean;
  /** ندوّر بالاسم (عميل أو منتج)؟ */
  name: boolean;
};

/**
 * ⚠️ **التليفون المصري ١١ رقم والتتبع أطول.** الأرقام القصيرة (٣–٦) بتبقى
 * أرقام أوردرات، والطويلة بتتجرّب كتليفون وتتبع مع بعض — بنجرّب الاتنين بدل
 * ما نخمّن، الاستعلام أرخص من نتيجة ضايعة.
 */
const ORDER_NUMBER_MAX = 7;
const PHONE_MIN = 7;

/** أقل عدد حروف للبحث بالاسم — الحرف الواحد بيرجّع كل حاجة */
export const MIN_NAME_LENGTH = 2;

export function planSearch(raw: string | null | undefined): SearchPlan | null {
  const text = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!text) return null;

  const digits = digitsOnly(text);
  // النص كله أرقام (سواء بمسافات أو شرط أو +)؟
  const allDigits = digits.length > 0 && /^[\s+\-()0-9٠-٩]+$/.test(text);

  if (allDigits) {
    return {
      text,
      digits,
      orderNumber: digits.length <= ORDER_NUMBER_MAX,
      phone: digits.length >= PHONE_MIN,
      tracking: digits.length >= PHONE_MIN,
      name: false,
    };
  }

  return {
    text,
    digits,
    orderNumber: false,
    phone: false,
    tracking: false,
    name: text.length >= MIN_NAME_LENGTH,
  };
}
