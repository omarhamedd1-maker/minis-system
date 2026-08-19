// ==========================================================================
// قالب الرسالة — نص واحد بيتظبط مرة وبيتملي لكل عميل
// --------------------------------------------------------------------------
// الرسالة الجاهزة كانت مكتوبة في الكود، يعني صاحب المتجر ماكانش يقدر يغيّر
// كلمة فيها. والكلام ده بيروح لعملاءه هو بصوته هو — فلازم يكون بتاعه.
//
// الخانات بتتكتب بالعربي بين قوسين معكوفين: `{الاسم}` و`{المنتج}`. اخترناها
// عربي عشان اللي بيكتب القالب مايحتاجش يبدّل لوحة المفاتيح في نص الجملة.
//
// ⚠️⚠️ **الخانة اللي مالهاش قيمة بتتشال هي والمسافة اللي وراها — مابتفضلش
// مكتوبة.** الرسالة اللي فيها «أهلًا {الاسم}» وبتروح للعميل كده أوحش بكتير
// من رسالة من غير اسم.
//
// ⚠️ **والخانة اللي مش في القايمة بتفضل زي ما هي** — لو صاحب المتجر كتب
// `{حاجة}` غلط، مانمسحش كلامه؛ نسيبه يشوفه ويصلّحه.
//
// **الملف ده صافي** — نص داخل ونص خارج.
// ==========================================================================

/** الخانات المسموحة — الاسم المعروض، ومفتاحه في الداتا */
export const PLACEHOLDERS = [
  { token: "الاسم", hint: "اسم العميل الأول" },
  { token: "المنتج", hint: "اللي اشتراه" },
  { token: "رقم الأوردر", hint: "زي 1367" },
  { token: "المتجر", hint: "اسم متجرك" },
  { token: "لينك التتبع", hint: "صفحة التتبع باسم متجرك" },
] as const;

export type TemplateVars = Partial<Record<string, string | null | undefined>>;

/**
 * القالب الافتراضي — بيتستخدم لو صاحب المتجر ماكتبش حاجة.
 *
 * ⚠️ **قصير وبيسأل سؤال واحد.** الرسالة الطويلة اللي فيها طلب تقييم ولينك
 * وعرض جديد بتتقري كإعلان وبتتقفل — والهدف هنا إن العميل **يرد**.
 */
export const DEFAULT_FOLLOWUP_TEMPLATE = `أهلًا {الاسم} 👋
وصلك {المنتج} من كام يوم، عايزين نطمن: كل حاجة تمام؟
لو فيه أي مشكلة قول لنا وهنحلّها.`;

/** أطول قالب مسموح — الرسالة الأطول من كده بتتقري كإعلان */
export const MAX_TEMPLATE_LENGTH = 700;

/**
 * بيملا القالب بقيم عميل واحد.
 *
 * الخانة الفاضية بتتشال ومعاها المسافة اللي وراها، والسطر اللي بقى فاضي
 * خالص بيتشال كمان — عشان الرسالة ماتوصلش بسطر فاضي في نصها.
 */
export function renderTemplate(
  template: string | null | undefined,
  vars: TemplateVars
): string {
  const raw = String(template ?? "").trim() || DEFAULT_FOLLOWUP_TEMPLATE;

  const known = new Set<string>(PLACEHOLDERS.map((p) => p.token));

  const filled = raw.replace(/\{([^{}]+)\}\s?/g, (whole, name: string) => {
    const token = String(name).trim();
    // مش خانة نعرفها؟ سيبها زي ما هي عشان صاحب المتجر يشوف غلطته
    if (!known.has(token)) return whole;
    const value = String(vars[token] ?? "").trim();
    return value ? `${value}${whole.endsWith(" ") ? " " : ""}` : "";
  });

  return filled
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trimEnd())
    .filter((line, i, all) => line !== "" || (i > 0 && all[i - 1] !== ""))
    .join("\n")
    .trim();
}

/**
 * فحص القالب قبل الحفظ.
 *
 * بيرجّع رسالة الغلط، أو `null` لو تمام.
 */
export function validateTemplate(template: string): string | null {
  const t = String(template ?? "").trim();
  if (!t) return "الرسالة فاضية";
  if (t.length > MAX_TEMPLATE_LENGTH) {
    return `الرسالة طويلة (${t.length} حرف) — الحد ${MAX_TEMPLATE_LENGTH}`;
  }

  const known = new Set<string>(PLACEHOLDERS.map((p) => p.token));
  const unknown = [...t.matchAll(/\{([^{}]+)\}/g)]
    .map((m) => m[1].trim())
    .filter((name) => !known.has(name));

  if (unknown.length > 0) {
    return `مافيش خانة اسمها {${unknown[0]}} — المتاح: ${PLACEHOLDERS.map(
      (p) => `{${p.token}}`
    ).join(" · ")}`;
  }

  return null;
}
