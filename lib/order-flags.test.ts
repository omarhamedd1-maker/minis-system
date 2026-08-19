import { describe, it, expect } from "vitest";
import { orderFlags, SHORT_ADDRESS, BIG_ORDER, type FlagOrder } from "./order-flags";

const good = "٢٧ شارع مصدق، الدقي، عمارة 12 الدور 3 شقة 5";

const order = (o: Partial<FlagOrder>): FlagOrder => ({
  orderStatus: "confirmed",
  total: 1000,
  address: good,
  previousOrders: 3,
  previousReturns: 0,
  ...o,
});

const keys = (o: FlagOrder) => orderFlags(o).map((f) => f.key);

describe("علامات الأوردر", () => {
  it("الأوردر السليم مالوش علامات", () => {
    expect(orderFlags(order({}))).toEqual([]);
  });

  it("العنوان القصير بيتعلّم", () => {
    expect(keys(order({ address: "شارع 9 المعادي" }))).toContain("address");
  });

  it("العنوان اللي مافيهوش أرقام بيتعلّم", () => {
    expect(
      keys(order({ address: "شارع مصدق المتفرع من شارع التحرير بالدقي" }))
    ).toContain("address");
  });

  it("مافيش عنوان خالص", () => {
    const flags = orderFlags(order({ address: null }));
    expect(flags[0].key).toBe("address");
    expect(flags[0].text).toBe("مافيش عنوان");
  });

  it("العنوان اللي على الحد بالظبط عدّى", () => {
    const addr = "ش 9 المعادي عمارة 12 د3ش4".padEnd(SHORT_ADDRESS, "ـ");
    expect(keys(order({ address: addr }))).not.toContain("address");
  });

  it("العميل اللي رجّع قبل كده", () => {
    const one = orderFlags(order({ previousReturns: 1 }))[0];
    expect(one.key).toBe("returner");
    expect(one.text).toContain("أوردر قبل كده");

    const many = orderFlags(order({ previousReturns: 3 }))[0];
    expect(many.text).toContain("3");
  });

  it("الأوردر الكبير من عميل جديد", () => {
    expect(
      keys(order({ total: BIG_ORDER, previousOrders: 0 }))
    ).toContain("big_new");
  });

  it("⚠️ الكبير من عميل قديم مالوش علامة — ده أحسن عميل عندك", () => {
    expect(
      keys(order({ total: BIG_ORDER * 3, previousOrders: 5 }))
    ).not.toContain("big_new");
  });

  it("الصغير من عميل جديد مالوش علامة", () => {
    expect(
      keys(order({ total: BIG_ORDER - 1, previousOrders: 0 }))
    ).not.toContain("big_new");
  });

  it("⚠️ بعد ما يروح لبوسطة مافيش علامات — الكلام ده عدّى", () => {
    for (const status of ["shipped", "delivered", "returned", "cancelled", "ready"]) {
      expect(orderFlags(order({ orderStatus: status, address: null }))).toEqual([]);
    }
  });

  it("أكتر من علامة بتظهر مع بعض", () => {
    const flags = keys(
      order({
        address: "المعادي",
        previousReturns: 2,
        previousOrders: 0,
        total: BIG_ORDER,
      })
    );
    expect(flags).toEqual(["address", "returner", "big_new"]);
  });

  it("الأرقام السالبة أو الناقصة مابتوقعش الحساب", () => {
    expect(() =>
      orderFlags({
        orderStatus: "new",
        total: Number.NaN,
        previousOrders: -5,
        previousReturns: -2,
        address: good,
      })
    ).not.toThrow();
  });
});
