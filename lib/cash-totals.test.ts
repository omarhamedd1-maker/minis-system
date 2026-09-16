import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fetchAllPages, isMissingFunction, PAGE_SIZE, sumCash } from "./cash-totals";

describe("sumCash", () => {
  it("داخل ناقص خارج، والعدّ لكل اتجاه", () => {
    const t = sumCash([
      { direction: "in", amount: 1000 },
      { direction: "in", amount: "250.5" },
      { direction: "out", amount: 300 },
    ]);
    expect(t).toEqual({
      totalIn: 1250.5,
      totalOut: 300,
      balance: 950.5,
      countAll: 3,
      countIn: 2,
      countOut: 1,
    });
  });

  it("مفيش حركات = صفر مش NaN", () => {
    expect(sumCash([]).balance).toBe(0);
  });
});

describe("fetchAllPages", () => {
  const fake = (total: number) => {
    const all = Array.from({ length: total }, (_, i) => i);
    const calls: [number, number][] = [];
    const page = async (from: number, to: number) => {
      calls.push([from, to]);
      return { data: all.slice(from, to + 1), error: null };
    };
    return { page, calls };
  };

  it("⚠️ الحركة رقم ١٠٠١ بتتحسب — ده الباج اللي كان مستني", async () => {
    const { page } = fake(PAGE_SIZE + 1);
    expect((await fetchAllPages(page)).length).toBe(PAGE_SIZE + 1);
  });

  it("٢٥٠٠ حركة = ٣ صفحات", async () => {
    const { page, calls } = fake(2500);
    expect((await fetchAllPages(page)).length).toBe(2500);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("مضاعف الألف بالظبط بيسأل صفحة فاضية وبيقف", async () => {
    const { page, calls } = fake(2000);
    expect((await fetchAllPages(page)).length).toBe(2000);
    expect(calls.length).toBe(3);
  });

  it("خطأ في نص الطريق بيوقف — رصيد من نص الحركات ممنوع", async () => {
    let n = 0;
    const page = async (from: number, to: number) => {
      n++;
      if (n === 2) return { data: null, error: { message: "انقطع" } };
      return { data: Array.from({ length: to - from + 1 }, () => 1), error: null };
    };
    await expect(fetchAllPages(page)).rejects.toThrow("انقطع");
  });
});

describe("isMissingFunction", () => {
  it("الدالة لسه ماتعملتش", () => {
    expect(isMissingFunction({ code: "PGRST202", message: "" })).toBe(true);
    expect(
      isMissingFunction({ message: "Could not find the function public.cash_totals" })
    ).toBe(true);
  });

  it("أي خطأ تاني مش بيتبلع", () => {
    expect(isMissingFunction({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingFunction(null)).toBe(false);
  });
});

/**
 * ⚠️ **ممنوع أي صفحة تجمع حركات الخزنة بنفسها** — لازم تعدّي من
 * `loadCashTotals`. الاختبار ده بيدوّر على أي قراية لـ`direction, amount`
 * من الخزنة برّه الملف ده.
 */
describe("مصدر واحد للرصيد", () => {
  const root = join(__dirname, "..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name) && !name.includes(".test.")) files.push(p);
    }
  };
  walk(join(root, "app"));
  walk(join(root, "components"));

  it("مافيش صفحة بتجيب direction و amount من الخزنة", () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      return /from\("cash_transactions"\)\s*\.select\("direction, amount"\)/.test(src);
    });
    expect(offenders).toEqual([]);
  });
});
