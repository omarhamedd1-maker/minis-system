// ==========================================================================
// لينك الأوردر المباشر
// --------------------------------------------------------------------------
// الأوردرات كلها بتيجي من شوبيفاي. واللي بييجي من رسالة إنستجرام أو مكالمة
// بيتكتب بالإيد — يعني وقت، وغلط في العنوان، وأوردرات بتضيع.
//
// اللينك ده بيقلب الحكاية: تبعت لينك فيه المنتج وسعره، **العميل هو اللي
// بيملا عنوانه**، والأوردر بيتعمل لوحده وبيبان عندك في «محتاج تأكيد».
//
// ⚠️⚠️ **العنوان اللي العميل بيكتبه بنفسه أنضف من اللي بتكتبه إنت وهو
// بيمليه عليك في التليفون** — وأكبر سبب رجوع عندك بعد الرفض هو العنوان.
//
// ⚠️ **والسعر بيتقرا من الداتابيز مش من اللينك** — لو كان في اللينك، أي حد
// يقدر يعدّله ويطلب بجنيه.
//
// **الملف ده صافي** — بيتأكد من اللي العميل كتبه وبيرجّع الغلط بالعربي.
// ==========================================================================

/** أرقام عربية ← إنجليزية، والباقي بيتشال */
export function onlyDigits(value: string | null | undefined): string {
  let out = "";
  for (const ch of String(value ?? "")) {
    const ar = "٠١٢٣٤٥٦٧٨٩".indexOf(ch);
    if (ar >= 0) out += String(ar);
    else if (ch >= "0" && ch <= "9") out += ch;
  }
  return out;
}

/**
 * التليفون المصري بشكله المحلي: `01…`
 *
 * ⚠️ **بيترجع لشكل واحد بقصد** — نفس الرقم بيتكتب `+20…` و`0020…` و`1…`،
 * ولو اتخزّن بأشكال مختلفة العميل بيتعمل مرتين وتاريخه بيتقسم.
 */
export function normalizePhone(value: string | null | undefined): string {
  let d = onlyDigits(value);
  if (d.startsWith("0020")) d = d.slice(4);
  else if (d.startsWith("20") && d.length > 10) d = d.slice(2);
  if (d && !d.startsWith("0")) d = "0" + d;
  return d;
}

/** ⚠️ التليفون المصري ١١ رقم — أقل من كده مش هيرد عليه حد */
export const PHONE_LENGTH = 11;

/** ⚠️ العنوان الأقصر من كده المندوب مش هيلاقيه */
export const MIN_ADDRESS = 15;

export const MAX_QUANTITY = 10;

export type LinkOrderInput = {
  fullName?: string | null;
  phone?: string | null;
  address?: string | null;
  quantity?: number | string | null;
};

export type LinkOrderReady = {
  ok: true;
  fullName: string;
  phone: string;
  address: string;
  quantity: number;
};

export type LinkOrderCheck = LinkOrderReady | { ok: false; error: string };

/**
 * فحص اللي العميل كتبه.
 *
 * ⚠️ **رسالة الغلط بتقول الحاجة الناقصة بالظبط** — «فيه بيانات ناقصة» بتخلّي
 * العميل يقفل الصفحة.
 */
export function checkLinkOrder(input: LinkOrderInput): LinkOrderCheck {
  const fullName = String(input.fullName ?? "").trim().replace(/\s+/g, " ");
  if (fullName.length < 3) {
    return { ok: false, error: "اكتب اسمك" };
  }

  const phone = normalizePhone(input.phone);
  if (phone.length !== PHONE_LENGTH) {
    return { ok: false, error: "اكتب رقم موبايل صح (١١ رقم)" };
  }

  const address = String(input.address ?? "").trim().replace(/\s+/g, " ");
  if (address.length < MIN_ADDRESS) {
    return {
      ok: false,
      error: "اكتب العنوان بالتفصيل — الشارع ورقم العمارة والدور",
    };
  }

  const raw = Number(input.quantity ?? 1);
  const quantity = Number.isInteger(raw) && raw > 0 ? raw : 1;
  if (quantity > MAX_QUANTITY) {
    return { ok: false, error: `أقصى كمية ${MAX_QUANTITY}` };
  }

  return { ok: true, fullName, phone, address, quantity };
}

/**
 * رقم الأوردر الجاي من لينك.
 *
 * ⚠️ **بيبدأ بحرف مختلف عن اليدوي (`M-`)** — عشان تعرف من الرقم نفسه إن
 * ده أوردر العميل عمله بإيده، من غير ما تفتح الأوردر.
 */
export function linkOrderNumber(now: Date = new Date()): string {
  return `L-${String(now.getTime()).slice(-6)}`;
}
