import { describe, expect, it } from "vitest";
import { linkToManualCash, matchPayout, type PayoutCandidate } from "./payout-match";

const o = (id: string, cod: number, day: string): PayoutCandidate => ({
  orderId: id,
  cod,
  deliveredAt: `2026-09-${day}T10:00:00Z`,
});

describe("مطابقة التحويل بالأوردرات", () => {
  it("الأقدم N — الحالة الغالبة (بوسطة بتحوّل بالترتيب)", () => {
    const r = matchPayout({ gross: 3779, count: 3 }, [
      o("c", 1500, "05"),
      o("a", 1000, "01"),
      o("b", 1279, "03"),
      o("d", 900, "07"),
    ]);
    expect(r).toEqual({ ok: true, orderIds: ["a", "b", "c"], how: "oldest" });
  });

  it("⚠️ المليم فارق — ٣,٧٧٩ مش ٣,٧٧٩٫٠١", () => {
    const list = [o("a", 1000, "01"), o("b", 1279.01, "03"), o("c", 1500, "05")];
    expect(matchPayout({ gross: 3779, count: 3 }, list).ok).toBe(false);
    expect(matchPayout({ gross: 3779.01, count: 3 }, list).ok).toBe(true);
  });

  it("مش بالترتيب؟ بيدوّر على المجموعة الصح", () => {
    const r = matchPayout({ gross: 2400, count: 2 }, [
      o("a", 1000, "01"),
      o("b", 1279, "03"),
      o("c", 1500, "05"),
      o("d", 900, "07"),
    ]);
    expect(r).toMatchObject({ ok: true, orderIds: ["c", "d"], how: "search" });
  });

  it("⚠️ الأقدم بيكسب حتى لو فيه مجموعة تانية بنفس المبلغ — بوسطة بتحوّل بالترتيب", () => {
    const r = matchPayout({ gross: 2000, count: 2 }, [
      o("a", 1000, "01"),
      o("b", 1000, "02"),
      o("c", 1000, "03"),
    ]);
    expect(r).toEqual({ ok: true, orderIds: ["a", "b"], how: "oldest" });
  });

  it("⚠️ الأقدم مامشيش وفيه أكتر من احتمال = مراجعة مش تخمين", () => {
    const r = matchPayout({ gross: 500, count: 2 }, [
      o("a", 900, "01"),
      o("b", 100, "02"),
      o("c", 400, "03"),
      o("d", 400, "04"),
      o("e", 100, "05"),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("أكتر من مجموعة");
      expect(r.options?.length).toBe(2);
    }
  });

  it("المبلغ أكبر من كل المتاح = فيه أوردرات مش في السيستم", () => {
    const r = matchPayout({ gross: 9000, count: 2 }, [o("a", 1000, "01"), o("b", 1000, "02")]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("أكبر من كل المتاح");
  });

  it("العدد أكبر من المتاح = بيقول كده", () => {
    const r = matchPayout({ gross: 1000, count: 5 }, [o("a", 1000, "01")]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("مش في السيستم");
  });

  it("العدد مش معروف = بيجمع من الأقدم", () => {
    const r = matchPayout({ gross: 2279, count: null }, [
      o("a", 1000, "01"),
      o("b", 1279, "03"),
      o("c", 1500, "05"),
    ]);
    expect(r).toEqual({ ok: true, orderIds: ["a", "b"], how: "oldest" });
  });

  it("⚠️ الأوردر بمبلغ صفر مابيدخلش المطابقة", () => {
    const r = matchPayout({ gross: 1000, count: 1 }, [o("z", 0, "01"), o("a", 1000, "02")]);
    expect(r).toMatchObject({ ok: true, orderIds: ["a"] });
  });

  it("مفيش مرشحين أو مبلغ غلط = سبب واضح", () => {
    expect(matchPayout({ gross: 100, count: 1 }, [])).toMatchObject({ ok: false });
    expect(matchPayout({ gross: 0, count: 1 }, [o("a", 100, "01")])).toMatchObject({ ok: false });
  });
});

describe("⛔ الربط بالحركات اليدوية القديمة", () => {
  const rows = [
    { id: "m1", amount: 3671.63, date: "2026-09-06" },
    { id: "m2", amount: 6400, date: "2026-09-10" },
  ];

  it("مطابق بالمليم في نفس اليوم = يتربط", () => {
    expect(linkToManualCash({ net: 3671.63, date: "2026-09-06" }, rows)).toEqual({
      kind: "linked",
      cashId: "m1",
    });
  });

  it("التسجيل اتأخر يوم = لسه بيتربط", () => {
    expect(linkToManualCash({ net: 3671.63, date: "2026-09-05" }, rows)).toMatchObject({
      kind: "linked",
    });
  });

  it("⚠️ فرق التقريب بيتعرض ومايتصلحش لوحده", () => {
    expect(linkToManualCash({ net: 6437.44, date: "2026-09-10" }, rows)).toEqual({
      kind: "diff",
      cashId: "m2",
      difference: 37.44,
    });
  });

  it("مفيش حركة خالص = ناقص (زي تحويل ٨ سبتمبر بـ٦٤٫٨٠)", () => {
    expect(linkToManualCash({ net: 64.8, date: "2026-09-08" }, rows).kind).toBe("gap");
  });

  it("⚠️ الحركة اللي اتربطت مابتتحسبش تاني", () => {
    const used = new Set(["m1"]);
    expect(linkToManualCash({ net: 3671.63, date: "2026-09-06" }, rows, used).kind).toBe("gap");
  });

  it("التاريخ الغلط مايوقعش الحساب", () => {
    expect(linkToManualCash({ net: 100, date: "مش تاريخ" }, rows).kind).toBe("gap");
  });
});

describe("⚠️ السماح: تقريب الحركة اليدوية مش خطأ مطابقة", () => {
  const rows = [{ id: "m1", amount: 4048, date: "2026-07-19" }];

  it("فرق قروش جوّه السماح = ربط ومعاه الفرق مكتوب", () => {
    expect(linkToManualCash({ net: 4048.04, date: "2026-07-19" }, rows, new Set(), 1)).toEqual({
      kind: "linked",
      cashId: "m1",
      rounding: 0.04,
    });
  });

  it("من غير سماح = فرق (ده وضع الإيميل)", () => {
    expect(linkToManualCash({ net: 4048.04, date: "2026-07-19" }, rows).kind).toBe("diff");
  });

  it("⚠️ الفرق الأكبر من جنيه بيفضل «فرق» — ١٥٫٥١ و٣٧٫٤٤ مش تقريب", () => {
    const big = [{ id: "m2", amount: 11100, date: "2026-08-16" }];
    expect(
      linkToManualCash({ net: 11115.51, date: "2026-08-16" }, big, new Set(), 1)
    ).toMatchObject({ kind: "diff", difference: 15.51 });
  });
});

describe("النافذة الزمنية — محاولة تانية، ونتيجتها مرجّحة", () => {
  // الأقدم مش بيطابق، والبحث بيلاقي احتمالين على كل القايمة
  const list = [
    { orderId: "old1", cod: 400, deliveredAt: "2026-08-01T10:00:00Z" },
    { orderId: "old2", cod: 150, deliveredAt: "2026-08-02T10:00:00Z" },
    { orderId: "a", cod: 100, deliveredAt: "2026-09-08T10:00:00Z" },
    { orderId: "b", cod: 400, deliveredAt: "2026-09-09T10:00:00Z" },
  ];

  it("بتحسم الاحتمالين لما تتقصر على أيام التحويل", () => {
    expect(matchPayout({ gross: 500, count: 2 }, list).ok).toBe(false);
    expect(matchPayout({ gross: 500, count: 2, date: "2026-09-10" }, list)).toEqual({
      ok: true,
      orderIds: ["a", "b"],
      how: "window",
    });
  });

  it("⚠️ اللي اتسلّم بعد التحويل بره النافذة", () => {
    const late = list.map((o) => (o.orderId === "b" ? { ...o, deliveredAt: "2026-09-20T10:00:00Z" } : o));
    expect(matchPayout({ gross: 500, count: 2, date: "2026-09-10" }, late).ok).toBe(false);
  });
});
