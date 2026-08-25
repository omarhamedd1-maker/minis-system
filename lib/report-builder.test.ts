import { describe, it, expect } from "vitest";
import {
  buildReport,
  weakRows,
  MEASURES,
  GROUPS,
  UNIT_OF,
  MIN_FOR_RATE,
  type ReportOrder,
  type ReportSpec,
} from "./report-builder";

const o = (x: Partial<ReportOrder> = {}): ReportOrder => ({
  orderStatus: "delivered",
  orderDate: "2026-08-20T09:00:00Z",
  total: 1000,
  profit: 400,
  area: "المعادي",
  customerName: "محمد",
  products: ["تيشيرت"],
  ...x,
});

const spec = (x: Partial<ReportSpec> = {}): ReportSpec => ({
  measure: "sales",
  group: "month",
  from: null,
  to: null,
  ...x,
});

describe("بناء التقرير", () => {
  it("المبيعات بالشهر", () => {
    const r = buildReport(
      [o(), o({ orderDate: "2026-07-15T09:00:00Z", total: 500 })],
      spec()
    );
    expect(r.rows).toEqual([
      { label: "2026-08", value: 1000, count: 1 },
      { label: "2026-07", value: 500, count: 1 },
    ]);
    expect(r.total).toBe(1500);
    expect(r.unit).toBe("money");
  });

  it("عدد الأوردرات", () => {
    const r = buildReport([o(), o(), o()], spec({ measure: "orders" }));
    expect(r.rows[0]).toMatchObject({ value: 3, count: 3 });
    expect(r.unit).toBe("count");
  });

  it("الربح بيتجمع", () => {
    const r = buildReport([o(), o()], spec({ measure: "profit" }));
    expect(r.rows[0].value).toBe(800);
  });

  it("الأكبر الأول", () => {
    const r = buildReport(
      [
        o({ area: "صغير", total: 100 }),
        o({ area: "كبير", total: 900 }),
      ],
      spec({ group: "area" })
    );
    expect(r.rows.map((x) => x.label)).toEqual(["كبير", "صغير"]);
  });

  it("⚠️ الملغي مش بيعة", () => {
    const r = buildReport([o(), o({ orderStatus: "cancelled" })], spec());
    expect(r.rows[0].count).toBe(1);
    expect(r.used).toBe(1);
  });

  it("⚠️ الملغي بيبان لما التقسيم بالحالة نفسها", () => {
    const r = buildReport(
      [o(), o({ orderStatus: "cancelled" })],
      spec({ measure: "orders", group: "status" })
    );
    expect(r.rows.map((x) => x.label).sort()).toEqual(["اتسلّم", "ملغي"]);
  });
});

describe("⚠️⚠️ نسبة الرجوع", () => {
  const settled = (n: number, status = "delivered") =>
    Array.from({ length: n }, () => o({ orderStatus: status, area: "المعادي" }));

  it("بتتحسب من اللي خلص", () => {
    const r = buildReport(
      [...settled(8), ...settled(2, "returned")],
      spec({ measure: "return_rate", group: "area" })
    );
    expect(r.rows[0].value).toBe(20);
    expect(r.unit).toBe("percent");
  });

  it("⚠️⚠️ اللي لسه في السكة مايدخلش المقام — والسبب بيتقال", () => {
    const r = buildReport(
      [...settled(8), ...settled(2, "returned"), ...settled(10, "shipped")],
      spec({ measure: "return_rate", group: "area" })
    );
    // ٢٠٪ مش ١٠٪
    expect(r.rows[0].value).toBe(20);
    expect(r.skipped).toContain("10 أوردر");
  });

  it("⚠️ مجموع النِسب مالوش معنى — بيرجع فاضي", () => {
    const r = buildReport(settled(5), spec({ measure: "return_rate" }));
    expect(r.total).toBeNull();
  });

  it("⚠️ الصف اللي وراه أوردر واحد بيتعلّم عليه", () => {
    const r = buildReport(
      [o({ area: "قليل", orderStatus: "returned" }), ...settled(6)],
      spec({ measure: "return_rate", group: "area" })
    );
    expect(weakRows(r)).toBe(1);
  });

  it("مافيش أوردرات خلصت = صفر مش قسمة على صفر", () => {
    const r = buildReport(
      [o({ orderStatus: "shipped" })],
      spec({ measure: "return_rate", group: "area" })
    );
    expect(r.rows).toEqual([]);
    expect(r.used).toBe(0);
  });
});

describe("التقسيمات", () => {
  it("يوم الأسبوع بالتوقيت المصري", () => {
    // ٢٠ أغسطس ٢٠٢٦ خميس
    const r = buildReport([o()], spec({ measure: "orders", group: "weekday" }));
    expect(r.rows[0].label).toBe("الخميس");
  });

  it("⚠️ الأوردر ١١ بالليل بتوقيت مصر لسه في يومه", () => {
    // ٢٠:٠٠ عالمي = ٢٣:٠٠ مصر يوم ٢٠
    const r = buildReport(
      [o({ orderDate: "2026-08-20T20:00:00Z" })],
      spec({ measure: "orders", group: "month" })
    );
    expect(r.rows[0].label).toBe("2026-08");
  });

  it("⚠️ اللي معرفناش منطقته بيتجمع لوحده", () => {
    const r = buildReport(
      [o({ area: null }), o({ area: "المعادي" })],
      spec({ measure: "orders", group: "area" })
    );
    expect(r.rows.map((x) => x.label).sort()).toEqual(["المعادي", "مش معروف"]);
  });

  it("⚠️⚠️ الأوردر بمنتجين بيتعدّ في الصفين", () => {
    const r = buildReport(
      [o({ products: ["تيشيرت", "بنطلون"], total: 1000 })],
      spec({ group: "product" })
    );
    expect(r.rows).toHaveLength(2);
    // المجموع أكبر من الإجمالي الحقيقي — مقصود للسؤال «المنتج باع كام»
    expect(r.total).toBe(2000);
  });

  it("الأوردر من غير منتجات ليه صف", () => {
    const r = buildReport([o({ products: [] })], spec({ group: "product" }));
    expect(r.rows[0].label).toBe("بدون منتج");
  });
});

describe("الفترة", () => {
  it("بتفلتر بالتاريخين", () => {
    const rows = [
      o({ orderDate: "2026-06-01T09:00:00Z" }),
      o({ orderDate: "2026-07-01T09:00:00Z" }),
      o({ orderDate: "2026-08-01T09:00:00Z" }),
    ];
    const r = buildReport(
      rows,
      spec({ measure: "orders", from: "2026-07-01", to: "2026-07-31" })
    );
    expect(r.used).toBe(1);
  });

  it("الفترة الفاضية = كله", () => {
    expect(buildReport([o(), o()], spec({ measure: "orders" })).used).toBe(2);
  });

  it("⚠️ الأوردر من غير تاريخ بيتشال لما فيه فترة", () => {
    const r = buildReport(
      [o({ orderDate: null })],
      spec({ measure: "orders", from: "2026-01-01" })
    );
    expect(r.used).toBe(0);
  });
});

describe("متوسط الأوردر", () => {
  it("بيتحسب مش بيتجمع", () => {
    const r = buildReport(
      [o({ total: 1000 }), o({ total: 500 })],
      spec({ measure: "avg_order" })
    );
    expect(r.rows[0].value).toBe(750);
  });

  it("⚠️ مجموع المتوسطات مالوش معنى", () => {
    const r = buildReport([o()], spec({ measure: "avg_order" }));
    expect(r.total).toBeNull();
  });
});

describe("سلامة عامة", () => {
  it("مافيش أوردرات = تقرير فاضي من غير ما يوقّع", () => {
    const r = buildReport([], spec());
    expect(r.rows).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.used).toBe(0);
  });

  it("التواريخ الغلط مابتوقّعش", () => {
    expect(() =>
      buildReport([o({ orderDate: "مش تاريخ" })], spec())
    ).not.toThrow();
  });

  it("الأرقام السالبة في المبيعات مابتنقّصش", () => {
    const r = buildReport([o({ total: -500 })], spec());
    expect(r.rows[0].value).toBe(0);
  });

  it("كل مقياس ليه وحدة", () => {
    for (const m of Object.keys(MEASURES)) {
      expect(UNIT_OF[m as keyof typeof MEASURES]).toBeDefined();
    }
  });

  it("كل تقسيم بيشتغل من غير ما يوقّع", () => {
    for (const g of Object.keys(GROUPS)) {
      expect(() =>
        buildReport([o()], spec({ group: g as keyof typeof GROUPS }))
      ).not.toThrow();
    }
  });

  it("الحد الأدنى للنِسب معقول", () => {
    expect(MIN_FOR_RATE).toBeGreaterThan(1);
  });
});

describe("⚠️⚠️ الصف الضعيف بينزل تحت", () => {
  const many = (n: number, area: string, status = "delivered") =>
    Array.from({ length: n }, () => o({ area, orderStatus: status }));

  it("«١٠٠٪ على أوردر واحد» مايطلعش فوق النسبة الحقيقية", () => {
    const r = buildReport(
      [
        // منطقة قوية: ١٠ خلصوا، ٣ رجعوا = ٣٠٪
        ...many(7, "قوية"),
        ...many(3, "قوية", "returned"),
        // منطقة ضعيفة: أوردر واحد رجع = ١٠٠٪
        ...many(1, "ضعيفة", "returned"),
      ],
      spec({ measure: "return_rate", group: "area" })
    );
    expect(r.rows[0].label).toBe("قوية");
    expect(r.rows.at(-1)!.label).toBe("ضعيفة");
    expect(r.rows.at(-1)!.value).toBe(100);
  });

  it("والمتوسطات زيها", () => {
    const r = buildReport(
      [
        ...Array.from({ length: 6 }, () => o({ area: "قوية", total: 1000 })),
        o({ area: "ضعيفة", total: 9000 }),
      ],
      spec({ measure: "avg_order", group: "area" })
    );
    expect(r.rows[0].label).toBe("قوية");
  });

  it("⚠️ الأعداد والفلوس بتفضل بالقيمة — مافيش ضعيف فيها", () => {
    const r = buildReport(
      [o({ area: "واحد", total: 9000 }), ...many(6, "كتير")],
      spec({ measure: "sales", group: "area" })
    );
    expect(r.rows[0].label).toBe("واحد");
  });
});
