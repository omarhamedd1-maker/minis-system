// ==========================================================================
// الاتصال ببوسطة — الملف الوحيد اللي بيعرف عنوان بوسطة وشكل ردودها
// --------------------------------------------------------------------------
// المفتاح بيتبعت كمُدخل مش بيتقرا من الإعدادات، عشان لما نوصل لأكتر من بيزنس
// كل واحد يستخدم مفتاحه من غير ما نلمس الملف ده.
// ==========================================================================

import type { BostaDelivery } from "./reconcile";

const BOSTA_BASE = "https://app.bosta.co/api/v2";
const PAGE_SIZE = 100;
const MAX_PAGES = 60;

export type BostaRawDelivery = BostaDelivery & {
  _id?: string;
  receiver?: { fullName?: string | null; phone?: string | null } | null;
  createdAt?: string | null;
};

function headers(apiKey: string) {
  return {
    Authorization: apiKey,
    "X-Requested-By": "minis",
    "Content-Type": "application/json",
  };
}

/**
 * بيتأكد إن المفتاح صالح يتبعت أصلاً.
 * لو فيه مسافات أو حروف عربية (لزق غلط)، المتصفح بيرمي خطأ تقني مش مفهوم —
 * فبنمسكه هنا ونقول للعميل المشكلة بالعربي.
 */
function assertUsableKey(apiKey: string): string {
  const key = String(apiKey ?? "").trim();
  if (!key) throw new BostaError("مفتاح بوسطة فاضي", 400);
  if (/[^\x20-\x7E]/.test(key)) {
    throw new BostaError(
      "مفتاح بوسطة فيه حروف مش مظبوطة — اتأكد إنك نسخته كامل من بوسطة",
      400
    );
  }
  return key;
}

export class BostaError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "BostaError";
  }
}

/**
 * بيجيب كل الشحنات صفحة صفحة.
 * بيقف لما صفحة ترجع فاضية أو ترجع شحنات شفناها قبل كده (بوسطة أحيانًا
 * بتفضل ترجّع آخر صفحة للأبد بدل ما تقول خلاص).
 */
export async function fetchAllDeliveries(
  rawKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<BostaRawDelivery[]> {
  const apiKey = assertUsableKey(rawKey);
  const out: BostaRawDelivery[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetchImpl(`${BOSTA_BASE}/deliveries/search`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify({ limit: PAGE_SIZE, page }),
    });

    if (res.status === 401 || res.status === 403) {
      throw new BostaError("مفتاح بوسطة مرفوض", res.status);
    }
    if (res.status !== 200) break;

    const json = await res.json();
    const arr: BostaRawDelivery[] =
      json?.data?.deliveries ?? json?.deliveries ?? [];
    if (arr.length === 0) break;

    let added = 0;
    for (const d of arr) {
      const id = String(d._id ?? d.trackingNumber ?? "");
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(d);
        added++;
      }
    }
    if (added === 0) break;
  }

  return out;
}

/** بيتأكد إن المفتاح شغال — بنستخدمه في زرار "جرّب الاتصال" وقت التركيب */
export async function testConnection(
  rawKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; error?: string }> {
  let apiKey: string;
  try {
    apiKey = assertUsableKey(rawKey);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "مفتاح مش صالح" };
  }

  try {
    // ملحوظة: مسار المدن مابيتحققش من المفتاح، فبنستخدم مسار الشحنات
    // عشان نتأكد فعلاً إن المفتاح شغال
    const res = await fetchImpl(`${BOSTA_BASE}/deliveries/search`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify({ limit: 1, page: 1 }),
    });
    if (res.status === 200) return { ok: true };
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "المفتاح مرفوض من بوسطة" };
    return { ok: false, error: `بوسطة ردّت بكود ${res.status}` };
  } catch {
    return { ok: false, error: "معرفناش نوصل لبوسطة" };
  }
}
