// ==========================================================================
// إعدادات ومفاتيح البيزنس — المكان الوحيد اللي بيقراهم
// --------------------------------------------------------------------------
// الأرقام دي كانت مكتوبة في الكود (الشحن 90، الباقة 88، رسوم بوسطة).
// بقت لكل بيزنس، فكل عميل يظبط أرقامه من غير ما ننشر نسخة جديدة.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CarrierFeeRules } from "./shipping-cost";

/** بيزنس مينيس — أول بيزنس في السيستم */
export const MINIS_TENANT = "00000000-0000-0000-0000-000000000001";

export type TenantSettings = {
  tenantId: string;
  /** الشحن اللي العميل بيدفعه في كل أوردر */
  shippingCharge: number;
  /** الشحن الأساسي اللي باقة شركة الشحن بتغطيه */
  bundleCovers: number;
  bundlePrice: number;
  bundleShipments: number;
  expenseCategories: string[];
  fees: CarrierFeeRules;
};

export type TenantCredentials = {
  bostaApiKey: string | null;
  bostaPickupAddressId: string | null;
  shopifyShop: string | null;
  shopifyAccessToken: string | null;
  shopifyWebhookSecret: string | null;
};

type SettingsRow = {
  tenant_id: string;
  shipping_charge: number;
  bundle_covers: number;
  bundle_price: number;
  bundle_shipments: number;
  expense_categories: string[] | null;
  fee_open: number;
  fee_cod_rate: number;
  fee_cod_threshold: number;
  fee_transfer_rate: number;
  fee_transfer_min: number;
  fee_insurance_rate: number;
  fee_insurance_min: number;
  fee_insurance_max: number;
  fee_vat: number;
};

function toSettings(r: SettingsRow): TenantSettings {
  return {
    tenantId: r.tenant_id,
    shippingCharge: Number(r.shipping_charge),
    bundleCovers: Number(r.bundle_covers),
    bundlePrice: Number(r.bundle_price),
    bundleShipments: Number(r.bundle_shipments),
    expenseCategories: r.expense_categories ?? [],
    fees: {
      openFee: Number(r.fee_open),
      codFeeRate: Number(r.fee_cod_rate),
      codFeeThreshold: Number(r.fee_cod_threshold),
      transferRate: Number(r.fee_transfer_rate),
      transferMin: Number(r.fee_transfer_min),
      insuranceRate: Number(r.fee_insurance_rate),
      insuranceMin: Number(r.fee_insurance_min),
      insuranceMax: Number(r.fee_insurance_max),
      vat: Number(r.fee_vat),
    },
  };
}

export async function loadTenantSettings(
  db: SupabaseClient,
  tenantId: string
): Promise<TenantSettings> {
  const { data, error } = await db
    .from("tenant_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error("معرفناش نقرا إعدادات البيزنس: " + error.message);
  if (!data) throw new Error("البيزنس ده مالوش إعدادات");

  return toSettings(data as SettingsRow);
}

/**
 * مفاتيح البيزنس. **للسيرفر بس** — مينفعش تتنادى من المتصفح أبدًا،
 * والجدول نفسه مقفول فمحدش يقدر يقراه غير بمفتاح الأدمن.
 */
export async function loadTenantCredentials(
  db: SupabaseClient,
  tenantId: string
): Promise<TenantCredentials> {
  const { data, error } = await db
    .from("tenant_credentials")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error("معرفناش نقرا مفاتيح البيزنس: " + error.message);

  return {
    bostaApiKey: data?.bosta_api_key ?? null,
    bostaPickupAddressId: data?.bosta_pickup_address_id ?? null,
    shopifyShop: data?.shopify_shop ?? null,
    shopifyAccessToken: data?.shopify_access_token ?? null,
    shopifyWebhookSecret: data?.shopify_webhook_secret ?? null,
  };
}

/** كل البيزنسات الشغالة — المزامنة بتلف عليهم واحد واحد */
export async function activeTenantIds(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db
    .from("tenants")
    .select("id")
    .eq("active", true);

  if (error) throw new Error("معرفناش نقرا البيزنسات: " + error.message);
  return (data ?? []).map((t) => t.id as string);
}
