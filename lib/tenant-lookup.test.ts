// ==========================================================================
// إيجاد المتجر من اللي المستخدم بيكتبه في صفحة `/login`
// --------------------------------------------------------------------------
// الصفحة دي مابقتش باب دخول — بتسأل عن المتجر وبتوديك على بابه. فلو
// البحث وقع، المستخدم بيتقفل برّه خالص ومافيش طريقة تانية يدخل بيها.
//
// والحالة اللي وقعت فعلاً في التجربة: **الاسم العربي**. `slugify` بيشيل
// أي حرف مش إنجليزي، فـ`مينيز` كان بيطلّع نص فاضي ويرجّع «مالقيناش متجر».
// ==========================================================================

import { describe, expect, it } from "vitest";
import { findTenantByNameOrSlug } from "./tenant-lookup.ts";

/** سوبابيز مزيّف بجدول متاجر في الذاكرة */
function fakeDb(rows: { id: string; name: string; slug: string }[]) {
  return {
    from() {
      const state: { col?: string; val?: string; mode?: "eq" | "ilike" } = {};
      const api = {
        select: () => api,
        limit: () => api,
        eq(col: string, val: string) {
          state.col = col; state.val = val; state.mode = "eq"; return api;
        },
        ilike(col: string, val: string) {
          state.col = col; state.val = val; state.mode = "ilike"; return api;
        },
        async maybeSingle() {
          const hit = rows.find((r) => {
            const cell = String(r[state.col as "name" | "slug"] ?? "");
            return state.mode === "ilike"
              ? cell.toLowerCase() === String(state.val).toLowerCase()
              : cell === state.val;
          });
          return { data: hit ?? null, error: null };
        },
      };
      return api;
    },
  } as never;
}

const ROWS = [
  { id: "t1", name: "مينيز", slug: "minis" },
  { id: "t2", name: "2 SEC", slug: "2-sec" },
  { id: "t3", name: "Mino Demo Store", slug: "demo" },
];

describe("إيجاد المتجر من اسمه", () => {
  const db = fakeDb(ROWS);

  it("الاسم المختصر زي ما هو", async () => {
    expect((await findTenantByNameOrSlug(db, "demo"))?.id).toBe("t3");
  });

  it("حروف كبيرة ومسافات زيادة", async () => {
    expect((await findTenantByNameOrSlug(db, "  MINIS  "))?.id).toBe("t1");
  });

  it("**الاسم العربي** — ده اللي كان بيقع", async () => {
    expect((await findTenantByNameOrSlug(db, "مينيز"))?.id).toBe("t1");
  });

  it("الاسم المعروض لما يكون مختلف عن المختصر", async () => {
    // `Mino Demo Store` بتطلّع `mino-demo-store` والمختصر `demo`
    expect((await findTenantByNameOrSlug(db, "Mino Demo Store"))?.id).toBe("t3");
  });

  it("اسم فيه مسافة بيتحوّل لشرطة", async () => {
    expect((await findTenantByNameOrSlug(db, "2 SEC"))?.id).toBe("t2");
  });

  it("متجر مش موجود بيرجّع فاضي", async () => {
    expect(await findTenantByNameOrSlug(db, "متجر مش موجود")).toBeNull();
  });

  it("الفاضي بيرجّع فاضي من غير ما يضرب قاعدة البيانات", async () => {
    expect(await findTenantByNameOrSlug(db, "   ")).toBeNull();
  });

  it("المتجر اللي مالوش اسم مختصر مالوش صفحة دخول", async () => {
    const noSlug = fakeDb([{ id: "t9", name: "بدون", slug: "" }]);
    expect(await findTenantByNameOrSlug(noSlug, "بدون")).toBeNull();
  });
});
