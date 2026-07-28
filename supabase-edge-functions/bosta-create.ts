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

type Zone = { _id: string; name?: string; nameAr?: string };
type City = {
  _id: string;
  name?: string;
  nameAr?: string;
  zones?: Zone[];
  districts?: Zone[];
};

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

// بنطابق المنطقة جوّه المدينة (بوسطة أحياناً بتطلب zoneId)
function matchZone(zones: Zone[] | undefined, text: string): Zone | null {
  if (!zones?.length) return null;
  const norm = normalizeAr(text);
  if (!norm) return null;
  let best: Zone | null = null;
  let bestLen = 0;
  for (const z of zones) {
    for (const name of [z.nameAr, z.name]) {
      const n = normalizeAr(name || "");
      if (n.length >= 3 && norm.includes(n) && n.length > bestLen) {
        best = z;
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
       customers(full_name, phone, address, city, zone, street, building, floor, apartment, landmark),
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
    city: string | null;
    zone: string | null;
    street: string | null;
    building: string | null;
    floor: string | null;
    apartment: string | null;
    landmark: string | null;
  } | null;

  // العنوان المقسّم أدق بكتير من النص الحر — بنستخدمه لو موجود
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
  // بنطابق من خانة المدينة المقسّمة الأول (أدق)، وإلا من نص العنوان كله
  const city =
    (customer.city ? matchCity(cities, customer.city) : null) ??
    matchCity(cities, `${customer.city ?? ""} ${customer.zone ?? ""} ${customer.address ?? ""}`);

  // وضع الفحص: بيرجّع شكل بيانات المدينة زي ما بوسطة بترجّعها بالظبط
  if (url.searchParams.get("probe") === "1") {
    return json({
      ok: true,
      probe: true,
      citiesCount: cities.length,
      firstCityRaw: cities[0] ?? null,
      matchedCityRaw: city ?? null,
      customerCity: customer.city,
      customerZone: customer.zone,
    });
  }

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

  // المنطقة (لو بوسطة راجعة المدينة بمناطقها)
  const zone =
    matchZone(city.zones, `${customer.zone ?? ""} ${customer.address ?? ""}`) ??
    matchZone(city.districts, `${customer.zone ?? ""} ${customer.address ?? ""}`);

  const base = {
    type: DELIVERY_TYPE_SEND,
    specs: {
      packageType: "Parcel",
      packageDetails: { itemsCount, description },
    },
    notes: `أوردر ${order.order_number ?? ""}`.trim(),
    cod,
    receiver: { firstName, lastName, phone },
    businessReference: String(order.order_number ?? ""),
    allowToOpenPackage: true,
    ...(pickupId ? { pickupAddressId: pickupId } : {}),
  };

  const addressExtras = {
    firstLine: addressLine,
    ...(customer.building ? { buildingNumber: String(customer.building) } : {}),
    ...(customer.floor ? { floor: String(customer.floor) } : {}),
    ...(customer.apartment ? { apartment: String(customer.apartment) } : {}),
  };

  // بوسطة بترفض `cityId` وبتقول "city, zoneId, or districtId is required".
  // الشكل الصح هو `city` وجوّاه رقم المدينة — وبنجرّب البدائل بالترتيب لو رفضت،
  // عشان لو غيّروا الحقل تاني السيستم يفضل شغال.
  const variants: { name: string; dropOffAddress: Record<string, unknown> }[] = [
    {
      name: "city+zoneId",
      dropOffAddress: {
        city: city._id,
        ...(zone ? { zoneId: zone._id } : {}),
        ...addressExtras,
      },
    },
    {
      name: "city-only",
      dropOffAddress: { city: city._id, ...addressExtras },
    },
    {
      name: "cityId+city",
      dropOffAddress: {
        cityId: city._id,
        city: city.nameAr || city.name,
        ...addressExtras,
      },
    },
  ];

  // وضع التجربة: نرجّع اللي هنبعته من غير ما نبعت فعلاً
  if (dry) {
    return json({
      ok: true,
      dry: true,
      matchedCity: { id: city._id, name: city.nameAr || city.name },
      matchedZone: zone ? { id: zone._id, name: zone.nameAr || zone.name } : null,
      zonesAvailable: (city.zones ?? city.districts ?? []).length,
      cod,
      itemsCount,
      payload: { ...base, dropOffAddress: variants[0].dropOffAddress },
      variantsToTry: variants.map((v) => v.name),
    });
  }

  // 4) نبعت الشحنة لبوسطة — بنجرّب الأشكال بالترتيب لحد ما واحد ينجح
  let createRes: Response | null = null;
  let createJson: any = null;
  let usedVariant = "";
  const attempts: { variant: string; status: number; message: string }[] = [];

  for (const v of variants) {
    const payload = { ...base, dropOffAddress: v.dropOffAddress };
    createRes = await bostaFetch("/deliveries", API_KEY, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    createJson = await createRes.json().catch(() => null);
    if (createRes.ok) {
      usedVariant = v.name;
      break;
    }
    attempts.push({
      variant: v.name,
      status: createRes.status,
      message: String(createJson?.message ?? createJson?.error ?? ""),
    });
  }

  if (!createRes || !createRes.ok) {
    return json(
      {
        ok: false,
        error:
          attempts[0]?.message || `بوسطة رفضت الشحنة (${createRes?.status ?? 0})`,
        attempts,
        matchedCity: { id: city._id, name: city.nameAr || city.name },
      },
      502
    );
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

  return json({
    ok: true,
    tracking,
    matchedCity: city.nameAr || city.name,
    matchedZone: zone ? zone.nameAr || zone.name : null,
    usedVariant,
  });
});
