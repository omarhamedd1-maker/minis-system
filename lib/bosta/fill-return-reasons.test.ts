import { describe, it, expect, vi } from "vitest";
import {
  fillReturnReasons,
  fillSummary,
  type FillResult,
} from "./fill-return-reasons";
import type { SupabaseClient } from "@supabase/supabase-js";

/** قاعدة بيانات وهمية: بترجّع صفوف، وبتسجّل التحديثات */
function fakeDb(rows: { id: string; bosta_tracking: string }[]) {
  const updates: { id: string; reason: string }[] = [];

  const db = {
    from() {
      let updatePayload: Record<string, unknown> | null = null;
      let targetId = "";

      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, value: string) => {
          if (col === "id") targetId = value;
          return chain;
        },
        in: () => chain,
        is: () => chain,
        not: () => chain,
        limit: () => Promise.resolve({ data: rows, error: null }),
        update: (payload: Record<string, unknown>) => {
          updatePayload = payload;
          return chain;
        },
        then: (resolve: (v: unknown) => void) => {
          if (updatePayload) {
            updates.push({
              id: targetId,
              reason: String(updatePayload.return_reason),
            });
          }
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;

  return { db, updates };
}

describe("ملء أسباب الرجوع", () => {
  it("بيحط السبب اللي بوسطة قالته", async () => {
    const { db, updates } = fakeDb([{ id: "a", bosta_tracking: "111" }]);
    const r = await fillReturnReasons(db, "t1", {
      fetchAttempts: async () => [{ code: 8, time: "2026-05-01T10:00:00Z" }],
    });
    expect(r).toMatchObject({ checked: 1, filled: 1 });
    expect(updates).toEqual([{ id: "a", reason: "refused_on_delivery" }]);
  });

  it("⚠️ بوسطة مالهاش سبب = مايتكتبش حاجة", async () => {
    const { db, updates } = fakeDb([{ id: "a", bosta_tracking: "111" }]);
    const r = await fillReturnReasons(db, "t1", { fetchAttempts: async () => [] });
    expect(r).toMatchObject({ checked: 1, filled: 0, noReason: 1 });
    expect(updates).toEqual([]);
  });

  it("الشحنة مش موجودة عند بوسطة", async () => {
    const { db } = fakeDb([{ id: "a", bosta_tracking: "111" }]);
    const r = await fillReturnReasons(db, "t1", {
      fetchAttempts: async () => null,
    });
    expect(r).toMatchObject({ checked: 1, notFound: 1, filled: 0 });
  });

  it("⚠️ شحنة واحدة وقعت مابتوقّفش الباقي", async () => {
    const { db, updates } = fakeDb([
      { id: "a", bosta_tracking: "111" },
      { id: "b", bosta_tracking: "222" },
    ]);
    const fetchAttempts = vi
      .fn()
      .mockRejectedValueOnce(new Error("الشبكة وقعت"))
      .mockResolvedValueOnce([{ code: 13 }]);

    const r = await fillReturnReasons(db, "t1", { fetchAttempts });
    expect(r).toMatchObject({ checked: 2, filled: 1, notFound: 1 });
    expect(updates).toEqual([{ id: "b", reason: "unclear_address" }]);
  });

  it("رقم التتبع الفاضي بيتخطّى", async () => {
    const { db } = fakeDb([{ id: "a", bosta_tracking: "   " }]);
    const r = await fillReturnReasons(db, "t1", {
      fetchAttempts: async () => [{ code: 8 }],
    });
    expect(r.checked).toBe(0);
  });
});

describe("خلاصة التشغيلة", () => {
  const base: FillResult = { checked: 0, filled: 0, noReason: 0, notFound: 0 };

  it("مافيش حاجة ناقصة", () => {
    expect(fillSummary(base)).toContain("كل الشحنات");
  });

  it("بتقول الأرقام الحقيقية", () => {
    const text = fillSummary({ checked: 49, filled: 33, noReason: 16, notFound: 0 });
    expect(text).toContain("49");
    expect(text).toContain("33");
    expect(text).toContain("16");
  });

  it("اللي بصفر مايتكتبش", () => {
    const text = fillSummary({ checked: 5, filled: 5, noReason: 0, notFound: 0 });
    expect(text).not.toContain("مالقيناهمش");
  });
});
