// ==========================================================================
// الاتصال ببوسطة — الملف الوحيد اللي بيعرف عنوان بوسطة وشكل ردودها
// --------------------------------------------------------------------------
// المفتاح بيتبعت كمُدخل مش بيتقرا من الإعدادات، عشان لما نوصل لأكتر من بيزنس
// كل واحد يستخدم مفتاحه من غير ما نلمس الملف ده.
// ==========================================================================

import type { BostaCity } from "./cities";
import type { BostaDelivery } from "./reconcile";

const BOSTA_BASE = "https://app.bosta.co/api/v2";
/** بعض المسارات موجودة على v0 بس — البوليصة وتعديل الشحنة. اتحددوا بالتجربة */
const BOSTA_V0 = "https://app.bosta.co/api/v0";
const PAGE_SIZE = 100;
const MAX_PAGES = 60;
/** طلب واقف مايستهلكش وقت الصفحة كلها — خصوصًا لما نبعت دفعة أوردرات */
const TIMEOUT_MS = 20000;

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

/**
 * قايمة المحافظات عند بوسطة (٢٨ محافظة، من غير مناطق).
 * ⚠️ المسار ده **مابيتحققش من المفتاح** — بيرد ٢٠٠ لأي حاجة، فمينفعش
 * يتستخدم كاختبار اتصال. للاختبار استخدم `testConnection`.
 */
export async function fetchCities(
  rawKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<BostaCity[]> {
  const apiKey = assertUsableKey(rawKey);
  const res = await fetchImpl(`${BOSTA_BASE}/cities`, {
    method: "GET",
    headers: headers(apiKey),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new BostaError("معرفناش نجيب قايمة المدن من بوسطة", res.status);
  }
  const json = await res.json();
  return json?.data?.list ?? json?.data ?? json?.list ?? [];
}

export type CreateDeliveryResult = {
  ok: boolean;
  status: number;
  trackingNumber: string | null;
  message: string;
};

/** بيعمل شحنة واحدة. مابيقررش حاجة — بيبعت اللي اتقاله وبيرجّع رد بوسطة زي ما هو */
export async function createDelivery(
  rawKey: string,
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
): Promise<CreateDeliveryResult> {
  const apiKey = assertUsableKey(rawKey);
  const res = await fetchImpl(`${BOSTA_BASE}/deliveries`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const json = await res.json().catch(() => null);
  const data = json?.data ?? json;
  const tracking = data?.trackingNumber ?? data?.tracking_number ?? null;

  return {
    ok: res.ok,
    status: res.status,
    trackingNumber: tracking ? String(tracking).replace(/\D/g, "") : null,
    message: String(json?.message ?? json?.error ?? ""),
  };
}

export type DeliveryLookup = {
  id: string;
  trackingNumber: string;
  /** حالة الشحنة عند بوسطة زي "Delivered" و"Picked up" */
  state: string;
  cod: number | null;
};

/**
 * بيلاقي الشحنة برقم تتبعها بالظبط.
 * ⚠️ **متستخدمش `searchInput` هنا** — جرّبناه وطلع بيرجّع شحنة تانية خالص،
 * يعني ممكن تطبع بوليصة عميل على أوردر عميل تاني. المسار ده بيطابق بالظبط.
 */
export async function fetchDeliveryByTracking(
  rawKey: string,
  tracking: string,
  fetchImpl: typeof fetch = fetch
): Promise<DeliveryLookup | null> {
  const apiKey = assertUsableKey(rawKey);
  const res = await fetchImpl(
    `${BOSTA_BASE}/deliveries/business/${encodeURIComponent(tracking)}`,
    { headers: headers(apiKey), signal: AbortSignal.timeout(TIMEOUT_MS) }
  );
  if (res.status === 401 || res.status === 403) {
    throw new BostaError("مفتاح بوسطة مرفوض", res.status);
  }
  if (!res.ok) return null;

  const json = await res.json().catch(() => null);
  const d = json?.data ?? json;
  if (!d?._id) return null;

  return {
    id: String(d._id),
    trackingNumber: String(d.trackingNumber ?? tracking),
    state: String(d.state?.value ?? d.state ?? ""),
    cod: typeof d.cod === "number" ? d.cod : null,
  };
}

/**
 * بوليصة الشحن.
 * بوسطة بترجّعها **نص مشفّر جوّه JSON على `/api/v0`** مش ملف PDF مباشرة —
 * ومسار `v2` مش موجود أصلاً (بيرجّع صفحة خطأ). ده اتحدد بالتجربة.
 */
export async function fetchAwbPdf(
  rawKey: string,
  deliveryId: string,
  fetchImpl: typeof fetch = fetch
): Promise<Uint8Array | null> {
  const apiKey = assertUsableKey(rawKey);
  const res = await fetchImpl(
    `${BOSTA_V0}/deliveries/awb/${encodeURIComponent(deliveryId)}`,
    { headers: headers(apiKey), signal: AbortSignal.timeout(TIMEOUT_MS) }
  );
  if (!res.ok) return null;

  const json = await res.json().catch(() => null);
  // شكلين: v0 بيرجّع data نص، وv1 بيرجّع data.data
  const b64 = typeof json?.data === "string" ? json.data : json?.data?.data;
  if (typeof b64 !== "string" || !b64) return null;

  return Uint8Array.from(Buffer.from(b64, "base64"));
}

/**
 * بيغيّر مبلغ التحصيل وعدد القطع لشحنة لسه ماتاخدتش.
 * ⚠️ زي البوليصة بالظبط: المسار على **`v0`** — و`v2` بيرجّع ٤٠٤.
 * (اكتشفناها لما أوردر ١٣٧٤ اتعدّل والتحصيل فضل قديم عند بوسطة.)
 */
export async function updateDeliveryCod(
  rawKey: string,
  deliveryId: string,
  cod: number,
  itemsCount: number,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; status: number; message: string }> {
  const apiKey = assertUsableKey(rawKey);
  const res = await fetchImpl(`${BOSTA_V0}/deliveries/${deliveryId}`, {
    method: "PUT",
    headers: headers(apiKey),
    body: JSON.stringify({
      cod,
      specs: { packageDetails: { itemsCount } },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = await res.json().catch(() => null);
  return {
    ok: res.ok,
    status: res.status,
    message: String(json?.message ?? json?.error ?? ""),
  };
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
