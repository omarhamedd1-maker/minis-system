"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { testConnection } from "@/lib/bosta/client";

function back(msg: string, ok = false) {
  redirect(`/settings?${ok ? "saved" : "error"}=` + encodeURIComponent(msg));
}

function num(fd: FormData, key: string, fallback: number) {
  const v = Number(fd.get(key));
  return Number.isFinite(v) ? v : fallback;
}

export async function saveBusinessSettings(formData: FormData) {
  const me = await requirePermission("admin.settings");
  const db = createAdminClient();

  const name = String(formData.get("business_name") ?? "").trim();
  if (name) {
    await db.from("tenants").update({ name }).eq("id", me.tenantId);
  }

  const categories = String(formData.get("expense_categories") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const { error } = await db
    .from("tenant_settings")
    .update({
      shipping_charge: num(formData, "shipping_charge", 90),
      bundle_covers: num(formData, "bundle_covers", 88),
      bundle_price: num(formData, "bundle_price", 2000),
      bundle_shipments: num(formData, "bundle_shipments", 20),
      ...(categories.length ? { expense_categories: categories } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", me.tenantId);

  if (error) back("معرفناش نحفظ الإعدادات: " + error.message);

  await logActivity(me, "settings.business", "عدّل إعدادات البيزنس");
  revalidatePath("/settings");
  back("الإعدادات اتحفظت", true);
}

export async function saveCarrierFees(formData: FormData) {
  const me = await requirePermission("admin.settings");
  const db = createAdminClient();

  const { error } = await db
    .from("tenant_settings")
    .update({
      fee_open: num(formData, "fee_open", 7),
      fee_cod_rate: num(formData, "fee_cod_rate", 0.01),
      fee_cod_threshold: num(formData, "fee_cod_threshold", 2000),
      fee_transfer_rate: num(formData, "fee_transfer_rate", 0.01),
      fee_transfer_min: num(formData, "fee_transfer_min", 13),
      fee_insurance_rate: num(formData, "fee_insurance_rate", 0.01),
      fee_insurance_min: num(formData, "fee_insurance_min", 10),
      fee_insurance_max: num(formData, "fee_insurance_max", 20),
      fee_vat: num(formData, "fee_vat", 1.14),
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", me.tenantId);

  if (error) back("معرفناش نحفظ الرسوم: " + error.message);

  await logActivity(me, "settings.fees", "عدّل رسوم شركة الشحن");
  revalidatePath("/settings");
  back("الرسوم اتحفظت — هتتطبق على أول مزامنة جاية", true);
}

/** بيتأكد إن المفتاح شغال فعلاً عند بوسطة قبل ما نحفظه */
export async function saveBostaKey(formData: FormData) {
  const me = await requirePermission("admin.settings");
  const key = String(formData.get("bosta_api_key") ?? "").trim();
  const pickup = String(formData.get("bosta_pickup") ?? "").trim();

  if (!key) back("اكتب مفتاح بوسطة");

  const result = await testConnection(key);
  if (!result.ok) {
    back("المفتاح مارضيش يشتغل: " + (result.error ?? "بوسطة رفضته"));
  }

  const { error } = await createAdminClient()
    .from("tenant_credentials")
    .update({
      bosta_api_key: key,
      bosta_pickup_address_id: pickup || null,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", me.tenantId);

  if (error) back("معرفناش نحفظ المفتاح: " + error.message);

  await logActivity(me, "settings.bosta", "ربط حساب بوسطة");
  revalidatePath("/settings");
  back("تمام — المفتاح اتجرّب واشتغل واتحفظ", true);
}

/** بيجرّب المفتاح المحفوظ من غير ما يغيّر حاجة */
export async function checkBostaConnection() {
  const me = await requirePermission("admin.settings");

  const { data } = await createAdminClient()
    .from("tenant_credentials")
    .select("bosta_api_key")
    .eq("tenant_id", me.tenantId)
    .maybeSingle();

  if (!data?.bosta_api_key) back("لسه مفيش مفتاح محفوظ");

  const result = await testConnection(data!.bosta_api_key!);
  if (result.ok) back("الاتصال ببوسطة شغال ✓", true);
  back("الاتصال مش شغال: " + (result.error ?? "بوسطة رفضت المفتاح"));
}
