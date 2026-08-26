import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  readSyncHealth,
  syncHealthMessage,
  type SyncRun,
} from "./sync-runs";

const NOW = new Date("2026-07-30T12:00:00Z");

const run = (over: Partial<SyncRun> = {}): SyncRun => ({
  ok: true,
  dry: false,
  fetched: 340,
  matched: 230,
  changed: 6,
  unmatched: 94,
  errors: null,
  created_at: "2026-07-30T11:55:00Z", // من ٥ دقايق
  ...over,
});

/**
 * قاعدة بيانات وهمية بتسجّل الفلاتر اللي اتطلبت.
 *
 * ⚠️ **بتقبل أي عدد `eq`** — النسخة القديمة كانت مثبّتة على اتنين، فأول
 * ما اتضاف فلتر `source` الاختبارات وقعت كلها بـ«مش دالة». التثبيت على
 * عدد بيخلّي الاختبار يقيس شكل الاستعلام بدل ما يقيس النتيجة.
 */
function fakeDb(
  rows: SyncRun[] | null,
  error = false,
  filters: Record<string, unknown> = {}
): SupabaseClient {
  const chain = {
    eq: (col: string, val: unknown) => {
      filters[col] = val;
      return chain;
    },
    order: () => chain,
    limit: async () => ({
      data: rows,
      error: error ? { message: "الجدول مش موجود" } : null,
    }),
  };
  return {
    from: () => ({ select: () => chain }),
  } as unknown as SupabaseClient;
}

describe("صحة المزامنة", () => {
  it("اشتغلت دلوقتي ونجحت = تمام", async () => {
    const h = await readSyncHealth(fakeDb([run()]), "t1", NOW);
    expect(h.state).toBe("ok");
    expect(syncHealthMessage(h)).toBeNull();
  });

  it("عدّى وقت طويل من غير تشغيل = واقفة", async () => {
    const h = await readSyncHealth(
      fakeDb([run({ created_at: "2026-07-30T10:00:00Z" })]), // ساعتين
      "t1",
      NOW
    );
    expect(h.state).toBe("stale");
    expect(syncHealthMessage(h)).toContain("واقفة من 120 دقيقة");
  });

  it("اشتغلت بس رجّعت أخطاء = بتفشل", async () => {
    const h = await readSyncHealth(
      fakeDb([run({ errors: "مفتاح بوسطة مرفوض" })]),
      "t1",
      NOW
    );
    expect(h.state).toBe("failing");
    expect(syncHealthMessage(h)).toContain("مفتاح بوسطة مرفوض");
  });

  it("مافيش ولا تشغيل خالص", async () => {
    const h = await readSyncHealth(fakeDb([]), "t1", NOW);
    expect(h.state).toBe("stale");
    expect(syncHealthMessage(h)).toContain("مااشتغلتش ولا مرة");
  });

  it("الجدول لسه مااتعملش = مش عارفين، مش تمام", async () => {
    // الفرق ده مهم: "مش عارفين" مايتعرضش كإنه نجاح كداب
    const h = await readSyncHealth(fakeDb(null, true), "t1", NOW);
    expect(h.state).toBe("unknown");
    expect(syncHealthMessage(h)).toBeNull();
  });

  it("٤٥ دقيقة هي الحد — تلات مرات الجدولة", async () => {
    const justUnder = await readSyncHealth(
      fakeDb([run({ created_at: "2026-07-30T11:20:00Z" })]), // ٤٠ دقيقة
      "t1",
      NOW
    );
    expect(justUnder.state).toBe("ok");

    const over = await readSyncHealth(
      fakeDb([run({ created_at: "2026-07-30T11:10:00Z" })]), // ٥٠ دقيقة
      "t1",
      NOW
    );
    expect(over.state).toBe("stale");
  });
});

describe("⚠️⚠️ الفلتر على المصدر", () => {
  it("بوسطة هي الافتراضي", async () => {
    const filters: Record<string, unknown> = {};
    await readSyncHealth(fakeDb([run()], false, filters), "t1", NOW);
    expect(filters.source).toBe("bosta");
  });

  it("وشوبيفاي بتتطلب بالاسم", async () => {
    const filters: Record<string, unknown> = {};
    await readSyncHealth(fakeDb([run()], false, filters), "t1", NOW, "shopify");
    expect(filters.source).toBe("shopify");
  });

  it("⚠️ من غير الفلتر ده، استيراد شوبيفاي الناجح كان بيخفي مزامنة بوسطة الواقفة", async () => {
    const filters: Record<string, unknown> = {};
    await readSyncHealth(fakeDb([run()], false, filters), "t1", NOW);
    // الجدول فيه مصدرين — الفلتر هو اللي بيفصل بينهم
    expect(filters.tenant_id).toBe("t1");
    expect(filters.dry).toBe(false);
    expect(filters.source).toBeDefined();
  });
});
