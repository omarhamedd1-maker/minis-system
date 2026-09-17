import { describe, expect, it } from "vitest";
import { duplicateExpenses, unusualMoves, type AlertExpense, type AlertMove } from "./money-alerts";

const e = (id: string, date: string, amount: number, category = "إيجار", description: string | null = "إيجار المخزن"): AlertExpense => ({
  id,
  category,
  amount,
  expense_date: date,
  description,
});

describe("مصروف متسجّل مرتين", () => {
  const today = "2026-09-17";

  it("الإيجار مرتين في نفس اليوم", () => {
    const pairs = duplicateExpenses([e("a", "2026-09-15", 5000), e("b", "2026-09-15", 5000)], today);
    expect(pairs.map((p) => [p.first.id, p.second.id])).toEqual([["a", "b"]]);
  });

  it("اليوم اللي بعده كمان — والوصف بيتقارن من غير مسافات وتاء مربوطة", () => {
    const pairs = duplicateExpenses(
      [e("a", "2026-09-14", 2000, "إعلانات", "اعلان "), e("b", "2026-09-15", 2000, "إعلانات", "إعلانه")],
      today
    );
    // «اعلان » و«إعلانه» نفس الكلمة — الهمزة والمسافة والهاء في الآخر مابتفرقش
    expect(pairs).toHaveLength(1);
    expect(
      duplicateExpenses([e("a", "2026-09-14", 300, "مواصلات", "بنزين"), e("b", "2026-09-15", 300, "مواصلات", " بنزين ")], today)
    ).toHaveLength(1);
  });

  it("بعد يومين مش تكرار — دفعات الورش بتتكرر عادي", () => {
    expect(duplicateExpenses([e("a", "2026-09-10", 5000), e("b", "2026-09-12", 5000)], today)).toEqual([]);
  });

  it("مبلغ أو نوع مختلف مش تكرار", () => {
    expect(duplicateExpenses([e("a", "2026-09-15", 5000), e("b", "2026-09-15", 5001)], today)).toEqual([]);
    expect(duplicateExpenses([e("a", "2026-09-15", 5000), e("b", "2026-09-15", 5000, "مرتبات")], today)).toEqual([]);
  });

  it("التكرار القديم مابيرنّش", () => {
    expect(duplicateExpenses([e("a", "2026-08-01", 5000), e("b", "2026-08-01", 5000)], today)).toEqual([]);
  });

  it("تلات صفوف متطابقة = زوج واحد مش تلاتة", () => {
    expect(
      duplicateExpenses([e("a", "2026-09-15", 5000), e("b", "2026-09-15", 5000), e("c", "2026-09-15", 5000)], today)
    ).toHaveLength(1);
  });
});

describe("حركة أكبر من المعتاد", () => {
  const today = "2026-09-17";
  const hist = (kind: string, amounts: number[], from = "2026-06-01"): AlertMove[] =>
    amounts.map((amount, i) => ({
      id: `${kind}-${i}`,
      kind,
      amount,
      date: new Date(Date.parse(from) + i * 7 * 86_400_000).toISOString().slice(0, 10),
      label: kind,
    }));

  it("أكبر من ضعف أكبر حركة قبلها", () => {
    const rows = [...hist("إعلانات", [3000, 5000, 4000, 4500, 5000]), { id: "x", kind: "إعلانات", amount: 12000, date: "2026-09-15", label: "إعلان" }];
    const out = unusualMoves(rows, today);
    expect(out.map((m) => [m.id, m.previousMax])).toEqual([["x", 5000]]);
  });

  it("ضعف بالظبط مش شاذ", () => {
    const rows = [...hist("إعلانات", [3000, 5000, 4000, 4500, 5000]), { id: "x", kind: "إعلانات", amount: 10000, date: "2026-09-15", label: "" }];
    expect(unusualMoves(rows, today)).toEqual([]);
  });

  it("⚠️ دفعة ورشة كبيرة وسط خامات صغيرة مش شاذة لو اتكررت قبل كده", () => {
    const rows = [
      ...hist("تصنيع وخامات", [200, 350, 5000, 120, 400, 5000, 250]),
      { id: "x", kind: "تصنيع وخامات", amount: 7000, date: "2026-09-15", label: "" },
    ];
    expect(unusualMoves(rows, today)).toEqual([]);
  });

  it("من غير تاريخ كفاية مابنحكمش", () => {
    const rows = [...hist("اشتراكات", [100, 200]), { id: "x", kind: "اشتراكات", amount: 9000, date: "2026-09-15", label: "" }];
    expect(unusualMoves(rows, today)).toEqual([]);
  });

  it("أقل من ٣٠٠٠ مابيرنّش — والقديم مابيرنّش", () => {
    const base = hist("مواصلات", [100, 100, 100, 100, 100]);
    expect(unusualMoves([...base, { id: "x", kind: "مواصلات", amount: 2500, date: "2026-09-15", label: "" }], today)).toEqual([]);
    expect(unusualMoves([...base, { id: "y", kind: "مواصلات", amount: 9000, date: "2026-09-01", label: "" }], today)).toEqual([]);
  });

  it("كل نوع بيتقارن بنفسه", () => {
    const rows = [
      ...hist("إعلانات", [20000, 20000, 20000, 20000, 20000]),
      ...hist("مواصلات", [100, 100, 100, 100, 100]),
      { id: "x", kind: "مواصلات", amount: 5000, date: "2026-09-16", label: "" },
    ];
    expect(unusualMoves(rows, today).map((m) => m.id)).toEqual(["x"]);
  });
});
