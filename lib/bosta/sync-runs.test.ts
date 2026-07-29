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

function fakeDb(rows: SyncRun[] | null, error = false): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({
                data: rows,
                error: error ? { message: "الجدول مش موجود" } : null,
              }),
            }),
          }),
        }),
      }),
    }),
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
