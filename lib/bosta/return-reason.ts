// ==========================================================================
// سبب الرجوع — من بوسطة نفسها
// --------------------------------------------------------------------------
// خانة سبب الرجوع عندنا كانت بتتملى بالإيد، ونتيجتها إن **٤٩ شحنة راجعة
// صفر منهم ليه سبب** — فشاشة «رجعوا ليه؟» فاضية وهتفضل فاضية.
//
// وبوسطة بتقول السبب أصلًا: `state.exception[]` فيها كل محاولة وسببها وكودها.
// اتفحصت الـ٤٩ شحنة (١٩ أغسطس ٢٠٢٦) و**٣٣ منهم عند بوسطة سبب**، والباقي
// (١٦) مالهومش أي محاولة مسجّلة.
//
// ⚠️⚠️ **آخر محاولة هي السبب، مش كل المحاولات.** الشحنة اللي العميل أجّلها
// ٣ مرات وبعدين رفض يستلم رجعت **عشان الرفض** — لو عدّينا كل محاولة، «طلب
// التأجيل» هيطلع أشهر سبب عندك وهو مجرد خطوة في الطريق.
//
// ⚠️ **والمطابقة بالكود مش بالنص.** بوسطة بتغيّر صيغة الجملة، والكود ثابت —
// ودي نفس الغلطة اللي وقعنا فيها قبل كده مع `state.value` (الكود ٤٦ معناه
// «رجع للتاجر» والنص بيقراه حد على إنه «اتسلّم»). النص فاضل كخطة تانية بس.
//
// **الملف ده صافي** — مافيش شبكة.
// ==========================================================================

/**
 * كود محاولة بوسطة ← سببنا.
 *
 * الأكواد دي اتشافت فعلًا في داتا مينيز، والعدد جنب كل واحد هو عدد المحاولات
 * (مش الشحنات) وقت الفحص.
 */
const BY_CODE: Record<number, string> = {
  // «العميل رفض يستلم» — ٢١ محاولة
  8: "refused_on_delivery",
  // «العميل طلب التأجيل» — ١٦ · و٢١ هو نفس الحاجة بس من ناحيتنا
  3: "postponed_too_long",
  21: "postponed_too_long",
  // «مشكلة في المنتج» — ٦.
  // ⚠️ ده اجتهاد: بوسطة بتقول «product issue» من غير تفصيل، وأقرب سبب عندنا
  // هو «غيّر رأيه» — وعلاجه المكتوب («راجع صور المنتج ووصفه») هو نفس العلاج
  // الصح للحالة دي.
  104: "changed_mind",
  // «العميل مش في العنوان» و«العميل مش بيرد»
  1: "no_answer",
  7: "no_answer",
  // «العميل غيّر العنوان» و«العنوان مش واضح»
  2: "unclear_address",
  13: "unclear_address",
  // ⚠️ دول **مش أسباب عميل**: إلغاء من التاجر، أو التاجر مش بيرد، أو
  // المندوب مالقاش التاجر وقت الرجوع. بتتحط «سبب تاني» عشان ماتلوّثش
  // إحصائية أسباب العملاء.
  6: "other",
  23: "other",
  25: "other",
};

/** خطة تانية لو الكود جديد — بنقرا الجملة */
const BY_TEXT: [RegExp, string][] = [
  [/refuses? to receive/i, "refused_on_delivery"],
  [/postpon/i, "postponed_too_long"],
  [/product issue/i, "changed_mind"],
  [/not in the address|not answering|no answer/i, "no_answer"],
  [/address not clear|changed the address|wrong address/i, "unclear_address"],
  [/damaged/i, "damaged"],
  [/out of (delivery )?(zone|coverage)/i, "out_of_coverage"],
];

export type BostaAttemptIn = {
  code?: number | null;
  reason?: string | null;
  time?: string | null;
};

/**
 * سبب رجوع الشحنة من محاولات بوسطة.
 *
 * بيرجّع `null` لو مافيش محاولات خالص — و`null` معناها **مانعرفش**، مش
 * «سبب تاني». الفرق مهم: «سبب تاني» بتقول إن حد بصّ ومالقاش تصنيف،
 * والفاضي بيقول إن بوسطة نفسها ماسجّلتش حاجة.
 */
export function returnReasonFromBosta(
  attempts: BostaAttemptIn[] | null | undefined
): string | null {
  const list = (attempts ?? []).filter(
    (a) => a && (a.code !== null || a.reason)
  );
  if (list.length === 0) return null;

  // آخر محاولة بالوقت — واللي من غير وقت بتفضل بترتيبها زي ما جت
  const sorted = [...list].sort((a, b) => {
    const ta = a.time ? new Date(a.time).getTime() : 0;
    const tb = b.time ? new Date(b.time).getTime() : 0;
    if (Number.isNaN(ta) || Number.isNaN(tb)) return 0;
    return ta - tb;
  });
  const last = sorted[sorted.length - 1];

  const code = Number(last.code);
  if (Number.isFinite(code) && BY_CODE[code]) return BY_CODE[code];

  const text = String(last.reason ?? "");
  for (const [re, value] of BY_TEXT) {
    if (re.test(text)) return value;
  }

  // فيه محاولة بس مش فاهمينها — دي «سبب تاني» بجد
  return "other";
}
