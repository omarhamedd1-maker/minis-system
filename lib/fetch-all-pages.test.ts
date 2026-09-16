import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { allRows, PAGE_SIZE } from "./fetch-all-pages";

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
