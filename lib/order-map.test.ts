import { describe, it, expect } from "vitest";
import { areaOf, orderMap, MIN_FOR_RATE, type MapOrder } from "./order-map";

const o = (address: string | null, status = "delivered", total = 1000): MapOrder => ({
  address,
  orderStatus: status,
  total,
});

describe("قراية المنطقة من العنوان", () => {
  it("بيقرا المنطقة من عنوان حقيقي", () => {
    expect(areaOf("ماونتن فيو ٤ - على الطريق الدائري- ١١٤/١  ٦ اكتوبر Giza 01007388046 Egypt"))
      .toBe("٦ أكتوبر والشيخ زايد");
    expect(areaOf("obour city- golf city compound villa 28 rawaby Obour Cairo  Egypt"))
      .toBe("مصر الجديدة ومدينة نصر");
    expect(areaOf("228 beverly hills compound, phase 2, Sheikh zayed"))
      .toBe("٦ أكتوبر والشيخ زايد");
  });

  it("⚠️⚠️ «New Cairo» مش «Cairo» — الأخص بيكسب", () => {
    expect(areaOf("Compound etoile de ville , villa 7 Villa 7 New Cairo Cairo 5555 Egypt"))
      .toBe("التجمع والقاهرة الجديدة");
  });

  it("العربي والإنجليزي بيوصّلوا لنفس المنطقة", () => {
    expect(areaOf("سموحة الاسكندرية")).toBe("الإسكندرية");
    expect(areaOf("Smouha Alexandria")).toBe("الإسكندرية");
  });

  it("الهمزات والتاء المربوطة مابتفرقش", () => {
    expect(areaOf("الجيزه")).toBe("الجيزة");
    expect(areaOf("الجيزة")).toBe("الجيزة");
    expect(areaOf("الاسكندريه")).toBe("الإسكندرية");
  });

  it("الأرقام العربي بتتقرا", () => {
    expect(areaOf("مدينة ٦ اكتوبر")).toBe("٦ أكتوبر والشيخ زايد");
    expect(areaOf("مدينة 6 اكتوبر")).toBe("٦ أكتوبر والشيخ زايد");
  });

  it("⚠️ العنوان اللي مافيهوش منطقة بيرجّع مش معروف — مش القاهرة", () => {
    expect(areaOf("شارع ٩ عمارة ٣")).toBeNull();
    expect(areaOf("")).toBeNull();
    expect(areaOf(null)).toBeNull();
  });
});

describe("خريطة الأوردرات", () => {
  it("بتجمع كل منطقة", () => {
    const m = orderMap([
      o("New Cairo"),
      o("New Cairo"),
      o("Alexandria"),
    ]);
    expect(m.rows.map((r) => [r.area, r.orders])).toEqual([
      ["التجمع والقاهرة الجديدة", 2],
      ["الإسكندرية", 1],
    ]);
    expect(m.top?.area).toBe("التجمع والقاهرة الجديدة");
  });

  it("⚠️ اللي مالوش منطقة بيتعدّ لوحده مش بيتوزّع", () => {
    const m = orderMap([o("New Cairo"), o("شارع ٩"), o(null)]);
    expect(m.unknown).toBe(2);
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0].orders).toBe(1);
  });

  it("⚠️ نسبة الرجوع مابتتعرضش على أرقام قليلة", () => {
    const m = orderMap([o("Maadi"), o("Maadi", "returned")]);
    expect(m.rows[0].returnRate).toBeNull();
    expect(m.worst).toBeNull();
  });

  it("النسبة بتظهر لما الأرقام تكفي", () => {
    const rows = [
      ...Array.from({ length: MIN_FOR_RATE }, () => o("Maadi")),
      ...Array.from({ length: MIN_FOR_RATE }, () => o("Maadi", "returned")),
    ];
    const m = orderMap(rows);
    expect(m.rows[0].returnRate).toBe(50);
    expect(m.worst?.area).toBe("المعادي");
  });

  it("⚠️ النسبة من اللي خلص مش من كل الأوردرات", () => {
    const rows = [
      ...Array.from({ length: 8 }, () => o("Maadi")),
      ...Array.from({ length: 2 }, () => o("Maadi", "returned")),
      // دول لسه في السكة — مايدخلوش المقام
      ...Array.from({ length: 10 }, () => o("Maadi", "shipped")),
    ];
    const m = orderMap(rows);
    expect(m.rows[0].settled).toBe(10);
    expect(m.rows[0].returnRate).toBe(20);
  });

  it("فلوس اللي وصل بس", () => {
    const m = orderMap([
      o("Maadi", "delivered", 1000),
      o("Maadi", "returned", 5000),
      o("Maadi", "shipped", 3000),
    ]);
    expect(m.rows[0].delivered).toBe(1000);
  });

  it("الأرقام السالبة مابتزوّدش الفلوس", () => {
    expect(orderMap([o("Maadi", "delivered", -500)]).rows[0].delivered).toBe(0);
  });

  it("⚠️ المنطقة اللي مابترجّعش مش «أوحش منطقة»", () => {
    const rows = Array.from({ length: MIN_FOR_RATE }, () => o("Maadi"));
    expect(orderMap(rows).worst).toBeNull();
  });

  it("مافيش أوردرات = خريطة فاضية من غير قسمة على صفر", () => {
    const m = orderMap([]);
    expect(m).toMatchObject({ rows: [], unknown: 0, top: null, worst: null });
  });
});
