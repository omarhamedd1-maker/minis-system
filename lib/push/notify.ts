// ==========================================================================
// تنبيه واحد بيروح على القناتين
// --------------------------------------------------------------------------
// عمر عايز الاتنين: الإشعار على الموبايل بيتشاف فورًا وبيروح، وتليجرام
// بيفضل سجل مكتوب يرجع له هو والشركا.
//
// **والقناتين مستقلتين عن بعض.** لو واحدة وقعت التانية بتشتغل، ولو الاتنين
// وقعوا المزامنة بتكمّل عادي — تنبيه مايوصلش أهون من مزامنة تقع.
//
// وتليجرام بياخد HTML، والإشعار بياخد نص عادي — فبنشيل الوسوم للإشعار.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPush, type PushResult } from "./send";
import { reserveOnce } from "./once";

/** بيشيل وسوم HTML ويسيب النص — الإشعار مابيعرضش وسوم */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * علامة «ابدأ من الشمال» — حرف مخفي مالوش شكل.
 * https://unicode.org/reports/tr9 — علامة LRM
 */
const LEFT_MARK = "‎";

/**
 * بيخلّي كل سطور الإشعار على الشمال.
 *
 * التليفون بيحدد اتجاه كل سطر لوحده من **أول حرف حقيقي فيه**: السطر اللي
 * بيبدأ بعربي بيروح يمين واللي بيبدأ بإنجليزي بيروح شمال. وسطر `from Gridpoint`
 * بتاع آبل إنجليزي دايمًا وعلى الشمال دايمًا — فالإشعار كان بيطلع مقسوم.
 *
 * العلامة دي بتتحط قبل كل سطر فبتخلّيه شمال زي سطر آبل، والكلمات العربي
 * جوّاه بتفضل متقرية عادي. عمر شافها على تليفونه وقرر إن الشكل الموحّد
 * أوضح من إن كل سطر يروح ناحية.
 */
export function forceLeft(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.trim() ? LEFT_MARK + line : line))
    .join("\n");
}

/** أول سطر = عنوان الإشعار، والباقي = جسمه */
function splitTitle(text: string): { title: string; body: string } {
  const lines = plainText(text).split("\n");
  const title = (lines.shift() ?? "Gridpoint").trim();
  return {
    title: forceLeft(title),
    body: forceLeft(lines.join("\n").trim()),
  };
}

/**
 * تنبيه لكل الأجهزة.
 *
 * ⚠️⚠️ **التنبيه اللي معاه `tag` بيتبعت مرة واحدة بس.**
 *
 * `tag` في الويب بوش **مابيمنعش الإرسال** — هو بيخلّي الجهاز يستبدل الإشعار
 * القديم على الشاشة، والرسالة بتتبعت برضه والتليفون بيرن برضه. يعني كل
 * التنبيهات المربوطة بتاج كانت بتتبعت **كل ربع ساعة طول اليوم** مع كل لفة
 * كرون: `cod-<أوردر>` و`stale-<أوردر>` و`drop-<اليوم>` وكلهم.
 *
 * عمر اتضرب بده يوم ٢٠ أغسطس ٢٠٢٦ والتنبيه فضل يرن من الفجر.
 *
 * **فالمنع اتحط هنا مش عند كل نداء** — عشان أي تنبيه جديد يتكتب بكرة
 * يبقى محمي من غير ما حد يفتكر.
 *
 * ⚠️ **يبقى كل تاج لازم يوصف مرة واحدة**: `weekly-<الأسبوع>` مش `weekly`،
 * وإلا التنبيه بيتبعت مرة في العمر.
 */
export async function notifyAll(
  db: SupabaseClient,
  tenantId: string,
  message: string,
  opts?: { url?: string; tag?: string; fetchImpl?: typeof fetch }
): Promise<void> {
  if (opts?.tag) {
    const gate = await reserveOnce(db, tenantId, opts.tag);
    if (!gate.send) return;
  }

  const { title, body } = splitTitle(message);

  // **تليجرام اتشال.** التنبيهات بقت على الموبايل بس — إشعار من البرنامج
  // نفسه من غير وسيط ولا بوت ولا جروب يتظبّط.
  await sendPush(db, tenantId, {
    title,
    body,
    url: opts?.url,
    tag: opts?.tag,
  });
}

/**
 * إشعار لناس محددة بأسمائهم — ده اللي شاشة `/notify` بتستخدمه.
 *
 * الفرق عن `notifyAll` إنه بيرجّع نتيجة الإرسال بدل ما يبلعها: التنبيه
 * التلقائي مايوقفش المزامنة لو فشل، لكن الرسالة اللي حد كتبها بإيده
 * **لازم يعرف وصلت لكام جهاز** — «اتبعتت» من غير رقم كذبة.
 */
export async function notifyPeople(
  db: SupabaseClient,
  tenantId: string,
  authUserIds: string[],
  message: string,
  opts?: { url?: string; tag?: string }
): Promise<PushResult> {
  const { title, body } = splitTitle(message);
  return sendPush(
    db,
    tenantId,
    { title, body, url: opts?.url, tag: opts?.tag },
    { authUserIds }
  );
}
