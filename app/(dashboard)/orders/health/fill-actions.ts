"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { loadTenantCredentials } from "@/lib/tenant-settings";
import { fillReturnReasons, fillSummary } from "@/lib/bosta/fill-return-reasons";
import type { BostaAttemptIn } from "@/lib/bosta/return-reason";
import { logActivity } from "@/lib/activity";

const BOSTA_BASE = "https://app.bosta.co/api/v2";

/**
 * جيب أسباب الرجوع من بوسطة.
 *
 * ⚠️ **نداء لكل شحنة لوحدها** — مسار البحث الجماعي بيرجّع الحالة بس، مش
 * المحاولات. فالتشغيلة محدودة والباقي بيتعمل في التشغيلة اللي بعدها.
 */
export async function fillReasonsAction(): Promise<{
  ok: boolean;
  message: string;
}> {
  const me = await requirePermission("finance.dashboard");
  const db = createAdminClient();

  const creds = await loadTenantCredentials(db, me.tenantId);
  if (!creds.bostaApiKey) {
    return { ok: false, message: "البيزنس ده مش مربوط ببوسطة" };
  }
  const key = creds.bostaApiKey;

  const result = await fillReturnReasons(db, me.tenantId, {
    fetchAttempts: async (tracking): Promise<BostaAttemptIn[] | null> => {
      const res = await fetch(
        `${BOSTA_BASE}/deliveries/business/${encodeURIComponent(tracking)}`,
        {
          headers: { Authorization: key },
          signal: AbortSignal.timeout(15_000),
        }
      );
      if (!res.ok) return null;
      const json = await res.json().catch(() => null);
      const d = json?.data ?? json;
      const ex = d?.state?.exception;
      return Array.isArray(ex) ? (ex as BostaAttemptIn[]) : [];
    },
  });

  if (result.filled > 0) {
    await logActivity(
      me,
      "bosta.reasons",
      `جاب سبب الرجوع لـ${result.filled} شحنة من بوسطة`
    );
  }

  revalidatePath("/orders/health");
  return { ok: true, message: fillSummary(result) };
}
