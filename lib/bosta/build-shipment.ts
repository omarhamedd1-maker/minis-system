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
const DELIVERY_TYPE_EXCHANGE = 30;

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
  /** اللي العميل دفعه مقدم — بيتخصم من التحصيل */
  amountPaid?: number | null;
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

/**
 * التحصيل = البضاعة − الخصم + الشحن − **اللي العميل دفعه قبل الشحن**.
 *
 * **الجزء الأخير ده كان ناقص، وكان بيكلّف فلوس حقيقية.** أوردر ١٣٣٦ اتدفع
 * كامل بإنستا باي (١١٬٩٧٨ ج) وراح لبوسطة بتحصيل ١١٬٩٧٨ — يعني المندوب كان
 * هيطلب من العميل فلوس هو دافعها خلاص، وبوسطة حسبت رسوم على التحصيل ده:
 * عمولة تحصيل ٩٩٫٧٨ + رسم تحويل ١١٩٫٧٨، فالرسوم طلعت ٢٨١ بدل ٤٦.
 *
 * الأوردر المدفوع بالكامل بيروح **بتحصيل صفر**، والمدفوع جزئيًا بيروح
 * بالباقي بس.
 */
export function computeCod(input: {
  items: ShipmentItem[];
  discount: number | null;
  shippingPrice: number | null;
  /** اللي العميل دفعه مقدم (إنستا باي، فودافون كاش، تحويل…) */
  amountPaid?: number | null;
}): number {
  const itemsTotal = input.items.reduce(
    (s, i) => s + Number(i.quantity) * Number(i.salePrice),
    0
  );
  return Math.max(
    0,
    itemsTotal -
      Number(input.discount ?? 0) +
      Number(input.shippingPrice ?? 0) -
      Number(input.amountPaid ?? 0)
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

// ==========================================================================
// شحنة التبديل — بوسطة بتوصّل الجديد وتاخد القديم في نفس الرحلة
// --------------------------------------------------------------------------
// فرقها عن المرتجع: المرتجع بيسحب من العميل وخلاص. التبديل بيروح بحاجة
// **و**يرجع بحاجة، فبوسطة محتاجة تعرف الاتنين: `specs` للي رايح للعميل،
// و`returnSpecs` للي راجع منه.
//
// والتحصيل هنا **فرق السعر بس**، مش سعر الأوردر. الحاجة القديمة مدفوعة
// خلاص، فلو البديل بنفس السعر التحصيل صفر. ولو أغلى بيتحصّل الفرق.
// وبنخلّي الافتراضي صفر بقصد — مانخمّنش في فلوس بتتاخد من عميل.
// ==========================================================================

export type ExchangeInput = {
  orderNumber: string | number | null;
  /** رقم تتبع الشحنة الأصلية — بوسطة بتربطهم ببعض */
  originalTracking: string | null;
  /** الرايح للعميل */
  outgoing: { quantity: number; productName: string | null }[];
  /** الراجع من العميل */
  incoming: { quantity: number; productName: string | null }[];
  /** فرق السعر اللي المندوب يحصّله — صفر يعني مفيش فرق */
  cod?: number | null;
  customer: ShipmentCustomer | null;
  city: BostaCity | null;
  zone: BostaZone | null;
  pickupAddressId?: string | null;
};

export type BuiltExchange = {
  cod: number;
  outCount: number;
  inCount: number;
  outDescription: string;
  inDescription: string;
  addressLine: string;
  city: { id: string; name: string };
  base: Record<string, unknown>;
  variants: PayloadVariant[];
};

export type BuildExchangeResult =
  | { ok: false; error: string }
  | { ok: true; shipment: BuiltExchange };

/** وصف البنود في سطر واحد — نفس شكل الإرسال والمرتجع */
function describe(
  items: { quantity: number; productName: string | null }[],
  fallback: string
): string {
  return (
    items
      .map((i) => `${i.productName?.trim() || "منتج"} × ${i.quantity}`)
      .join(" + ")
      .slice(0, 250) || fallback
  );
}

export function buildExchangeShipment(
  input: ExchangeInput
): BuildExchangeResult {
  const outgoing = input.outgoing.filter((i) => Number(i.quantity) > 0);
  const incoming = input.incoming.filter((i) => Number(i.quantity) > 0);

  // **الاتنين لازم** — تبديل من غير واحد فيهم مش تبديل أصلاً
  if (outgoing.length === 0) {
    return {
      ok: false,
      error: "حدّد الأول إيه اللي هيروح للعميل — من غيره دي مش شحنة تبديل.",
    };
  }
  if (incoming.length === 0) {
    return {
      ok: false,
      error:
        "حدّد إيه اللي هيرجع من العميل — لو مفيش حاجة راجعة يبقى ده إرسال عادي مش تبديل.",
    };
  }

  const prep = prepareCustomer(
    input.customer,
    input.city,
    "اعمل شحنة التبديل يدوي من بوسطة."
  );
  if (!prep.ok) return prep;
  const { addressLine, phone, firstName, lastName } = prep.ready;
  const cust = input.customer as ShipmentCustomer;

  const outCount = outgoing.reduce((s, i) => s + Number(i.quantity), 0);
  const inCount = incoming.reduce((s, i) => s + Number(i.quantity), 0);
  const outDescription = describe(outgoing, "تبديل");
  const inDescription = describe(incoming, "المرتجع");

  // فرق السعر بس — ومابينزلش تحت الصفر (بوسطة مابتدفعش للعميل)
  const cod = Math.max(0, Number(input.cod ?? 0));

  const cityId = input.city!._id;
  const cityName = input.city!.nameAr || input.city!.name || "";

  const base: Record<string, unknown> = {
    type: DELIVERY_TYPE_EXCHANGE,
    // الرايح للعميل
    specs: {
      packageType: "Parcel",
      packageDetails: { itemsCount: outCount, description: outDescription },
    },
    // الراجع منه
    returnSpecs: {
      packageType: "Parcel",
      packageDetails: { itemsCount: inCount, description: inDescription },
    },
    cod,
    receiver: { firstName, lastName, phone },
    businessReference: `EXC-${input.orderNumber ?? ""}`,
    notes: `تبديل أوردر ${input.orderNumber ?? ""} — رايح: ${outDescription} / راجع: ${inDescription}`
      .trim()
      .slice(0, 500),
    allowToOpenPackage: true,
    ...(input.originalTracking
      ? { originalTrackingNumber: String(input.originalTracking) }
      : {}),
    ...(input.pickupAddressId ? { pickupAddressId: input.pickupAddressId } : {}),
  };

  const extras = { firstLine: addressLine, ...addressExtras(cust) };

  // نفس درس الإرسال: `city` وجوّاه رقم المدينة هو الشكل الشغال، والباقي بدايل
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
      outCount,
      inCount,
      outDescription,
      inDescription,
      addressLine,
      city: { id: cityId, name: cityName },
      base,
      variants,
    },
  };
}

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
