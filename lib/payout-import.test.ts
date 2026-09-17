import { describe, expect, it } from "vitest";
import { planImport } from "./payout-import";
import type { StatementRow } from "./payout-statement";

const row = (o: Partial<StatementRow>): StatementRow => ({
  invoiceNumber: "SUNCOD06SEP26",
  date: "2026-09-06",
  gross: 1000,
  fees: 0,
  net: 1000,
  orderCount: 1,
  line: 2,
  ...o,
});

const cand = (id: string, cod: number, day: string) => ({
  orderId: id,
  cod,
  deliveredAt: `2026-09-${day}T10:00:00Z`,
});

const plan = (rows: StatementRow[], candidates: ReturnType<typeof cand>[], manualCash: { id: string; amount: number; date: string }[] = []) =>
  planImport(rows, { candidates, manualCash, existingInvoices: new Set() });

describe("⛔ خطة الاستيراد — بتربط مش بتسجّل", () => {
  it("مطابق + حركة يدوية موجودة = جاهز، ومفيش حركة جديدة", () => {
    const p = plan([row({})], [cand("a", 1000, "05")], [{ id: "m1", amount: 1000, date: "2026-09-06" }]);
    expect(p.rows[0]).toMatchObject({ status: "matched", orderIds: ["a"], cash: { kind: "linked", cashId: "m1" } });
    expect(p.totals).toMatchObject({ matched: 1, needsReview: 0 });
  });

  it("⚠️ مفيش حركة = «ناقص» ومستني دوسة", () => {
    const p = plan([row({})], [cand("a", 1000, "05")]);
    expect(p.rows[0].status).toBe("needs_review");
    expect(p.rows[0].reason).toContain("محتاج دوسة");
  });

  it("⚠️ فرق التقريب = مستني قرار مش تصليح", () => {
    const p = plan([row({ net: 6437.44, gross: 6437.44 })], [cand("a", 6437.44, "05")], [
      { id: "m2", amount: 6400, date: "2026-09-06" },
    ]);
    expect(p.rows[0].status).toBe("needs_review");
    expect(p.rows[0].reason).toContain("37.44");
    expect(p.rows[0].cash).toMatchObject({ kind: "diff", cashId: "m2" });
  });

  it("⚠️ الأوردر والحركة بيتحجزوا لأول تحويل — مش بيتكرروا", () => {
    const rows = [
      row({ invoiceNumber: "A1", date: "2026-09-06" }),
      row({ invoiceNumber: "A2", date: "2026-09-07" }),
    ];
    const p = plan(rows, [cand("a", 1000, "05"), cand("b", 1000, "06")], [
      { id: "m1", amount: 1000, date: "2026-09-06" },
      { id: "m2", amount: 1000, date: "2026-09-07" },
    ]);
    const byInvoice = Object.fromEntries(p.rows.map((r) => [r.row.invoiceNumber, r]));
    expect(byInvoice.A1.orderIds).toEqual(["a"]);
    expect(byInvoice.A2.orderIds).toEqual(["b"]);
    expect(byInvoice.A1.cash).toMatchObject({ cashId: "m1" });
    expect(byInvoice.A2.cash).toMatchObject({ cashId: "m2" });
  });

  it("الفاتورة المتسجّلة قبل كده بتتعدّى", () => {
    const p = planImport([row({ invoiceNumber: "OLD" })], {
      candidates: [cand("a", 1000, "05")],
      manualCash: [],
      existingInvoices: new Set(["OLD"]),
    });
    expect(p.rows[0].status).toBe("duplicate");
    expect(p.totals).toMatchObject({ duplicates: 1, net: 0 });
  });

  it("المجاميع للجديد بس، والرسوم مجمّعة للعرض", () => {
    const p = plan(
      [row({ invoiceNumber: "A1", net: 100, fees: 5 }), row({ invoiceNumber: "A2", net: 200, fees: 7, date: "2026-09-07" })],
      []
    );
    expect(p.totals).toMatchObject({ all: 2, net: 300, fees: 12 });
  });

  it("الأحدث الأول في العرض", () => {
    const p = plan(
      [row({ invoiceNumber: "قديم", date: "2026-09-01" }), row({ invoiceNumber: "جديد", date: "2026-09-09" })],
      []
    );
    expect(p.rows.map((r) => r.row.invoiceNumber)).toEqual(["جديد", "قديم"]);
  });
});
