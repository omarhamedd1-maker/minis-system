// ==========================================================================
// دالة bosta-return — عمل شحنة مرتجع (عكسية) من عند العميل ليك
// --------------------------------------------------------------------------
// اعمل دالة جديدة في Supabase اسمها bosta-return والصق الكود ده، و Verify JWT = OFF
//
// بتتنادى: GET /functions/v1/bosta-return?key=<BOSTA_WEBHOOK_KEY>&order=<uuid>
//          &dry=1 للتجربة من غير ما تعمل شحنة
//
// بتعمل إيه: بتقرا المنتجات اللي إنت علّمتها "راجعة" في الأوردر
// (order_items.returned_quantity)، وتعمل شحنة نوعها Customer Return
// (بوسطة تسحب من العميل وتوصّلها لك)، وتحفظ رقم تتبعها في orders.return_tracking.
//
// ملاحظة: فلوس المرتجع إنت اللي بترجّعها للعميل (إنستا باي/أونلاين) — بوسطة
// مش بتدفع للعميل، فالشحنة دي بمبلغ تحصيل صفر.
// ==========================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const BOSTA_BASE = "https://app.bosta.co/api/v2";

// أنواع الشحنات في بوسطة: 10 = Send · 15 = Customer Return (سحب من العميل)
const DELIVERY_TYPE_CUSTOMER_RETURN = 15;

function normalizeAr(s: string): string {
  return (s || "")
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^؀-ۿ a-zA-Z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

type City = { _id: string; name?: string; nameAr?: string };

function matchCity(cities: City[], text: string): City | null {
  const norm = normalizeAr(text);
  let best: City | null = null;
  let bestLen = 0;
  for (const c of cities) {
    for (const name of [c.nameAr, c.name]) {
      const n = normalizeAr(name || "");
      if (n.length >= 3 && norm.includes(n) && n.length > bestLen) {
        best = c;
        bestLen = n.length;
      }
    }
  }
  return best;
}

async function bostaFetch(path: string, apiKey: string, init?: RequestInit) {
  return fetch(`${BOSTA_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const orderId = url.searchParams.get("order");
  const dry = url.searchParams.get("dry") === "1";

  const GUARD = Deno.env.get("BOSTA_WEBHOOK_KEY");
  const API_KEY = Deno.env.get("BOSTA_API_KEY");

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  if (!GUARD || key !== GUARD) return json({ ok: false, error: "مفتاح غلط" }, 401);
  if (!API_KEY) return json({ ok: false, error: "توكن بوسطة ناقص" }, 500);
  if (!orderId) return json({ ok: false, error: "لازم رقم الأوردر" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(
      `id, order_number, bosta_tracking, return_tracking,
       customers(full_name, phone, address, city, zone, street, building, floor, apartment, landmark),
       order_items(quantity, returned_quantity, product_variants(products(name, name_ar)))`
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr || !order) return json({ ok: false, error: "الأوردر مش موجود" }, 404);

  if (order.return_tracking) {
    return json({
      ok: true,
      already: true,
      tracking: order.return_tracking,
      message: "الأوردر ده عليه شحنة مرتجع بالفعل",
    });
  }

  // المنتجات اللي علّمناها راجعة
  const items = (order.order_items || []) as {
    quantity: number;
    returned_quantity: number | null;
    product_variants: {
      products: { name: string | null; name_ar: string | null } | null;
    } | null;
  }[];
  const returning = items.filter((i) => Number(i.returned_quantity ?? 0) > 0);

  if (returning.length === 0) {
    return json(
      {
        ok: false,
        error:
          "حدّد الأول المنتجات الراجعة وكمياتها من جوّه الأوردر، وبعدين اعمل شحنة المرتجع.",
      },
      400
    );
  }

  const itemsCount = returning.reduce(
    (s, i) => s + Number(i.returned_quantity ?? 0),
    0
  );
  const description =
    returning
      .map((i) => {
        const p = i.product_variants?.products;
        return `${p?.name_ar || p?.name || "منتج"} × ${i.returned_quantity}`;
      })
      .join(" + ")
      .slice(0, 250) || "مرتجع";

  const customer = order.customers as {
    full_name: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    zone: string | null;
    street: string | null;
    building: string | null;
    floor: string | null;
    apartment: string | null;
    landmark: string | null;
  } | null;

  const addressLine =
    [
      customer?.street,
      customer?.building ? `عمارة ${customer.building}` : null,
      customer?.floor ? `الدور ${customer.floor}` : null,
      customer?.apartment ? `شقة ${customer.apartment}` : null,
      customer?.landmark ? `علامة: ${customer.landmark}` : null,
    ]
      .filter((x) => x && String(x).trim())
      .join(" — ") || (customer?.address ?? "");

  if (!addressLine.trim()) {
    return json({ ok: false, error: "العميل ملوش عنوان" }, 400);
  }
  const phone = (customer?.phone || "").replace(/\D/g, "");
  if (phone.length < 10) {
    return json({ ok: false, error: "رقم تليفون العميل مش صحيح" }, 400);
  }

  // المدينة
  const citiesRes = await bostaFetch("/cities", API_KEY);
  if (!citiesRes.ok) {
    return json({ ok: false, error: "معرفناش نجيب قايمة المدن من بوسطة" }, 502);
  }
  const citiesJson = await citiesRes.json();
  const cities: City[] =
    citiesJson?.data?.list || citiesJson?.data || citiesJson?.list || [];
  const city =
    (customer?.city ? matchCity(cities, customer.city) : null) ??
    matchCity(
      cities,
      `${customer?.city ?? ""} ${customer?.zone ?? ""} ${customer?.address ?? ""}`
    );

  if (!city) {
    return json(
      {
        ok: false,
        error:
          "معرفناش نحدد المدينة من العنوان — راجع عنوان العميل، أو اعمل شحنة المرتجع يدوي من بوسطة.",
      },
      422
    );
  }

  const nameParts = (customer?.full_name || "عميل").trim().split(/\s+/);
  const firstName = nameParts[0] || "عميل";
  const lastName = nameParts.slice(1).join(" ") || firstName;

  const payload: Record<string, unknown> = {
    type: DELIVERY_TYPE_CUSTOMER_RETURN,
    specs: {
      packageType: "Parcel",
      packageDetails: { itemsCount, description },
    },
    // بوسطة بتسحب من العميل — العنوان ده هو مكان الاستلام
    pickupAddress: {
      cityId: city._id,
      firstLine: addressLine,
      ...(customer?.zone ? { zoneName: customer.zone } : {}),
    },
    // برضه بنبعته كـ dropOff لبعض إصدارات الـ API
    dropOffAddress: {
      cityId: city._id,
      firstLine: addressLine,
    },
    receiver: { firstName, lastName, phone },
    // فلوس المرتجع إحنا اللي نرجّعها للعميل — الشحنة بصفر تحصيل
    cod: 0,
    businessReference: `RET-${order.order_number ?? ""}`,
    notes: `مرتجع أوردر ${order.order_number ?? ""}${
      order.bosta_tracking ? ` (شحنة أصلية ${order.bosta_tracking})` : ""
    }`.trim(),
    ...(order.bosta_tracking
      ? { originalTrackingNumber: String(order.bosta_tracking) }
      : {}),
  };

  if (dry) {
    return json({
      ok: true,
      dry: true,
      matchedCity: { id: city._id, name: city.nameAr || city.name },
      itemsCount,
      description,
      payload,
    });
  }

  const res = await bostaFetch("/deliveries", API_KEY, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const j = await res.json().catch(() => null);

  if (!res.ok) {
    const msg =
      j?.message || j?.error || `بوسطة رفضت شحنة المرتجع (${res.status})`;
    return json({ ok: false, error: String(msg) }, 502);
  }

  const data = j?.data || j;
  const tracking = data?.trackingNumber || data?.tracking_number || null;
  if (!tracking) {
    return json({ ok: false, error: "بوسطة معملتش الشحنة (مفيش رقم تتبع)" }, 502);
  }

  const { error: updErr } = await supabase
    .from("orders")
    .update({ return_tracking: String(tracking).replace(/\D/g, "") })
    .eq("id", orderId);

  if (updErr) {
    return json({
      ok: true,
      tracking,
      warning: "الشحنة اتعملت بس معرفناش نحفظ رقم التتبع: " + updErr.message,
    });
  }

  return json({ ok: true, tracking, matchedCity: city.nameAr || city.name });
});
