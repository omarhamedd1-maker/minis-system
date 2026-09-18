/**
 * ==========================================================================
 * عنوان استقبال إيميل التحويل (TRANSFERS §٣)
 * --------------------------------------------------------------------------
 * لكل بيزنس عنوان سري: `transfers+<مفتاح>@<الدومين>`. المشتري بيعمل قاعدة
 * واحدة في جيميل: «الجاي من no-reply@bosta.co وعنوانه Cashout Receipt →
 * حوّله للعنوان ده».
 *
 * ⚠️ **المفتاح سر** — اللي يعرفه يقدر يبعت إيميل. بس معرفته لوحدها مش
 * كفاية: الإيميل لازم يعدّي التوقيع والمطابقة ورقم الفاتورة (§٤).
 *
 * ⚠️ **وجيميل مابيحوّلش لعنوان جديد غير بعد كود تأكيد** بيوصل للعنوان ده
 * — يعني بيوصل عندنا إحنا. فالشاشة لازم تعرضه، وإلا الإعداد بيقف.
 *
 * **الملف ده صافي** — نصوص بس.
 * ==========================================================================
 */

export const INBOX_USER = "transfers";

/** العنوان السري للبيزنس — و`null` لو المفتاح أو الدومين ناقص */
export function payoutAddress(
  key: string | null | undefined,
  domain: string | null | undefined
): string | null {
  const k = String(key ?? "").trim();
  const d = String(domain ?? "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!k || !d) return null;
  return `${INBOX_USER}+${k}@${d}`;
}

/**
 * المفتاح من العنوان اللي الإيميل وصل عليه.
 *
 * ⚠️ **بيقرا اللي بعد `+` بس** — مزوّدين البريد بيضيفوا اسم العرض
 * (`"اسم" <transfers+abc@x.com>`) وبيغيّروا حالة الأحرف.
 */
export function keyFromAddress(to: string | null | undefined): string | null {
  const raw = String(to ?? "");
  const inAngles = /<([^>]+)>/.exec(raw)?.[1] ?? raw;
  const at = inAngles.trim().toLowerCase();
  const m = new RegExp(`^${INBOX_USER}\\+([a-z0-9]+)@`).exec(at);
  return m ? m[1] : null;
}

/** ⚠️ كود تأكيد جيميل — رقم من ٥ لـ١٢ خانة في عنوان الرسالة أو جسمها */
export function gmailConfirmationCode(subject: string, body: string): string | null {
  const text = `${subject ?? ""}\n${body ?? ""}`;
  if (!/gmail|forwarding|تحويل البريد|confirmation/i.test(text)) return null;
  return /\b(\d{5,12})\b/.exec(text)?.[1] ?? null;
}

/** خطوات الإعداد — بتتعرض في الشاشة زي ما هي */
export function setupSteps(address: string): string[] {
  return [
    "افتح جيميل ← الإعدادات ← Forwarding and POP/IMAP",
    `ضيف العنوان ده: ${address}`,
    "جيميل هيبعت كود تأكيد للعنوان ده — هيبان في الشاشة دي خلال دقيقة",
    "ارجع لجيميل وحط الكود",
    "بعدين: Filters ← قاعدة جديدة — من no-reply@bosta.co وفيها Cashout Receipt ← حوّلها للعنوان ده",
  ];
}
