// ==========================================================================
// سجل تشغيل المزامنة — الأثر اللي بيخلينا نعرف إنها لسه شغالة
// --------------------------------------------------------------------------
// كل حاجة هنا **بتفشل بهدوء بقصد**: لو الجدول لسه مااتعملش أو حصل خطأ في
// الكتابة، المزامنة نفسها ماتوقفش عشان سطر سجل. لكن القراءة لما تلاقي
// الجدول ناقص بترجّع "مش عارفين" مش "كل حاجة تمام" — الفرق ده مهم.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

/** بعد قد إيه من غير تشغيل ناجح نعتبرها واقفة؟ الجدولة كل ١٥ دقيقة */
export const STALE_AFTER_MINUTES = 45;

export type SyncRun = {
  ok: boolean;
  dry: boolean;
  fetched: number | null;
  matched: number | null;
  changed: number | null;
  unmatched: number | null;
  errors: string | null;
  created_at: string;
};

export async function recordSyncRun(
  db: SupabaseClient,
  run: {
    tenantId: string;
    source?: string;
    ok: boolean;
    dry: boolean;
    fetched?: number;
    matched?: number;
    changed?: number;
    unmatched?: number;
    errors?: string[] | string | null;
    durationMs?: number;
  }
): Promise<void> {
  try {
    const errors = Array.isArray(run.errors)
      ? run.errors.slice(0, 5).join(" | ").slice(0, 2000)
      : (run.errors ?? null);

    await db.from("sync_runs").insert({
      tenant_id: run.tenantId,
      source: run.source ?? "bosta",
      ok: run.ok,
      dry: run.dry,
      fetched: run.fetched ?? null,
      matched: run.matched ?? null,
      changed: run.changed ?? null,
      unmatched: run.unmatched ?? null,
      errors: errors || null,
      duration_ms: run.durationMs ?? null,
    });
  } catch {
    // الجدول مش موجود؟ المزامنة أهم من سجلها
  }
}

export type SyncHealth =
  | { state: "ok"; lastRun: SyncRun; minutesAgo: number }
  /** اشتغلت بس رجّعت أخطاء */
  | { state: "failing"; lastRun: SyncRun; minutesAgo: number }
  /** مافيش تشغيل ناجح من مدة — يعني الجدولة واقفة */
  | { state: "stale"; lastRun: SyncRun | null; minutesAgo: number | null }
  /** الجدول لسه مااتعملش — مش معناها إن كل حاجة تمام */
  | { state: "unknown" };

/**
 * صحة المزامنة لمصدر معيّن.
 *
 * ⚠️⚠️ **الفلتر على `source` إجباري.** الجدول ده بقى فيه مصدرين —
 * `bosta` و`shopify` — ومن غير الفلتر، «آخر صف» ممكن يبقى بتاع
 * المصدر التاني. يعني استيراد شوبيفاي الناجح كان هيخلّي مزامنة بوسطة
 * الواقفة تبان سليمة، والعكس.
 */
export async function readSyncHealth(
  db: SupabaseClient,
  tenantId: string,
  now: Date = new Date(),
  source: "bosta" | "shopify" = "bosta"
): Promise<SyncHealth> {
  const { data, error } = await db
    .from("sync_runs")
    .select("ok, dry, fetched, matched, changed, unmatched, errors, created_at")
    .eq("tenant_id", tenantId)
    .eq("dry", false)
    .eq("source", source)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) return { state: "unknown" };

  const lastRun = (data?.[0] as SyncRun | undefined) ?? null;
  if (!lastRun) return { state: "stale", lastRun: null, minutesAgo: null };

  const minutesAgo = Math.round(
    (now.getTime() - new Date(lastRun.created_at).getTime()) / 60000
  );

  if (minutesAgo > STALE_AFTER_MINUTES) {
    return { state: "stale", lastRun, minutesAgo };
  }
  if (!lastRun.ok || lastRun.errors) {
    return { state: "failing", lastRun, minutesAgo };
  }
  return { state: "ok", lastRun, minutesAgo };
}

/** الرسالة اللي بتتعرض للمستخدم — بالعربي وبتقول يعمل إيه */
export function syncHealthMessage(h: SyncHealth): string | null {
  switch (h.state) {
    case "ok":
      return null;
    case "unknown":
      return null;
    case "failing":
      return `المزامنة مع بوسطة رجّعت أخطاء آخر مرة (من ${h.minutesAgo} دقيقة): ${
        h.lastRun.errors ?? "سبب مش مكتوب"
      }`;
    case "stale":
      return h.minutesAgo === null
        ? "المزامنة مع بوسطة مااشتغلتش ولا مرة — الحالات والتحصيل مش بيتحدّثوا."
        : `المزامنة مع بوسطة واقفة من ${h.minutesAgo} دقيقة (المفروض كل ١٥ دقيقة) — الحالات والتحصيل مش بيتحدّثوا.`;
  }
}
