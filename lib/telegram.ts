// ==========================================================================
// تنبيهات تليجرام
// --------------------------------------------------------------------------
// كل بيزنس ببوته وجروبه — المفاتيح في `tenant_credentials`.
//
// **قاعدة: الإرسال مايوقفش أي حاجة.** لو البوت مش مظبّط أو تليجرام واقع،
// بنرجّع نتيجة ونكمّل. تنبيه مابيوصلش أهون من مزامنة بتقع.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTenantCredentials } from "./tenant-settings";

const TELEGRAM_API = "https://api.telegram.org";
const TIMEOUT_MS = 10000;

export type SendResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "failed"; error?: string };

/** بيبعت رسالة على جروب البيزنس */
export async function sendTelegram(
  db: SupabaseClient,
  tenantId: string,
  text: string,
  fetchImpl: typeof fetch = fetch
): Promise<SendResult> {
  let token: string | null = null;
  let chatId: string | null = null;

  try {
    const creds = await loadTenantCredentials(db, tenantId);
    token = creds.telegramBotToken;
    chatId = creds.telegramChatId;
  } catch (e) {
    return {
      ok: false,
      reason: "failed",
      error: e instanceof Error ? e.message : "معرفناش نقرا مفاتيح البيزنس",
    };
  }

  if (!token || !chatId) return { ok: false, reason: "not_configured" };

  try {
    const res = await fetchImpl(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => null);
      return {
        ok: false,
        reason: "failed",
        error: String(j?.description ?? `تليجرام ردّ بكود ${res.status}`),
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: "failed",
      error: e instanceof Error ? e.message : "معرفناش نوصل لتليجرام",
    };
  }
}

/** بيتأكد إن البوت والجروب شغالين — لزرار "جرّب" في الإعدادات */
export async function testTelegram(
  db: SupabaseClient,
  tenantId: string,
  fetchImpl: typeof fetch = fetch
): Promise<SendResult> {
  return sendTelegram(
    db,
    tenantId,
    "✅ <b>مينيس</b>\nالتنبيهات مظبوطة — الرسالة دي تجربة.",
    fetchImpl
  );
}

// ==========================================================================
// نصوص التنبيهات
// ==========================================================================

export type FailedDeliveryAlert = {
  orderNumber: string | number | null;
  customerName: string | null;
  customerPhone: string | null;
  tracking: string | null;
  /** سبب بوسطة لو كتبته */
  reason: string | null;
  /** رجعت خلاص ولا لسه في الطريق لينا */
  arrived: boolean;
  siteUrl?: string | null;
};

/**
 * رسالة "العميل مستلمش".
 * دي أهم تنبيه في السيستم — معناها بضاعة راجعة وفلوس ماوصلتش، ولازم حد
 * يكلّم العميل **دلوقتي** قبل ما الشحنة توصل المخزن وتبقى خسارة مؤكدة.
 */
export function failedDeliveryMessage(a: FailedDeliveryAlert): string {
  const lines = [
    a.arrived
      ? "📦 <b>أوردر رجع ومتسلّمش</b>"
      : "⚠️ <b>العميل مستلمش — الأوردر راجع لك</b>",
    "",
    `أوردر: <b>${a.orderNumber ?? "—"}</b>`,
    `العميل: ${a.customerName ?? "—"}`,
  ];
  if (a.customerPhone) lines.push(`تليفون: ${a.customerPhone}`);
  if (a.tracking) lines.push(`شحنة: <code>${a.tracking}</code>`);
  if (a.reason) lines.push(`سبب بوسطة: ${a.reason}`);
  lines.push("");
  lines.push(
    a.arrived
      ? "البضاعة رجعت — راجع المخزون والفلوس."
      : "كلّم العميل قبل ما الشحنة ترجع المخزن."
  );
  if (a.siteUrl) {
    lines.push(`${a.siteUrl}/orders?status=${a.arrived ? "returned" : "returning"}`);
  }
  return lines.join("\n");
}

/** رسالة "المزامنة واقفة" */
export function syncDownMessage(detail: string, siteUrl?: string | null): string {
  const lines = ["🔴 <b>المزامنة مع بوسطة واقفة</b>", "", detail, ""];
  lines.push("الحالات والتحصيل مش بيتحدّثوا — الأرقام في السيستم قديمة.");
  if (siteUrl) lines.push(siteUrl);
  return lines.join("\n");
}
