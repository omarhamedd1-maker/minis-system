// ==========================================================================
// الإيميل المنفصل لكل متجر
// --------------------------------------------------------------------------
// عمر عايز **نفس الإيميل ينفع يتسجّل في متجرين بباسوردين مختلفين** — الموظف
// اللي شغّال في متجرين مايضطرش يعمل إيميل تاني.
//
// ⚠️ **بس سوبابيز بيخلّي الإيميل فريد على مستوى المشروع كله**، ومافيش إعداد
// يغيّر ده. فالحل: السيستم بيخزّن الإيميل **مبوّب باسم المتجر**:
//
//     اللي المستخدم بيكتبه:  omar@gmail.com   (في متجر minis)
//     اللي بيتخزّن:           omar+minis@gmail.com
//
// والمستخدم عمره ما يشوف الشكل التاني — بيكتب إيميله العادي وخلاص.
//
// **وعلامة `+` مش صدفة**: دي طريقة معروفة في الإيميل (RFC 5233) وكل
// السيرفرات بتوصّل `omar+أي حاجة@gmail.com` لـ`omar@gmail.com`. يعني لو
// احتجنا يوم نبعت رسالة، هتوصل صاحبها فعلًا.
//
// وإحنا أصلًا مابنبعتش تأكيد إيميل (`email_confirm: true` عند الإنشاء)،
// فمافيش رسالة بتتبعت دلوقتي أساسًا.
//
// دوال صافية بالكامل.
// ==========================================================================

/**
 * الإيميل زي ما بيتخزّن في سوبابيز لمتجر معيّن.
 *
 * **الإيميل اللي فيه `+` خلاص بيتحطله واحدة تانية** ومابنشيلش القديمة —
 * `a+work@x.com` و`a@x.com` عنوانين مختلفين عند صاحبهم، ولو لمّيناهم
 * بقى واحد كنا هنخلّي حسابين مختلفين يتصادموا.
 */
export function scopedEmail(email: string, slug: string): string {
  const clean = String(email ?? "").trim().toLowerCase();
  const tag = String(slug ?? "").trim().toLowerCase();

  const at = clean.lastIndexOf("@");
  if (at <= 0 || !tag) return clean;

  const local = clean.slice(0, at);
  const domain = clean.slice(at + 1);
  if (!domain) return clean;

  // مبوّب خلاص لنفس المتجر؟ مانزوّدش تاني
  if (local.endsWith(`+${tag}`)) return clean;

  return `${local}+${tag}@${domain}`;
}

/**
 * الشكل اللي المستخدم بيعرفه — بنشيل تبويب المتجر بس.
 *
 * بنشيل التبويب ده **بالاسم**، مش أي حاجة بعد `+`: المستخدم اللي كاتب
 * إيميله `omar+shopify@x.com` بقصد لازم يفضل شايفه كده.
 */
export function displayEmail(email: string, slug: string): string {
  const clean = String(email ?? "").trim().toLowerCase();
  const tag = String(slug ?? "").trim().toLowerCase();
  if (!tag) return clean;

  const at = clean.lastIndexOf("@");
  if (at <= 0) return clean;

  const local = clean.slice(0, at);
  const suffix = `+${tag}`;
  if (!local.endsWith(suffix)) return clean;

  return `${local.slice(0, -suffix.length)}@${clean.slice(at + 1)}`;
}

/** الإيميل ده مبوّب للمتجر ده؟ */
export function isScopedTo(email: string, slug: string): boolean {
  const clean = String(email ?? "").trim().toLowerCase();
  const tag = String(slug ?? "").trim().toLowerCase();
  if (!tag) return false;
  const at = clean.lastIndexOf("@");
  return at > 0 && clean.slice(0, at).endsWith(`+${tag}`);
}
