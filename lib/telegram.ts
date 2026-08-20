// ==========================================================================
// تليجرام — بعت الملفات لبرّه السيستم
// --------------------------------------------------------------------------
// ليه تليجرام؟ لأنه **برّه الحساب اللي فيه الداتا**، وبيوصل على الموبايل،
// والملف بيفضل محفوظ في الجروب من غير ما حد يعمل حاجة. الإيميل كان بيحتاج
// حساب بعت ودومين متظبّط؛ الجروب بياخد دقيقة.
//
// ⚠️⚠️ **البوت لازم يكون في الجروب.** التوكن لوحده مابيبعتش — تليجرام
// بيرفض بـ`chat not found` لو البوت مش عضو، والرسالة دي بتبان كأن التوكن
// غلط وهو صح.
//
// ⚠️ **مافيش رمي هنا** — النسخة اللي بتوقّع الكرون بتمنع نسخة بكرة كمان.
// ==========================================================================

const BASE = "https://api.telegram.org";

export type SendResult = { ok: boolean; error?: string };

/** بيقرا سبب الرفض من رد تليجرام بدل «فشل» الفاضية */
async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { description?: string };
    return body.description || `تليجرام ردّ بكود ${res.status}`;
  } catch {
    return `تليجرام ردّ بكود ${res.status}`;
  }
}

export async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string,
  fetchImpl: typeof fetch = fetch
): Promise<SendResult> {
  try {
    const res = await fetchImpl(`${BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_notification: true }),
    });
    if (!res.ok) return { ok: false, error: await readError(res) };
    return { ok: true };
  } catch {
    return { ok: false, error: "معرفناش نوصل لتليجرام" };
  }
}

/**
 * بيبعت ملف واحد.
 *
 * ⚠️ **`multipart/form-data` مش JSON** — الملف نفسه لازم يتبعت كـ`Blob`
 * وإلا تليجرام بيستلم اسم الملف من غير محتواه.
 */
export async function sendTelegramFile(
  token: string,
  chatId: string,
  file: { name: string; content: string },
  caption: string | null,
  fetchImpl: typeof fetch = fetch
): Promise<SendResult> {
  try {
    const form = new FormData();
    form.append("chat_id", chatId);
    if (caption) form.append("caption", caption.slice(0, 1000));
    form.append("disable_notification", "true");
    form.append(
      "document",
      new Blob([file.content], { type: "text/csv" }),
      file.name
    );

    const res = await fetchImpl(`${BASE}/bot${token}/sendDocument`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) return { ok: false, error: await readError(res) };
    return { ok: true };
  } catch {
    return { ok: false, error: "معرفناش نوصل لتليجرام" };
  }
}
