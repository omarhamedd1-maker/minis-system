/**
 * ==========================================================================
 * استقبال إيميل من Resend (TRANSFERS §٣ · الخطوة ٥)
 * --------------------------------------------------------------------------
 * ⚠️⚠️ **الويب هوك مابيبعتش جسم الإيميل** — بيبعت بياناته بس (`email_id` ·
 * `from` · `to` · `subject`)، والمحتوى بيتجاب بنداء تاني:
 * `GET /emails/receiving/:id`. ده مكتوب في دوكس Resend، والسبب إن المرفقات
 * الكبيرة مابتعديش في جسم الويب هوك.
 *
 * ⚠️ **العنوان بتاعنا بيبان في `received_for` مش `to`** — الإيميل محوّل من
 * جيميل، فـ`to` بيفضل العنوان الأصلي (صندوق صاحب المتجر)، والعنوان اللي
 * اتحوّل له بيتقرا من ترويسة `Received: … for …`.
 *
 * **الملف ده صافي** — بيفهم الشكل بس، والشبكة بتتنادى من برّه.
 * ==========================================================================
 */

export type InboundEvent = {
  emailId: string | null;
  to: string[];
  from: string;
  subject: string;
  /** الجسم لو المزوّد بعته (التجارب والمزوّدين التانيين) */
  body: string;
  dkim: string;
};

const asArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? [v] : [];

const pick = (o: Record<string, unknown>, names: string[]): string => {
  for (const n of names) {
    const v = n.split(".").reduce<unknown>((x, k) => (x as Record<string, unknown>)?.[k], o);
    if (typeof v === "string" && v.trim()) return v;
    if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  }
  return "";
};

/**
 * بيفهم شكل Resend (`type: "email.received"`) وكمان الشكل العام اللي
 * المزوّدين التانيين والتجارب بيبعتوه.
 */
export function readInbound(body: Record<string, unknown>): InboundEvent {
  const data = (body.data ?? body) as Record<string, unknown>;
  return {
    emailId: typeof data.email_id === "string" ? data.email_id : null,
    // ⚠️ `received_for` الأول — هو العنوان اللي اتحوّل له فعلًا
    to: [...asArray(data.received_for), ...asArray(data.to), ...asArray(body.to), ...asArray(body.recipient)],
    from: pick(data, ["from", "From", "sender"]) || pick(body, ["from", "sender"]),
    subject: pick(data, ["subject", "Subject"]) || pick(body, ["subject"]),
    body: pick(data, ["html", "text"]) || pick(body, ["html", "html_body", "body-html", "text", "text_body", "body-plain", "body"]),
    dkim: pick(data, ["dkim", "dkim_result"]) || pick(body, ["dkim", "dkim_result", "authentication.dkim"]),
  };
}

export type FetchedEmail = { html: string; text: string; headers: Record<string, string> };

/**
 * بيجيب محتوى الإيميل من Resend.
 *
 * ⚠️ **الفشل هنا مش «إيميل مرفوض»** — الإيميل وصل فعلًا، إحنا اللي
 * معرفناش نقراه. فبيترمي عشان يتسجّل بسببه بدل ما يتعدّى بالصمت.
 */
export async function fetchResendEmail(
  emailId: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<FetchedEmail> {
  const res = await fetchImpl(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Resend ردّت ${res.status} وإحنا بنجيب محتوى الإيميل`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  return {
    html: typeof json.html === "string" ? json.html : "",
    text: typeof json.text === "string" ? json.text : "",
    headers: (json.headers as Record<string, string>) ?? {},
  };
}

/**
 * توقيع بوسطة (`DKIM`) من ترويسات الإيميل.
 *
 * ⚠️ **مش `SPF`** — الإيميل محوّل من جيميل، فـSPF بيتحقق للمُحوِّل. اللي
 * بيعيش مع التحويل هو توقيع `bosta.co` نفسه (TRANSFERS §٤).
 */
export function dkimPassed(headers: Record<string, string>, domain = "bosta.co"): boolean | null {
  const auth = String(headers["authentication-results"] ?? headers["Authentication-Results"] ?? "");
  if (!auth) return null;
  const parts = auth.split(";").map((p) => p.trim());
  const dkim = parts.filter((p) => p.toLowerCase().startsWith("dkim="));
  if (dkim.length === 0) return null;
  return dkim.some((p) => /dkim=pass/i.test(p) && p.includes(domain));
}
