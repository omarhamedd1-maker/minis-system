"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser, can } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { loadTenantCredentials } from "@/lib/tenant-settings";
import { fetchAllDeliveries } from "@/lib/bosta/client";
import { planShipmentLinks, type LinkPlan } from "@/lib/bosta/link-missing";
import { compareCoverage } from "@/lib/bosta/coverage";
import { AT_CARRIER_STATUSES } from "@/lib/format";
import { recordImportRun } from "@/lib/import-runs";

export type LinkMissingResult =
  | { ok: true; dry: boolean; plan: LinkPlan; linked?: number }
  | { ok: false; error: string };

/**
 * بيدوّر في بوسطة على شحنات الأوردرات اللي ضاع رقم تتبعها.
 *
 * **`dry` بيعرض بس مابيكتبش.** القاعدة في المشروع: اعرض قبل ما تنفّذ —
 * وده بيلمس فلوس (الرسوم والتحصيل هيتحسبوا من الشحنة اللي هنربطها).
 */
export async function linkMissingShipments(
  dry: boolean
): Promise<LinkMissingResult> {
  const me = await getSessionUser();
  if (!me || !can(me, "ship.link")) {
    return { ok: false, error: "مالكش صلاحية ربط الشحنات" };
  }

  const db = createAdminClient();

  const creds = await loadTenantCredentials(db, me.tenantId);
  if (!creds.bostaApiKey) {
    return { ok: false, error: "البيزنس ده لسه مربطش حساب بوسطة" };
  }

  // الأوردرات اللي حالتها بتقول إنها عدّت على بوسطة ومالهاش رقم تتبع
  const { data: rows, error } = await db
    .from("orders")
    .select("id, order_number, order_status, customers(full_name)")
    .in("order_status", AT_CARRIER_STATUSES)
    .is("bosta_tracking", null)
    .overrideTypes<
      {
        id: string;
        order_number: string | null;
        order_status: string | null;
        customers: { full_name: string | null } | null;
      }[]
    >();

  if (error) {
    return { ok: false, error: "معرفناش نقرا الأوردرات: " + error.message };
  }
  if (!rows || rows.length === 0) {
    return {
      ok: true,
      dry,
      plan: { links: [], nameMismatch: [], ambiguous: [], notFound: [] },
    };
  }

  // أرقام التتبع المستخدمة خلاص — منلزقهاش مرتين
  const { data: taken } = await db
    .from("orders")
    .select("bosta_tracking")
    .not("bosta_tracking", "is", null)
    .overrideTypes<{ bosta_tracking: string }[]>();

  let deliveries;
  try {
    deliveries = await fetchAllDeliveries(creds.bostaApiKey);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "معرفناش نوصل لبوسطة",
    };
  }

  const plan = planShipmentLinks(
    rows.map((r) => ({
      id: r.id,
      orderNumber: r.order_number,
      customerName: r.customers?.full_name ?? null,
      status: r.order_status,
    })),
    deliveries,
    new Set((taken ?? []).map((t) => String(t.bosta_tracking)))
  );

  if (dry) return { ok: true, dry: true, plan };

  // التنفيذ: بنربط اللي اتأكد بس. المزامنة بعد كده هتجيب الرسوم والتحصيل.
  let linked = 0;
  for (const link of plan.links) {
    const { error: upErr, count } = await db
      .from("orders")
      .update({ bosta_tracking: link.tracking }, { count: "exact" })
      .eq("id", link.orderId)
      .is("bosta_tracking", null);
    if (!upErr && count === 1) linked++;
  }

  if (linked > 0) {
    await logActivity(
      me,
      "bosta.link",
      `ربط ${linked} شحنة ضايعة بأوردراتها من صفحة المطابقة`
    );
    await recordImportRun(db, {
      kind: "shipments",
      summary: `${linked} شحنة اتربطت`,
      actorName: me.fullName ?? me.email ?? null,
      payload: {
        trackings: plan.links.map((l) => ({ orderId: l.orderId })),
      },
    });
  }

  revalidatePath("/orders/reconcile");
  revalidatePath("/orders");
  return { ok: true, dry: false, plan, linked };
}

// ==========================================================================
// فحص التغطية: إيه اللي في بوسطة ومش عندنا، والعكس
// ==========================================================================

export type CoverageReport =
  | {
      ok: true;
      matched: number;
      bostaTotal: number;
      onlyInBosta: {
        tracking: string | null;
        state: string | null;
        cod: number | null;
        name: string | null;
        phone: string | null;
        createdAt: string | null;
      }[];
      onlyInSystem: {
        id: string;
        orderNumber: string | null;
        status: string | null;
      }[];
    }
  | { ok: false; error: string };

/**
 * بيقارن كل شحنات بوسطة بكل أوردراتنا.
 *
 * **قراية بالكامل — مابيكتبش حاجة.** ده فحص بيقول لك فين الفرق، والتصليح
 * بيتعمل بإيدك من «ربط الشحنات الناقصة» أو من جوّه الأوردر.
 */
export async function checkBostaCoverage(): Promise<CoverageReport> {
  const me = await getSessionUser();
  if (!me || !can(me, "ship.link")) {
    return { ok: false, error: "مالكش صلاحية" };
  }

  const db = createAdminClient();
  const creds = await loadTenantCredentials(db, me.tenantId);
  if (!creds.bostaApiKey) {
    return { ok: false, error: "البيزنس ده لسه مربطش حساب بوسطة" };
  }

  let deliveries;
  try {
    deliveries = await fetchAllDeliveries(creds.bostaApiKey);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "معرفناش نجيب شحنات بوسطة",
    };
  }

  const { data: rows, error } = await db
    .from("orders")
    .select("id, order_number, order_status, bosta_tracking, customers(phone)")
    .limit(5000)
    .overrideTypes<
      {
        id: string;
        order_number: string | null;
        order_status: string | null;
        bosta_tracking: string | null;
        customers: { phone: string | null } | null;
      }[]
    >();

  if (error) return { ok: false, error: "معرفناش نقرا الأوردرات: " + error.message };

  const res = compareCoverage(
    deliveries.map((d) => ({
      trackingNumber: d.trackingNumber ?? null,
      businessReference: (d as { businessReference?: string }).businessReference ?? null,
      state: d.state?.value ?? null,
      cod: typeof d.cod === "number" ? d.cod : null,
      createdAt: (d as { createdAt?: string }).createdAt ?? null,
      receiverName: d.receiver?.fullName ?? null,
      receiverPhone: d.receiver?.phone ?? null,
    })),
    (rows ?? []).map((o) => ({
      id: o.id,
      orderNumber: o.order_number,
      status: o.order_status,
      tracking: o.bosta_tracking,
      customerPhone: o.customers?.phone ?? null,
    }))
  );

  return {
    ok: true,
    matched: res.matched,
    bostaTotal: deliveries.length,
    onlyInBosta: res.onlyInBosta.map((s) => ({
      tracking: s.trackingNumber,
      state: s.state ?? null,
      cod: s.cod ?? null,
      name: s.receiverName ?? null,
      phone: s.receiverPhone ?? null,
      createdAt: s.createdAt ?? null,
    })),
    onlyInSystem: res.onlyInSystem.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
    })),
  };
}
