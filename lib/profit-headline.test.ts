import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AT_CARRIER_STATUSES, EXCLUDED_STATUSES } from "./format";
import { NOT_IN_PROFIT } from "./profit-exclusions";
import { headlineFromRow } from "./profit-headline";

// ⚠️⚠️ الدالة نسخة من `computeHeadline` — القوايم لو اختلفت الرقمين بيختلفوا
// بالصمت. الحارس ده بيقرا ملف الـSQL ويقارنه بالكود.
const sql = readFileSync("sql/profit-headline.sql", "utf8");

/** القايمة اللي بعد تعليق `-- اسم` لحد القوس المقفول */
function listAfter(marker: string): string[] {
  const at = sql.indexOf(`-- ${marker}`);
  expect(at, `مفيش «-- ${marker}» في الـSQL`).toBeGreaterThan(-1);
  const hit = /\bin\s*\(([^)]*)\)/.exec(sql.slice(at));
  expect(hit, `مفيش قايمة بعد «-- ${marker}»`).not.toBeNull();
  return [...hit![1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
}

const sorted = (xs: string[]) => [...xs].sort();

describe("دالة الربح في الداتابيز = الكود", () => {
  it("الحالات المستثناة من المبيعات", () => {
    expect(sorted(listAfter("EXCLUDED_STATUSES"))).toEqual(sorted(EXCLUDED_STATUSES));
  });

  it("الحالات اللي بوسطة بتاخد فيها فلوسها", () => {
    expect(sorted(listAfter("AT_CARRIER_STATUSES"))).toEqual(sorted(AT_CARRIER_STATUSES));
  });

  it("المصاريف اللي مابتدخلش الربح — في الفلترين", () => {
    const want = sorted(NOT_IN_PROFIT.map((c) => c.category));
    expect(sorted(listAfter("NOT_IN_PROFIT"))).toEqual(want);
    const lists = [...sql.matchAll(/btrim\(coalesce\(category, ''\)\) (?:not )?in\s*\(([^)]*)\)/g)];
    expect(lists).toHaveLength(2);
    for (const l of lists) {
      expect(sorted([...l[1].matchAll(/'([^']*)'/g)].map((m) => m[1]))).toEqual(want);
    }
  });
});

describe("قراية الصف", () => {
  it("الأرقام بتيجي نص من الداتابيز", () => {
    const h = headlineFromRow({
      sales: "1000.50",
      gross_sales: "1200",
      profit: "400",
      expenses_total: "100",
      expenses_excluded: "50",
      shipping_revenue: "90",
      shipped_count: "2",
      bosta_shipping_total: "120",
      net_shipping: "30",
      net_profit: "270",
      cod: "900",
      order_count: "4",
    });
    expect(h.sales).toBe(1000.5);
    expect(h.netProfit).toBe(270);
    expect(h.avgOrder).toBeCloseTo(250.125);
  });

  it("مفيش صف = أصفار من غير قسمة على صفر", () => {
    const h = headlineFromRow(undefined);
    expect(h.sales).toBe(0);
    expect(h.avgOrder).toBe(0);
  });
});
