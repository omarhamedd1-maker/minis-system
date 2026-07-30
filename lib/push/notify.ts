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
import { sendTelegram } from "../telegram";
import { sendPush } from "./send";

/** بيشيل وسوم HTML ويسيب النص — الإشعار مابيعرضش وسوم */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** أول سطر = عنوان الإشعار، والباقي = جسمه */
function splitTitle(text: string): { title: string; body: string } {
  const lines = plainText(text).split("\n");
  const title = (lines.shift() ?? "مينيز").trim();
  return { title, body: lines.join("\n").trim() };
}

export async function notifyAll(
  db: SupabaseClient,
  tenantId: string,
  message: string,
  opts?: { url?: string; tag?: string; fetchImpl?: typeof fetch }
): Promise<void> {
  const { title, body } = splitTitle(message);

  await Promise.allSettled([
    sendTelegram(db, tenantId, message, opts?.fetchImpl),
    sendPush(db, tenantId, {
      title,
      body,
      url: opts?.url,
      tag: opts?.tag,
    }),
  ]);
}
