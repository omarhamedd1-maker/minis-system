// ==========================================================================
// الرد على العميل
// --------------------------------------------------------------------------
// تلات قنوات، وكل واحدة ليها عنوان وشكل طلب مختلف عند ميتا — بس النتيجة
// واحدة: معرّف الرسالة، أو سبب الرفض بالعربي.
//
// ⚠️⚠️ **مافيش إرسال من غير ما العميل يكون كلّمنا الأول.** الحارس ده في
// `replyWindow`، والنداء هنا بيثق إن اللي فوقه اتأكد — عشان كده الدالة
// بتاخد `windowOpen` صريح بدل ما تحسبه لوحدها.
// ==========================================================================

import type { Channel } from "./channel";

const GRAPH = "https://graph.facebook.com/v21.0";

export type SendTarget = {
  channel: Channel;
  /** رقم الواتساب أو PSID أو IGSID */
  externalId: string;
  /** معرّف رقم الواتساب عند ميتا */
  whatsappPhoneId: string | null;
  whatsappToken: string | null;
  pageToken: string | null;
};

export type SendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; error: string };

export function missingCredentials(t: SendTarget): string | null {
  if (t.channel === "whatsapp") {
    if (!t.whatsappPhoneId || !t.whatsappToken) {
      return "واتساب لسه مش متوصّل بالسيستم";
    }
    return null;
  }
  if (!t.pageToken) {
    return t.channel === "instagram"
      ? "إنستجرام لسه مش متوصّل بالسيستم"
      : "ماسنجر لسه مش متوصّل بالسيستم";
  }
  return null;
}

export async function sendMessage(
  target: SendTarget,
  body: string,
  fetchImpl: typeof fetch = fetch
): Promise<SendResult> {
  const text = String(body ?? "").trim();
  if (!text) return { ok: false, error: "الرسالة فاضية" };

  const missing = missingCredentials(target);
  if (missing) return { ok: false, error: missing };

  const { url, payload, token } = buildRequest(target, text);

  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
      message_id?: string;
      error?: { message?: string; code?: number };
    };

    if (!res.ok) {
      return { ok: false, error: graphError(json, res.status) };
    }

    return {
      ok: true,
      messageId: json.messages?.[0]?.id ?? json.message_id ?? null,
    };
  } catch (e) {
    return {
      ok: false,
      error: "معرفناش نوصل لميتا: " + (e instanceof Error ? e.message : "عطل"),
    };
  }
}

function buildRequest(target: SendTarget, text: string) {
  if (target.channel === "whatsapp") {
    return {
      url: `${GRAPH}/${target.whatsappPhoneId}/messages`,
      token: target.whatsappToken,
      payload: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: target.externalId,
        type: "text",
        text: { preview_url: false, body: text },
      },
    };
  }

  // ماسنجر وإنستجرام بنفس الشكل — الفرق في الصفحة اللي التوكن بتاعها
  return {
    url: `${GRAPH}/me/messages`,
    token: target.pageToken,
    payload: {
      recipient: { id: target.externalId },
      message: { text },
      messaging_type: "RESPONSE",
    },
  };
}

/**
 * سبب الرفض بالعربي.
 *
 * ⚠️ **الأكواد دي بتتكرر كتير** — وأهمها ١٣١٠٤٧: العميل ساكت من أكتر من
 * ٢٤ ساعة. من غير الترجمة دي، اللي بيرد بيشوف رقم إنجليزي ومايعرفش إن
 * المشكلة مش عنده.
 */
function graphError(
  json: { error?: { message?: string; code?: number } },
  status: number
): string {
  const code = json.error?.code;
  if (code === 131047 || code === 10) {
    return "عدّى أكتر من ٢٤ ساعة على آخر رسالة من العميل — ميتا رفضت الرد";
  }
  if (code === 190 || status === 401) {
    return "الربط مع ميتا انتهت صلاحيته";
  }
  if (code === 131026) {
    return "الرقم ده مش على واتساب";
  }
  return json.error?.message ?? `ميتا ردت بـ${status}`;
}
