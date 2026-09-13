// ==========================================================================
// «سجّل دخول بفيسبوك» — تبديل الكود بتوكن البيزنس
// --------------------------------------------------------------------------
// نفس فكرة تطبيق شوبيفاي: **التطبيق بيتسجّل مرة واحدة**، وبعدين كل بيزنس
// بيربط حسابه بضغطة من غير ما يكتب توكن ولا معرّف.
//
// ⚠️⚠️ **الكود بيعيش ٣٠ ثانية بس.** لو اتخزّن عشان يتبدّل بعدين، بيبقى
// ميّت. عشان كده التبديل بيحصل في نفس الطلب اللي جاي من الزرار.
//
// ⚠️ **وسرّ التطبيق مايخرجش للمتصفح أبدًا** — التبديل كله على السيرفر.
//
// **الملف ده بياخد `fetch` كبارامتر** عشان ينفع يتجرّب من غير شبكة.
// ==========================================================================

const GRAPH = "https://graph.facebook.com/v21.0";

export type ExchangeResult =
  | { ok: true; token: string }
  | { ok: false; error: string };

export async function exchangeCode(
  code: string,
  appId: string | null | undefined,
  appSecret: string | null | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<ExchangeResult> {
  const c = String(code ?? "").trim();
  if (!c) return { ok: false, error: "مافيش كود من ميتا" };
  if (!appId || !appSecret) {
    return { ok: false, error: "تطبيق ميتا لسه مااتظبّطش في السيستم" };
  }

  const url =
    `${GRAPH}/oauth/access_token` +
    `?client_id=${encodeURIComponent(appId)}` +
    `&client_secret=${encodeURIComponent(appSecret)}` +
    `&code=${encodeURIComponent(c)}`;

  try {
    const res = await fetchImpl(url);
    const json = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      error?: { message?: string; code?: number };
    };

    if (!res.ok || !json.access_token) {
      if (json.error?.code === 100) {
        // ⚠️ الكود عاش ٣٠ ثانية وخلاص — الرسالة الإنجليزية بتقول
        // «Invalid verification code» وده بيتقري كأن حاجة غلط في الحساب
        return {
          ok: false,
          error: "الكود خلص وقته — اقفل الشباك وابدأ الربط من الأول",
        };
      }
      return {
        ok: false,
        error: json.error?.message ?? `ميتا ردت بـ${res.status}`,
      };
    }

    return { ok: true, token: json.access_token };
  } catch (e) {
    return {
      ok: false,
      error: "معرفناش نوصل لميتا: " + (e instanceof Error ? e.message : "عطل"),
    };
  }
}

/**
 * بيشترك التطبيق في ويب هوك حساب الواتساب بتاع البيزنس.
 *
 * ⚠️⚠️ **من غير الخطوة دي مافيش رسالة بتوصل خالص.** التوكن لوحده بيخلّيك
 * **تبعت**، والاشتراك هو اللي بيخلّي ميتا **تبعتلك**. ولأنها بتنجح بصمت
 * لما تتنسي، الأعراض بتبان كأنها عطل في الويب هوك.
 */
export async function subscribeWaba(
  wabaId: string,
  businessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; error?: string }> {
  if (!wabaId) return { ok: false, error: "مافيش معرّف حساب واتساب" };

  try {
    const res = await fetchImpl(`${GRAPH}/${wabaId}/subscribed_apps`, {
      method: "POST",
      headers: { authorization: `Bearer ${businessToken}` },
    });
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      error?: { message?: string };
    };
    if (!res.ok || json.success === false) {
      return { ok: false, error: json.error?.message ?? `ميتا ردت بـ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "عطل" };
  }
}

/** اللي الزرار بيرجّعه — أول حاجة بتوصل من ميتا */
export type SignupAssets = {
  code: string;
  wabaId: string | null;
  phoneNumberId: string | null;
  businessId: string | null;
  pageId: string | null;
  instagramAccountId: string | null;
};

/**
 * بيقرا معلومات الجلسة اللي بتيجي من شباك ميتا.
 *
 * ⚠️ **الشكل بيختلف حسب اللي البيزنس اختاره** — اللي ربط واتساب بس
 * مافيش عنده صفحة، واللي ربط إنستجرام بس مافيش عنده رقم. فكل حاجة
 * اختيارية، والناقص بيفضل فاضي بدل ما يوقف الربط.
 */
export function readSessionInfo(raw: unknown): Partial<SignupAssets> {
  const obj = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const first = (v: unknown): string | null => {
    if (Array.isArray(v)) return v.length ? String(v[0]) : null;
    const s = String(v ?? "").trim();
    return s ? s : null;
  };

  const data = obj(obj(raw).data);
  return {
    wabaId: first(data.waba_id),
    phoneNumberId: first(data.phone_number_id),
    businessId: first(data.business_id),
    pageId: first(data.page_ids),
    instagramAccountId: first(data.instagram_account_ids),
  };
}
