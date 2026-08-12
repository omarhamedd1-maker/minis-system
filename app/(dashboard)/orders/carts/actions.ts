"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser, can } from "@/lib/permissions";
import { loadTenantCredentials } from "@/lib/tenant-settings";
import {
  fetchAbandonedCarts,
  triageCarts,
  type AbandonedCart,
} from "@/lib/shopify/abandoned";

export type CartsReport =
  | {
      ok: true;
      /** فيها تليفون وصاحبها مااشترىش بعدها */
      callable: AbandonedCart[];
      callableValue: number;
      recovered: number;
      unreachable: number;
      total: number;
    }
  | { ok: false; error: string };

/**
 * السلات المتروكة من شوبيفاي.
 *
 * **قراية بالكامل — مابتكتبش حاجة عندنا.** السلة مش أوردر، ولو دخلت جدول
 * الأوردرات المبيعات هتكدب لأن لسه مفيش بيع حصل.
 */
export async function loadAbandonedCarts(): Promise<CartsReport> {
  const me = await getSessionUser();
  if (!me || !can(me, "orders.view")) {
    return { ok: false, error: "مالكش صلاحية" };
  }

  const db = createAdminClient();
  const creds = await loadTenantCredentials(db, me.tenantId);
  if (!creds.shopifyShop || !creds.shopifyAccessToken) {
    return { ok: false, error: "البيزنس ده لسه مربطش شوبيفاي" };
  }

  let carts: AbandonedCart[];
  try {
    carts = await fetchAbandonedCarts(creds.shopifyShop, creds.shopifyAccessToken);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "معرفناش نوصل لشوبيفاي",
    };
  }

  // تليفونات اللي اشتروا فعلاً — عشان نشيل السلة اللي خلصت لوحدها
  const { data: buyers } = await db
    .from("customers")
    .select("phone")
    .eq("tenant_id", me.tenantId)
    .limit(5000);

  const t = triageCarts(carts, (buyers ?? []).map((b) => b.phone as string | null));

  return {
    ok: true,
    callable: t.callable,
    callableValue: t.callableValue,
    recovered: t.recovered.length,
    unreachable: t.unreachable.length,
    total: carts.length,
  };
}
