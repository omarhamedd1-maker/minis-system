// ==========================================================================
// تجهيز بيانات الشحنة اللي هتتبعت لبوسطة
// --------------------------------------------------------------------------
// دالة صافية: بتاخد الأوردر والعميل والمدينة، وبترجّع إما **سبب رفض واضح**
// وإما البيانات جاهزة للإرسال. مفيش شبكة ولا قاعدة بيانات هنا.
//
// كل أسباب الرفض في مكان واحد بقصد — عشان "الشحنة ماتتبعتش ليه؟" يبقى ليها
// إجابة واحدة متختبرة، مش رسايل متفرقة في نص الكود.
// ==========================================================================

import type { BostaCity, BostaZone } from "./cities";

/** نوع الشحنة عند بوسطة: ١٠ = توصيل للعميل */
const DELIVERY_TYPE_SEND = 10;

export type ShipmentCustomer = {
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
};

export type ShipmentItem = {
  quantity: number;
  salePrice: number;
  productName: string | null;
};

export type ShipmentInput = {
  orderNumber: string | number | null;
  discount: number | null;
  shippingPrice: number | null;
  items: ShipmentItem[];
  customer: ShipmentCustomer | null;
  city: BostaCity | null;
  zone: BostaZone | null;
  pickupAddressId?: string | null;
};

export type PayloadVariant = {
  name: string;
  dropOffAddress: Record<string, unknown>;
};

export type BuiltShipment = {
  cod: number;
  itemsCount: number;
  description: string;
  addressLine: string;
  city: { id: string; name: string };
  zone: { id: string; name: string } | null;
  /** الأساس اللي مابيتغيرش بين المحاولات */
  base: Record<string, unknown>;
  /** أشكال العنوان بالترتيب — بنجرّبهم واحد ورا التاني لو بوسطة رفضت */
  variants: PayloadVariant[];
};

export type BuildResult =
  | { ok: false; error: string }
  | { ok: true; shipment: BuiltShipment };

/** العنوان المقسّم أدق من النص الحر — بنستخدمه لو موجود */
export function buildAddressLine(c: ShipmentCustomer): string {
  const parts = [
    c.street,
    c.building ? `عمارة ${c.building}` : null,
    c.floor ? `الدور ${c.floor}` : null,
    c.apartment ? `شقة ${c.apartment}` : null,
    c.landmark ? `علامة: ${c.landmark}` : null,
  ].filter((x) => x && String(x).trim());

  return parts.length ? parts.join(" — ") : String(c.address ?? "").trim();
}

/** التحصيل = البضاعة − الخصم + الشحن، ومابينزلش تحت الصفر */
export function computeCod(input: {
  items: ShipmentItem[];
  discount: number | null;
  shippingPrice: number | null;
}): number {
  const itemsTotal = input.items.reduce(
    (s, i) => s + Number(i.quantity) * Number(i.salePrice),
    0
  );
  return Math.max(
    0,
    itemsTotal - Number(input.discount ?? 0) + Number(input.shippingPrice ?? 0)
  );
}

export function buildShipment(input: ShipmentInput): BuildResult {
  const c = input.customer;
  if (!c) return { ok: false, error: "الأوردر ده مالوش عميل" };

  const addressLine = buildAddressLine(c);
  if (!addressLine) {
    return { ok: false, error: "العميل ملوش عنوان — أضف العنوان الأول" };
  }

  const phone = String(c.phone ?? "").replace(/\D/g, "");
  if (phone.length < 10) {
    return { ok: false, error: "رقم تليفون العميل مش صحيح" };
  }

  if (!input.items.length) {
    return { ok: false, error: "الأوردر ملوش منتجات" };
  }

  // القرار الآمن: مدينة مش واضحة = مانبعتش، أحسن ما تروح لمحافظة غلط
  if (!input.city) {
    return {
      ok: false,
      error:
        "معرفناش نحدد المدينة من العنوان — راجع عنوان العميل واكتب اسم المدينة بوضوح، أو ابعت الشحنة يدوي من بوسطة واربطها.",
    };
  }

  const cod = computeCod(input);
  const itemsCount = input.items.reduce((s, i) => s + Number(i.quantity), 0);

  const description =
    input.items
      .map((i) => `${i.productName?.trim() || "منتج"} × ${i.quantity}`)
      .join(" + ")
      .slice(0, 250) || "شحنة";

  const nameParts = String(c.full_name ?? "عميل").trim().split(/\s+/);
  const firstName = nameParts[0] || "عميل";
  const lastName = nameParts.slice(1).join(" ") || firstName;

  const base: Record<string, unknown> = {
    type: DELIVERY_TYPE_SEND,
    specs: {
      packageType: "Parcel",
      packageDetails: { itemsCount, description },
    },
    notes: `أوردر ${input.orderNumber ?? ""}`.trim(),
    cod,
    receiver: { firstName, lastName, phone },
    businessReference: String(input.orderNumber ?? ""),
    allowToOpenPackage: true,
    ...(input.pickupAddressId ? { pickupAddressId: input.pickupAddressId } : {}),
  };

  const extras = {
    firstLine: addressLine,
    ...(c.building ? { buildingNumber: String(c.building) } : {}),
    ...(c.floor ? { floor: String(c.floor) } : {}),
    ...(c.apartment ? { apartment: String(c.apartment) } : {}),
  };

  // بوسطة بترفض `cityId` وبتقول "city, zoneId, or districtId is required" —
  // الشكل الشغال هو `city` وجوّاه رقم المدينة. بنسيب البدايل ورا بعض عشان
  // لو غيّروا الحقل تاني السيستم يفضل شغال من غير نشر جديد.
  const cityId = input.city._id;
  const cityName = input.city.nameAr || input.city.name || "";
  const variants: PayloadVariant[] = [
    {
      name: "city+zoneId",
      dropOffAddress: {
        city: cityId,
        ...(input.zone ? { zoneId: input.zone._id } : {}),
        ...extras,
      },
    },
    { name: "city-only", dropOffAddress: { city: cityId, ...extras } },
    {
      name: "cityId+city",
      dropOffAddress: { cityId, city: cityName, ...extras },
    },
  ];

  return {
    ok: true,
    shipment: {
      cod,
      itemsCount,
      description,
      addressLine,
      city: { id: cityId, name: cityName },
      zone: input.zone
        ? { id: input.zone._id, name: input.zone.nameAr || input.zone.name || "" }
        : null,
      base,
      variants,
    },
  };
}
