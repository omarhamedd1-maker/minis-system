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

// أنواع الشحنات عند بوسطة — الأرقام دي اتأكدنا منها من شحنات حقيقية:
//   ١٠ Send · ٢٠ Return to Origin · ٢٥ Customer Return Pickup · ٣٠ Exchange
// ⚠️ كنا كاتبين ١٥ للمرتجع وده رقم مش موجود عند بوسطة خالص.
const DELIVERY_TYPE_SEND = 10;
const DELIVERY_TYPE_CUSTOMER_RETURN = 25;

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

type ReadyCustomer = {
  addressLine: string;
  phone: string;
  firstName: string;
  lastName: string;
};

/**
 * الفحوصات المشتركة بين الإرسال والمرتجع.
 * `manualHint` بيتغيّر حسب العملية عشان الرسالة تقول للمستخدم يعمل إيه بالظبط.
 */
function prepareCustomer(
  c: ShipmentCustomer | null,
  city: BostaCity | null,
  manualHint: string
): { ok: false; error: string } | { ok: true; ready: ReadyCustomer } {
  if (!c) return { ok: false, error: "الأوردر ده مالوش عميل" };

  const addressLine = buildAddressLine(c);
  if (!addressLine) {
    return { ok: false, error: "العميل ملوش عنوان — أضف العنوان الأول" };
  }

  const phone = String(c.phone ?? "").replace(/\D/g, "");
  if (phone.length < 10) {
    return { ok: false, error: "رقم تليفون العميل مش صحيح" };
  }

  // القرار الآمن: مدينة مش واضحة = مانكملش، أحسن ما تروح لمحافظة غلط
  if (!city) {
    return {
      ok: false,
      error: `معرفناش نحدد المدينة من العنوان — راجع عنوان العميل واكتب اسم المدينة بوضوح، أو ${manualHint}`,
    };
  }

  const nameParts = String(c.full_name ?? "عميل").trim().split(/\s+/);
  return {
    ok: true,
    ready: {
      addressLine,
      phone,
      firstName: nameParts[0] || "عميل",
      lastName: nameParts.slice(1).join(" ") || nameParts[0] || "عميل",
    },
  };
}

/** الحقول الزيادة اللي بتتبعت جوّه العنوان لو العميل مقسّم عنوانه */
function addressExtras(c: ShipmentCustomer) {
  return {
    ...(c.building ? { buildingNumber: String(c.building) } : {}),
    ...(c.floor ? { floor: String(c.floor) } : {}),
    ...(c.apartment ? { apartment: String(c.apartment) } : {}),
  };
}

export function buildShipment(input: ShipmentInput): BuildResult {
  const c = input.customer;

  if (c && !input.items.length) {
    return { ok: false, error: "الأوردر ملوش منتجات" };
  }

  const prep = prepareCustomer(
    c,
    input.city,
    "ابعت الشحنة يدوي من بوسطة واربطها."
  );
  if (!prep.ok) return prep;
  const { addressLine, phone, firstName, lastName } = prep.ready;
  const cust = c as ShipmentCustomer;

  const cod = computeCod(input);
  const itemsCount = input.items.reduce((s, i) => s + Number(i.quantity), 0);

  const description =
    input.items
      .map((i) => `${i.productName?.trim() || "منتج"} × ${i.quantity}`)
      .join(" + ")
      .slice(0, 250) || "شحنة";

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

  const extras = { firstLine: addressLine, ...addressExtras(cust) };

  // بوسطة بترفض `cityId` وبتقول "city, zoneId, or districtId is required" —
  // الشكل الشغال هو `city` وجوّاه رقم المدينة. بنسيب البدايل ورا بعض عشان
  // لو غيّروا الحقل تاني السيستم يفضل شغال من غير نشر جديد.
  const cityId = input.city!._id;
  const cityName = input.city!.nameAr || input.city!.name || "";
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

// ==========================================================================
// شحنة المرتجع — بوسطة بتسحب من العميل وتوصّلها لك
// --------------------------------------------------------------------------
// فرقها عن الإرسال: نوعها ١٥، والتحصيل **صفر** لأن الفلوس إنت اللي بترجّعها
// للعميل بنفسك (إنستا باي/أونلاين) — بوسطة مابتدفعش للعميل.
// ==========================================================================

export type ReturnInput = {
  orderNumber: string | number | null;
  /** رقم تتبع الشحنة الأصلية — بوسطة بتستخدمه تملّي بيانات العميل */
  originalTracking: string | null;
  /** المنتجات اللي اتعلّم عليها راجعة وكمياتها */
  returning: { returnedQuantity: number; productName: string | null }[];
  customer: ShipmentCustomer | null;
  city: BostaCity | null;
};

export type BuiltReturn = {
  itemsCount: number;
  description: string;
  addressLine: string;
  city: { id: string; name: string };
  base: Record<string, unknown>;
  /** أشكال العنوان — نفس درس `city` بدل `cityId` اللي اتعلمناه في الإرسال */
  variants: { name: string; addresses: Record<string, unknown> }[];
};

export type BuildReturnResult =
  | { ok: false; error: string }
  | { ok: true; shipment: BuiltReturn };

export function buildReturnShipment(input: ReturnInput): BuildReturnResult {
  const returning = input.returning.filter((i) => Number(i.returnedQuantity) > 0);
  if (returning.length === 0) {
    return {
      ok: false,
      error:
        "حدّد الأول المنتجات الراجعة وكمياتها من جوّه الأوردر، وبعدين اعمل شحنة المرتجع.",
    };
  }

  const prep = prepareCustomer(
    input.customer,
    input.city,
    "اعمل شحنة المرتجع يدوي من بوسطة."
  );
  if (!prep.ok) return prep;
  const { addressLine, phone, firstName, lastName } = prep.ready;
  const cust = input.customer as ShipmentCustomer;

  const itemsCount = returning.reduce(
    (s, i) => s + Number(i.returnedQuantity),
    0
  );
  const description =
    returning
      .map((i) => `${i.productName?.trim() || "منتج"} × ${i.returnedQuantity}`)
      .join(" + ")
      .slice(0, 250) || "مرتجع";

  const cityId = input.city!._id;
  const cityName = input.city!.nameAr || input.city!.name || "";

  const base: Record<string, unknown> = {
    type: DELIVERY_TYPE_CUSTOMER_RETURN,
    specs: {
      packageType: "Parcel",
      packageDetails: { itemsCount, description },
    },
    receiver: { firstName, lastName, phone },
    // الفلوس إحنا اللي نرجّعها للعميل — الشحنة بصفر تحصيل
    cod: 0,
    businessReference: `RET-${input.orderNumber ?? ""}`,
    notes: `مرتجع أوردر ${input.orderNumber ?? ""}${
      input.originalTracking ? ` (شحنة أصلية ${input.originalTracking})` : ""
    }`.trim(),
    ...(input.originalTracking
      ? { originalTrackingNumber: String(input.originalTracking) }
      : {}),
  };

  const line = { firstLine: addressLine, ...addressExtras(cust) };
  // العنوان بيتبعت في الاتنين: `pickupAddress` هو مكان السحب من العميل،
  // و`dropOffAddress` بنبعته برضه لأن بعض إصدارات بوسطة بتطلبه
  const variants = [
    {
      name: "city",
      addresses: {
        pickupAddress: {
          city: cityId,
          ...line,
          ...(cust.zone ? { zoneName: cust.zone } : {}),
        },
        dropOffAddress: { city: cityId, ...line },
      },
    },
    {
      name: "cityId",
      addresses: {
        pickupAddress: {
          cityId,
          ...line,
          ...(cust.zone ? { zoneName: cust.zone } : {}),
        },
        dropOffAddress: { cityId, ...line },
      },
    },
  ];

  return {
    ok: true,
    shipment: {
      itemsCount,
      description,
      addressLine,
      city: { id: cityId, name: cityName },
      base,
      variants,
    },
  };
}
