import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { allRows, PAGE_SIZE } from "./fetch-all-pages";
import { findUnboundedReads } from "./unbounded-reads";

/** استعلام وهمي بيتصرف زي سوبابيز: range بيكتب فوق اللي قبله، وكل await طلب جديد */
function fakeQuery(total: number, failOnPage?: number) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i }));
  const q = {
    orders: [] as string[],
    calls: [] as [number, number][],
    from: 0,
    to: PAGE_SIZE - 1,
    order(c: string) {
      q.orders.push(c);
      return q;
    },
    range(from: number, to: number) {
      q.from = from;
      q.to = to;
      return q;
    },
    then<T>(ok: (v: { data: { id: number }[] | null; error: { message: string } | null }) => T) {
      q.calls.push([q.from, q.to]);
      if (failOnPage !== undefined && q.calls.length === failOnPage) {
        return Promise.resolve(ok({ data: null, error: { message: "انقطع" } }));
      }
      return Promise.resolve(ok({ data: all.slice(q.from, q.to + 1), error: null }));
    },
  };
  return q;
}

describe("allRows", () => {
  it("⚠️ الصف رقم ١٠٠١ بيوصل — ده الباج", async () => {
    const q = fakeQuery(PAGE_SIZE + 1);
    const { data, error } = await allRows(q);
    expect(error).toBeNull();
    expect((data as unknown[]).length).toBe(PAGE_SIZE + 1);
  });

  it("٢٥٠٠ صف = ٣ طلبات، وبيرتّب بالـid في الآخر", async () => {
    const q = fakeQuery(2500);
    const { data } = await allRows(q);
    expect((data as unknown[]).length).toBe(2500);
    expect(q.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    expect(q.orders).toEqual(["id"]);
  });

  it("خطأ في نص الطريق بيرجع خطأ — مش نص الصفوف", async () => {
    const { data, error } = await allRows(fakeQuery(2500, 2));
    expect(error?.message).toBe("انقطع");
    expect(data).toBeNull();
  });

  it("من غير ترتيب إضافي لو طلبت", async () => {
    const q = fakeQuery(3);
    await allRows(q, null);
    expect(q.orders).toEqual([]);
  });
});

/**
 * ⚠️⚠️ **حارس سقف الألف** (NEXT §٣٣) — زي حارس الألوان.
 *
 * سوبابيز بيرجّع ١٠٠٠ صف بالكتير مهما كتبت في `.limit()`، من غير أي خطأ.
 * الباج ده اتكرر ٣٣ مرة قبل ما يتمسك. أي `.limit()` أكبر من ١٠٠٠ = رقم
 * بيبوظ بالصمت أول ما البيزنس يكبر. الحل: `allRows` أو `fetchAllPages`.
 */
describe("حارس سقف الألف", () => {
  const root = join(__dirname, "..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next") continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name) && !name.includes(".test.")) files.push(p);
    }
  };
  for (const d of ["app", "lib", "components", "supabase"]) walk(join(root, d));

  it("مافيش .limit() أكبر من ١٠٠٠", () => {
    const hits: string[] = [];
    for (const f of files) {
      readFileSync(f, "utf8")
        .split(/\r?\n/)
        .forEach((line, i) => {
          const t = line.trim();
          if (t.startsWith("//") || t.startsWith("*")) return;
          for (const m of line.matchAll(/\.limit\(\s*([\d_]+)\s*\)/g)) {
            if (Number(m[1].replace(/_/g, "")) > 1000) {
              hits.push(`${f.slice(root.length + 1)}:${i + 1} ${m[0]}`);
            }
          }
        });
    }
    expect(
      hits,
      hits.length
        ? `سوبابيز بيقطع عند ١٠٠٠ — استخدم allRows من lib/fetch-all-pages:\n  ${hits.join("\n  ")}`
        : undefined
    ).toEqual([]);
  });
});

/**
 * ⚠️⚠️ **الحارس التاني: قايمة من غير أي حد** (NEXT §٣٣)
 *
 * `.select()` من غير `.limit` بيقف عند ١٠٠٠ برضه. أي قراية زي دي لازم تبقى
 * ملفوفة بـ`allRows` — أو مكتوبة هنا **بسببها**. قراية جديدة من غير سبب
 * بتوقّع الفحص.
 */
describe("حارس القراية من غير حد", () => {
  const root = join(__dirname, "..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next") continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name) && !name.includes(".test.")) files.push(p);
    }
  };
  for (const d of ["app", "lib", "components", "supabase"]) walk(join(root, d));

  const TEAM = "فريق البيزنس — عمره ما يعدّي ألف";
  const PARENT = "متفلترة بالأب (أوردر · تاسك · منتج · عميل واحد)";
  const IDS = "متفلترة بقايمة معرّفات معروفة";
  const LATER = "بتتبني في متغير وبتتحدّ أو بتتلف تحت";
  const SMALL = "قليلة بطبيعتها";
  const EDGE = "دالة إيدج قديمة — قرار إصلاحها أو مسحها عند عمر";

  const ALLOWED: Record<string, { tables: Record<string, number>; why: string }> = {
    "app/(dashboard)/cash/ExpensesTab.tsx": { tables: { expenses: 2 }, why: LATER },
    "app/(dashboard)/cash/MovesTab.tsx": { tables: { cash_transactions: 1 }, why: LATER },
    "app/(dashboard)/orders/page.tsx": { tables: { orders: 1, deletion_requests: 1 }, why: `${LATER} · طلبات الحذف المستنية ${SMALL}` },
    "app/export/route.ts": { tables: { expenses: 1 }, why: LATER },
    "app/track/[tracking]/actions.ts": { tables: { orders: 1 }, why: LATER },
    "app/track/[tracking]/page.tsx": { tables: { orders: 1 }, why: LATER },
    "lib/bosta/fees-backfill.ts": { tables: { orders: 1 }, why: LATER },
    "app/(dashboard)/layout.tsx": { tables: { app_users: 1, push_subscriptions: 1 }, why: TEAM },
    "app/(dashboard)/notify/actions.ts": { tables: { app_users: 1 }, why: TEAM },
    "app/(dashboard)/platform/[id]/page.tsx": { tables: { app_users: 1 }, why: TEAM },
    "app/(dashboard)/tasks/page.tsx": { tables: { app_users: 1 }, why: TEAM },
    "app/(dashboard)/tasks/[id]/page.tsx": { tables: { app_users: 1 }, why: TEAM },
    "app/(dashboard)/users/actions.ts": { tables: { roles: 1 }, why: TEAM },
    "app/(dashboard)/users/activity/page.tsx": { tables: { app_users: 1 }, why: TEAM },
    "app/(dashboard)/users/page.tsx": { tables: { app_users: 1 }, why: TEAM },
    "lib/delete-tenant.ts": { tables: { app_users: 1 }, why: TEAM },
    "lib/push/send.ts": { tables: { push_subscriptions: 1 }, why: TEAM },
    "lib/task-reminders-run.ts": { tables: { app_users: 1 }, why: TEAM },
    "app/(dashboard)/tasks/actions.ts": { tables: { app_users: 1, task_assignees: 1, task_steps: 1 }, why: `${TEAM} · ${PARENT}` },
    "app/(dashboard)/orders/[id]/actions.ts": { tables: { order_items: 2, cash_transactions: 2 }, why: `${PARENT} · ريفند أوردر واحد` },
    "app/(dashboard)/orders/[id]/page.tsx": { tables: { orders: 1, tasks: 1, app_users: 1 }, why: `${PARENT} · ${TEAM}` },
    "app/(dashboard)/products/actions.ts": { tables: { product_variants: 1 }, why: PARENT },
    "app/(dashboard)/products/bundles/actions.ts": { tables: { product_variants: 1 }, why: IDS },
    "app/o/[id]/actions.ts": { tables: { product_variants: 1 }, why: IDS },
    "app/o/[id]/page.tsx": { tables: { product_variants: 1 }, why: IDS },
    "lib/cash-reversal.ts": { tables: { cash_transactions: 3 }, why: IDS },
    "app/(dashboard)/platform/page.tsx": { tables: { tenants: 1 }, why: SMALL },
    "lib/tenant-settings.ts": { tables: { tenants: 1 }, why: SMALL },
    "supabase/functions/bosta-audit/index.ts": { tables: { orders: 1 }, why: EDGE },
    "supabase/functions/bosta-awb/index.ts": { tables: { orders: 1 }, why: EDGE },
    "supabase/functions/bosta-update/index.ts": { tables: { orders: 1 }, why: EDGE },
    "supabase/functions/bright-endpoint/index.ts": { tables: { orders: 1 }, why: EDGE },
    "supabase/functions/shopify-order-push/index.ts": { tables: { orders: 1 }, why: EDGE },
    "supabase/functions/shopify-order-update/index.ts": { tables: { order_items: 1 }, why: EDGE },
    "supabase/functions/shopify-product/index.ts": { tables: { product_variants: 1 }, why: EDGE },
    "supabase/functions/shopify-sync/index.ts": { tables: { products: 1, product_variants: 1 }, why: EDGE },
  };

  it("كل قراية من غير حد يا ملفوفة يا مكتوب سببها", () => {
    const found: Record<string, Record<string, number>> = {};
    for (const f of files) {
      const rel = f.slice(root.length + 1).split(sep).join("/");
      for (const r of findUnboundedReads(readFileSync(f, "utf8"))) {
        (found[rel] ??= {})[r.table] = (found[rel][r.table] ?? 0) + 1;
      }
    }
    const expected = Object.fromEntries(Object.entries(ALLOWED).map(([k, v]) => [k, v.tables]));
    const extra = Object.entries(found)
      .flatMap(([f, t]) => Object.entries(t).filter(([tb, n]) => (expected[f]?.[tb] ?? 0) < n).map(([tb]) => `${f} → ${tb}`));
    expect(
      found,
      extra.length
        ? `قراية من غير حد — سوبابيز بيقطع عند ١٠٠٠. لفّها بـallRows أو اكتب سببها في ALLOWED:\n  ${extra.join("\n  ")}`
        : undefined
    ).toEqual(expected);
  });
});
