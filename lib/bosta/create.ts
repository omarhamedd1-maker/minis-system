// ==========================================================================
// عمل شحنات عند بوسطة — الملف اللي بيوصّل القرار بقاعدة البيانات
// --------------------------------------------------------------------------
// فيه عمليتين: `runBostaCreate` بتبعت الأوردر للعميل، و`runBostaReturn`
// بتخلي بوسطة تسحب المرتجع من عنده.
//
// القرار في build-shipment.ts والمطابقة في cities.ts — هنا بنقرا الأوردر،
// نجيب مفتاح بيزنسه هو، نبعت، ونحفظ رقم التتبع. وضع التجربة بيعمل كل حاجة
// من غير ما يبعت ولا يكتب.
//
// ده البديل لدالة `bosta-create` اللي في لوحة سوبابيز. الفرق المهم إن
// **المفتاح بقى مفتاح البيزنس صاحب الأوردر** — قبل كده كان مفتاح واحد
// لكل الناس، يعني أي عميل جديد كانت شحناته هتتبعت من حساب مينيز.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildReturnShipment,
  buildShipment,
  type ShipmentCustomer,
} from "./build-shipment";
import { createDelivery, fetchCities, fetchDeliveryByTracking } from "./client";
import { matchCity, matchZone, type BostaCity } from "./cities";
import { isDeadShipment } from "./order-status";
import { loadTenantCredentials } from "../tenant-settings";

const ORDER_FIELDS = `id, order_number, discount, shipping_price, bosta_tracking, tenant_id,
  customers(full_name, phone, address, city, zone, street, building, floor, apartment, landmark),
  order_items(quantity, sale_price_at_order, product_variants(products(name, name_ar)))`;

type OrderRow = {
  id: string;
  order_number: string | number | null;
  discount: number | null;
  shipping_price: number | null;
  bosta_tracking: string | null;
  tenant_id: string;
  customers: ShipmentCustomer | null;
  order_items:
    | {
        quantity: number;
        sale_price_at_order: number;
        product_variants: {
          products: { name: string | null; name_ar: string | null } | null;
        } | null;
      }[]
    | null;
};

export type CreateAttempt = { variant: string; status: number; message: string };

export type CreateResult =
  /** الأوردر عليه شحنة أصلاً — مش خطأ، بس منبعتش تاني */
  | { ok: true; already: true; tracking: string }
  /** وضع التجربة: ده اللي كان هيتبعت */
  | {
      ok: true;
      dry: true;
      cod: number;
      itemsCount: number;
      city: string;
      zone: string | null;
      addressLine: string;
      payload: Record<string, unknown>;
    }
  | {
      ok: true;
      tracking: string;
      city: string;
      zone: string | null;
      usedVariant: string;
      /** الشحنة اتعملت بس رقم التتبع مااتحفظش — نادرة بس لازم تتقال */
      warning?: string;
    }
  | { ok: false; error: string; attempts?: CreateAttempt[] };

/**
 * قايمة المدن مرة واحدة لدفعة كاملة.
 * القايمة واحدة عند بوسطة لكل الناس، بس جلبها بياخد وقت — فلما نبعت ٣٠ أوردر
 * مع بعض بنجيبها مرة واحدة بدل ٣٠ مرة.
 */
export async function loadBostaCities(
  db: SupabaseClient,
  tenantId: string,
  fetchImpl?: typeof fetch
): Promise<BostaCity[] | null> {
  try {
    const creds = await loadTenantCredentials(db, tenantId);
    if (!creds.bostaApiKey) return null;
    return await fetchCities(creds.bostaApiKey, fetchImpl);
  } catch {
    // فشل الجلب المسبق مش مشكلة — كل أوردر هيجيبها لوحده
    return null;
  }
}

export async function runBostaCreate(opts: {
  db: SupabaseClient;
  orderId: string;
  dry?: boolean;
  fetchImpl?: typeof fetch;
  /** لو الدفعة جابت المدن قبل كده، بنعدّي الجلب */
  cities?: BostaCity[] | null;
}): Promise<CreateResult> {
  const { db, orderId, dry = false, fetchImpl } = opts;

  const { data, error } = await db
    .from("orders")
    .select(ORDER_FIELDS)
    .eq("id", orderId)
    .maybeSingle();

  if (error) return { ok: false, error: "معرفناش نقرا الأوردر: " + error.message };
  if (!data) return { ok: false, error: "الأوردر مش موجود" };

  const order = data as unknown as OrderRow;

  // مفتاح البيزنس صاحب الأوردر — مش مفتاح واحد للكل
  const creds = await loadTenantCredentials(db, order.tenant_id);
  if (!creds.bostaApiKey) {
    return { ok: false, error: "البيزنس ده لسه مربطش حساب بوسطة" };
  }

  // الأوردر عليه شحنة؟ نشوف الشحنة دي لسه نافعة ولا ماتت.
  // ده حصل فعلًا: شحنة مقعدتش أسبوعين من غير بيك اب فبوسطة أرشفتها، والسيستم
  // كان بيقول "الأوردر ده عليه شحنة" ويرفض — فالأوردر يقعد مقفول عليه.
  if (order.bosta_tracking) {
    let dead = false;
    try {
      const existing = await fetchDeliveryByTracking(
        creds.bostaApiKey,
        String(order.bosta_tracking),
        fetchImpl
      );
      // **لازم نتأكد إيجابًا إنها ميتة.** لو بوسطة مارجّعتهاش (٥٠٠ مؤقت مثلاً)
      // مانخاطرش — شحنتين لنفس العميل معناها رسوم مرتين وعميل متلخبط.
      dead = Boolean(existing) && isDeadShipment(existing!.state, existing!.code);
    } catch {
      dead = false;
    }

    if (!dead) {
      return { ok: true, already: true, tracking: order.bosta_tracking };
    }
  }

  const customer = order.customers;
  const items = (order.order_items ?? []).map((i) => ({
    quantity: i.quantity,
    salePrice: i.sale_price_at_order,
    productName:
      i.product_variants?.products?.name_ar ||
      i.product_variants?.products?.name ||
      null,
  }));

  let cities = opts.cities ?? null;
  if (!cities) {
    try {
      cities = await fetchCities(creds.bostaApiKey, fetchImpl);
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "معرفناش نجيب المدن من بوسطة",
      };
    }
  }

  // خانة المدينة المقسّمة أدق، والنص الحر احتياطي
  const city =
    (customer?.city ? matchCity(cities, customer.city) : null) ??
    matchCity(
      cities,
      `${customer?.city ?? ""} ${customer?.zone ?? ""} ${customer?.address ?? ""}`
    );

  const zoneText = `${customer?.zone ?? ""} ${customer?.address ?? ""}`;
  const zone =
    matchZone(city?.zones, zoneText) ?? matchZone(city?.districts, zoneText);

  const result = buildShipment({
    orderNumber: order.order_number,
    discount: order.discount,
    shippingPrice: order.shipping_price,
    items,
    customer,
    city,
    zone,
    pickupAddressId: creds.bostaPickupAddressId,
  });

  if (!result.ok) return { ok: false, error: result.error };
  const s = result.shipment;

  if (dry) {
    return {
      ok: true,
      dry: true,
      cod: s.cod,
      itemsCount: s.itemsCount,
      city: s.city.name,
      zone: s.zone?.name ?? null,
      addressLine: s.addressLine,
      payload: { ...s.base, dropOffAddress: s.variants[0].dropOffAddress },
    };
  }

  // بنجرّب أشكال العنوان بالترتيب لحد ما واحد ينجح
  const attempts: CreateAttempt[] = [];
  let tracking: string | null = null;
  let usedVariant = "";

  for (const v of s.variants) {
    const res = await createDelivery(
      creds.bostaApiKey,
      { ...s.base, dropOffAddress: v.dropOffAddress },
      fetchImpl
    );
    if (res.ok && res.trackingNumber) {
      tracking = res.trackingNumber;
      usedVariant = v.name;
      break;
    }
    attempts.push({
      variant: v.name,
      status: res.status,
      message: res.message,
    });
  }

  if (!tracking) {
    return {
      ok: false,
      error: attempts[0]?.message || "بوسطة رفضت الشحنة",
      attempts,
    };
  }

  const { error: updateError } = await db
    .from("orders")
    .update({
      bosta_tracking: tracking,
      order_status: "ready",
      cancelled_at: null,
    })
    .eq("id", orderId);

  return {
    ok: true,
    tracking,
    city: s.city.name,
    zone: s.zone?.name ?? null,
    usedVariant,
    ...(updateError
      ? {
          warning:
            "الشحنة اتعملت بس معرفناش نحفظ رقم التتبع: " + updateError.message,
        }
      : {}),
  };
}

// ==========================================================================
// شحنة المرتجع — بوسطة تسحب من العميل وتوصّلها لك
// ==========================================================================

const RETURN_FIELDS = `id, order_number, bosta_tracking, return_tracking, tenant_id,
  customers(full_name, phone, address, city, zone, street, building, floor, apartment, landmark),
  order_items(quantity, returned_quantity, product_variants(products(name, name_ar)))`;

type ReturnRow = {
  id: string;
  order_number: string | number | null;
  bosta_tracking: string | null;
  return_tracking: string | null;
  tenant_id: string;
  customers: ShipmentCustomer | null;
  order_items:
    | {
        quantity: number;
        returned_quantity: number | null;
        product_variants: {
          products: { name: string | null; name_ar: string | null } | null;
        } | null;
      }[]
    | null;
};

export type ReturnResult =
  | { ok: true; already: true; tracking: string }
  | {
      ok: true;
      dry: true;
      itemsCount: number;
      description: string;
      city: string;
      payload: Record<string, unknown>;
    }
  | {
      ok: true;
      tracking: string;
      city: string;
      usedVariant: string;
      warning?: string;
    }
  | { ok: false; error: string; attempts?: CreateAttempt[] };

export async function runBostaReturn(opts: {
  db: SupabaseClient;
  orderId: string;
  dry?: boolean;
  fetchImpl?: typeof fetch;
  cities?: BostaCity[] | null;
}): Promise<ReturnResult> {
  const { db, orderId, dry = false, fetchImpl } = opts;

  const { data, error } = await db
    .from("orders")
    .select(RETURN_FIELDS)
    .eq("id", orderId)
    .maybeSingle();

  if (error) return { ok: false, error: "معرفناش نقرا الأوردر: " + error.message };
  if (!data) return { ok: false, error: "الأوردر مش موجود" };

  const order = data as unknown as ReturnRow;

  if (order.return_tracking) {
    return { ok: true, already: true, tracking: order.return_tracking };
  }

  const creds = await loadTenantCredentials(db, order.tenant_id);
  if (!creds.bostaApiKey) {
    return { ok: false, error: "البيزنس ده لسه مربطش حساب بوسطة" };
  }

  const customer = order.customers;
  const returning = (order.order_items ?? []).map((i) => ({
    returnedQuantity: Number(i.returned_quantity ?? 0),
    productName:
      i.product_variants?.products?.name_ar ||
      i.product_variants?.products?.name ||
      null,
  }));

  let cities = opts.cities ?? null;
  if (!cities) {
    try {
      cities = await fetchCities(creds.bostaApiKey, fetchImpl);
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "معرفناش نجيب المدن من بوسطة",
      };
    }
  }

  const city =
    (customer?.city ? matchCity(cities, customer.city) : null) ??
    matchCity(
      cities,
      `${customer?.city ?? ""} ${customer?.zone ?? ""} ${customer?.address ?? ""}`
    );

  const result = buildReturnShipment({
    orderNumber: order.order_number,
    originalTracking: order.bosta_tracking,
    returning,
    customer,
    city,
  });

  if (!result.ok) return { ok: false, error: result.error };
  const s = result.shipment;

  if (dry) {
    return {
      ok: true,
      dry: true,
      itemsCount: s.itemsCount,
      description: s.description,
      city: s.city.name,
      payload: { ...s.base, ...s.variants[0].addresses },
    };
  }

  const attempts: CreateAttempt[] = [];
  let tracking: string | null = null;
  let usedVariant = "";

  for (const v of s.variants) {
    const res = await createDelivery(
      creds.bostaApiKey,
      { ...s.base, ...v.addresses },
      fetchImpl
    );
    if (res.ok && res.trackingNumber) {
      tracking = res.trackingNumber;
      usedVariant = v.name;
      break;
    }
    attempts.push({ variant: v.name, status: res.status, message: res.message });
  }

  if (!tracking) {
    return {
      ok: false,
      error: attempts[0]?.message || "بوسطة رفضت شحنة المرتجع",
      attempts,
    };
  }

  const { error: updateError } = await db
    .from("orders")
    .update({ return_tracking: tracking })
    .eq("id", orderId);

  return {
    ok: true,
    tracking,
    city: s.city.name,
    usedVariant,
    ...(updateError
      ? {
          warning:
            "الشحنة اتعملت بس معرفناش نحفظ رقم التتبع: " + updateError.message,
        }
      : {}),
  };
}
