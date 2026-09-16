import { describe, expect, it } from "vitest";
import { groupByDay, withRunningBalance, type LedgerMove } from "./cash-ledger";

const m = (id: string, direction: string, amount: number, date: string): LedgerMove => ({
  id,
  direction,
  amount,
  transaction_date: `${date}T00:00:00+00:00`,
});

// الأحدث الأول — زي الدفتر
const rows = [
  m("c", "out", 320, "2026-09-14"),
  m("b", "in", 3388, "2026-09-14"),
  m("a", "in", 1000, "2026-09-13"),
];

describe("withRunningBalance", () => {
  it("أول سطر = الرصيد الحالي، وكل سطر تحته قبل الحركة اللي فوقه", () => {
    const out = withRunningBalance(rows, 4068);
    expect(out.map((r) => r.balanceAfter)).toEqual([4068, 4388, 1000]);
  });

  it("⚠️ الرصيد بعد أقدم حركة = الرصيد قبلها + الحركة — مش صفر", () => {
    // فيه حركات أقدم مش معروضة (رصيدها ٥٠٠)
    const out = withRunningBalance(rows, 4568);
    expect(out[2].balanceAfter).toBe(1500);
  });

  it("مابيغيّرش الصفوف الأصلية", () => {
    withRunningBalance(rows, 0);
    expect(rows[0]).not.toHaveProperty("balanceAfter");
  });
});

describe("groupByDay", () => {
  it("يوم لكل تاريخ، ومجموع داخله وخارجه", () => {
    const days = groupByDay(rows, false);
    expect(days.map((d) => [d.day, d.totalIn, d.totalOut, d.rows.length])).toEqual([
      ["2026-09-14", 3388, 320, 2],
      ["2026-09-13", 1000, 0, 1],
    ]);
  });

  it("آخر يوم بيتعلّم مقصوص لو فيه حركات أقدم", () => {
    const days = groupByDay(rows, true);
    expect(days.map((d) => d.partial)).toEqual([false, true]);
  });

  it("من غير حركات أقدم مفيش يوم مقصوص", () => {
    expect(groupByDay(rows, false).some((d) => d.partial)).toBe(false);
  });

  it("فاضي = مفيش أيام", () => {
    expect(groupByDay([], true)).toEqual([]);
  });
});
