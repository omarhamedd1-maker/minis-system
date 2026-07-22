// ==========================================================================
// دالة bosta-create — إرسال أوردر لبوسطة كشحنة (أوتوماتيك)
// --------------------------------------------------------------------------
// دي دالة Edge Function بتتدار من لوحة Supabase (مش من الريبو).
// انسخ الكود ده كله في دالة اسمها bosta-create، وتأكد إن Verify JWT = OFF.
//
// بتتنادى من الموقع كده:
//   GET /functions/v1/bosta-create?key=<BOSTA_WEBHOOK_KEY>&order=<uuid>
//   وكمان &dry=1 عشان تجرّب من غير ما تبعت فعلاً (بترجّع الـ payload + المدينة).
//
// الأسرار المطلوبة في إعدادات الدالة (Supabase → Edge Functions → Secrets):
//   BOSTA_WEBHOOK_KEY   = نفس مفتاح باقي دوال بوسطة (الحارس)
//   BOSTA_API_KEY       = توكن بوسطة (نفس اللي بتستخدمه دالة المزامنة bosta-sync)
//   BOSTA_PICKUP_ADDRESS_ID = (اختياري) رقم عنوان الاستلام في بوسطة لو عندك أكتر من فرع
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY = بيتحطوا تلقائياً
// ==========================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const BOSTA_BASE = "https://app.bosta.co/api/v2";

// نوع الشحنة في بوسطة: 10 = Send (توصيل للعميل)
const DELIVERY_TYPE_SEND = 10;

// تطبيع النص العربي عشان المطابقة (شيل التشكيل، وحّد الألف والياء والتاء)
function normalizeAr(s: string): string {
  return (s || "")
    .replace(/[ً-ٰٟ]/g, "") // تشكيل
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^؀-ۿ a-zA-Z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

type City = { _id: string; name?: string; nameAr?: string };

// بنطابق أطول اسم مدينة موجود جوّه نص العنوان
function matchCity(cities: City[], address: string): City | null {
  const norm = normalizeAr(address);
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
  if (!API_KEY) return json({ ok: false, error: "توكن بوسطة ناقص (BOSTA_API_KEY)" }, 500);
  if (!orderId) return json({ ok: false, error: "لازم رقم الأوردر (order)" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // 1) نجيب الأوردر + العميل + البنود
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(
      `id, order_number, discount, shipping_price, bosta_tracking,
       customers(full_name, phone, address),
       order_items(quantity, sale_price_at_order, product_variants(products(name, name_ar)))`
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr || !order) return json({ ok: false, error: "الأوردر مش موجود" }, 404);

  // لو الأوردر عليه شحنة أصلاً منبعتش تاني
  if (order.bosta_tracking) {
    return json({
      ok: true,
      already: true,
      tracking: order.bosta_tracking,
      message: "الأوردر ده عليه شحنة بالفعل",
    });
  }

  const customer = order.customers as {
    full_name: string | null;
    phone: string | null;
    address: string | null;
  } | null;

  if (!customer?.address) {
    return json({ ok: false, error: "العميل ملوش عنوان — أضف العنوان الأول" }, 400);
  }
  const phone = (customer.phone || "").replace(/\D/g, "");
  if (phone.length < 10) {
    return json({ ok: false, error: "رقم تليفون العميل مش صحيح" }, 400);
  }

  // 2) نجيب مدن بوسطة ونطابق المدينة من العنوان
  const citiesRes = await bostaFetch("/cities", API_KEY);
  if (!citiesRes.ok) {
    return json({ ok: false, error: "معرفناش نجيب قايمة المدن من بوسطة" }, 502);
  }
  const citiesJson = await citiesRes.json();
  const cities: City[] = citiesJson?.data?.list || citiesJson?.data || citiesJson?.list || [];
  const city = matchCity(cities, customer.address);

  // القرار الآمن: لو معرفناش نحدد المدينة منبعتش
  if (!city) {
    return json(
      {
        ok: false,
        error:
          "معرفناش نحدد المدينة من العنوان — راجع عنوان العميل واكتب اسم المدينة بوضوح، أو ابعت الشحنة يدوي من بوسطة واربطها.",
      },
      422
    );
  }

  // 3) نجهّز بيانات الشحنة
  const items = (order.order_items || []) as {
    quantity: number;
    sale_price_at_order: number;
    product_variants: { products: { name: string | null; name_ar: string | null } | null } | null;
  }[];
  const itemsTotal = items.reduce((s, i) => s + i.quantity * i.sale_price_at_order, 0);
  const itemsCount = items.reduce((s, i) => s + i.quantity, 0);
  const cod = Math.max(0, itemsTotal - (order.discount || 0) + (order.shipping_price || 0));
  const description =
    items
      .map((i) => {
        const p = i.product_variants?.products;
        return `${p?.name_ar || p?.name || "منتج"} × ${i.quantity}`;
      })
      .join(" + ")
      .slice(0, 250) || "شحنة";

  const nameParts = (customer.full_name || "عميل").trim().split(/\s+/);
  const firstName = nameParts[0] || "عميل";
  const lastName = nameParts.slice(1).join(" ") || firstName;

  const pickupId = Deno.env.get("BOSTA_PICKUP_ADDRESS_ID") || undefined;

  const payload: Record<string, unknown> = {
    type: DELIVERY_TYPE_SEND,
    specs: {
      packageType: "Parcel",
      packageDetails: { itemsCount, description },
    },
    notes: `أوردر ${order.order_number ?? ""}`.trim(),
    cod,
    dropOffAddress: {
      cityId: city._id,
      firstLine: customer.address,
    },
    receiver: {
      firstName,
      lastName,
      phone,
    },
    businessReference: String(order.order_number ?? ""),
    allowToOpenPackage: true,
    ...(pickupId ? { pickupAddressId: pickupId } : {}),
  };

  // وضع التجربة: نرجّع اللي هنبعته من غير ما نبعت فعلاً
  if (dry) {
    return json({
      ok: true,
      dry: true,
      matchedCity: { id: city._id, name: city.nameAr || city.name },
      cod,
      itemsCount,
      payload,
    });
  }

  // 4) نبعت الشحنة لبوسطة
  const createRes = await bostaFetch("/deliveries", API_KEY, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const createJson = await createRes.json().catch(() => null);

  if (!createRes.ok) {
    const msg =
      createJson?.message ||
      createJson?.error ||
      `بوسطة رفضت الشحنة (${createRes.status})`;
    return json({ ok: false, error: String(msg) }, 502);
  }

  const data = createJson?.data || createJson;
  const tracking = data?.trackingNumber || data?.tracking_number || null;
  if (!tracking) {
    return json({ ok: false, error: "بوسطة معملتش الشحنة (مفيش رقم تتبع)" }, 502);
  }

  // 5) نخزّن رقم التتبع ونخلي الأوردر جاهز للشحن (المزامنة تجيب باقي التفاصيل)
  const { error: updErr } = await supabase
    .from("orders")
    .update({
      bosta_tracking: String(tracking).replace(/\D/g, ""),
      order_status: "ready",
      cancelled_at: null,
    })
    .eq("id", orderId);

  if (updErr) {
    return json({
      ok: true,
      tracking,
      warning: "الشحنة اتعملت بس معرفناش نحفظ رقم التتبع في السيستم: " + updErr.message,
    });
  }

  return json({ ok: true, tracking, matchedCity: city.nameAr || city.name });
});
