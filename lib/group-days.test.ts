import { describe, expect, it } from "vitest";
import { dayHasHeader, groupDays } from "./group-days";

type Row = { id: string; at: string | null; amount: number };
const rows: Row[] = [
  { id: "a", at: "2026-09-17T10:00:00Z", amount: 100 },
  { id: "b", at: "2026-09-17T08:00:00Z", amount: 50 },
  { id: "c", at: "2026-09-15T08:00:00Z", amount: 70 },
];
const group = (hasMore = false) =>
  groupDays(rows, { dateOf: (r) => r.at, amountOf: (r) => r.amount, hasMore });

describe("التجميع بالتاريخ", () => {
  it("بيجمّع بالترتيب وبيجمع المبالغ", () => {
    expect(group().map((d) => [d.day, d.rows.length, d.total])).toEqual([
      ["2026-09-17", 2, 150],
      ["2026-09-15", 1, 70],
    ]);
  });

  it("⚠️ اليوم اللي فيه صف واحد مالوش عنوان", () => {
    const [first, second] = group();
    expect(dayHasHeader(first)).toBe(true);
    expect(dayHasHeader(second)).toBe(false);
  });

  it("⚠️ اليوم المقصوص بياخد عنوان حتى لو صف واحد", () => {
    const last = group(true).at(-1)!;
    expect(last.partial).toBe(true);
    expect(dayHasHeader(last)).toBe(true);
  });

  it("من غير مبالغ = أصفار · والتاريخ الفاضي يوم لوحده", () => {
    const d = groupDays([{ id: "x", at: null, amount: 5 }], { dateOf: (r) => r.at });
    expect(d).toEqual([{ day: "", rows: [{ id: "x", at: null, amount: 5 }], total: 0, partial: false }]);
  });

  it("مفيش صفوف = مفيش أيام", () => {
    expect(groupDays([], { dateOf: () => null, hasMore: true })).toEqual([]);
  });
});
