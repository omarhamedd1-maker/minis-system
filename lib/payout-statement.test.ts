import { describe, expect, it } from "vitest";
import { parseAmount, parseDate, parseStatement, splitRow } from "./payout-statement";

describe("قراية الأرقام والتواريخ", () => {
  it("الفاصلة والعملة والأرقام العربية", () => {
    expect(parseAmount("1,234.56")).toBe(1234.56);
    expect(parseAmount("3,671.63 EGP")).toBe(3671.63);
    expect(parseAmount("٣,٦٧١٫٦٣")).toBe(3671.63);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("—")).toBeNull();
  });

  it("⚠️ التاريخ: يوم/شهر/سنة زي الكشف المصري", () => {
    expect(parseDate("06 Sep, 2026")).toBe("2026-09-06");
    expect(parseDate("2026-09-06")).toBe("2026-09-06");
    expect(parseDate("06/09/2026")).toBe("2026-09-06");
    expect(parseDate("كلام")).toBeNull();
  });

  it("الفصل بيحترم علامات الاقتباس", () => {
    expect(splitRow('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
    expect(splitRow("a\tb\tc")).toEqual(["a", "b", "c"]);
  });
});

describe("كشف المحفظة", () => {
  const csv = [
    "Bosta Wallet Statement",
    "",
    "Invoice Number,Date,COD,Fees,Net Amount,Orders",
    "SUNCOD06SEP26,06 Sep 2026,3779,107.37,3671.63,3",
    "TUECOD08SEP26,08 Sep 2026,66.80,2.00,64.80,1",
    "Total,,3845.80,109.37,3736.43,4",
  ].join("\n");

  it("بيقرا الصفوف ويتعرّف على الأعمدة بالاسم", () => {
    const s = parseStatement(csv);
    expect(s.rows).toHaveLength(2);
    expect(s.rows[0]).toMatchObject({
      invoiceNumber: "SUNCOD06SEP26",
      date: "2026-09-06",
      gross: 3779,
      fees: 107.37,
      net: 3671.63,
      orderCount: 3,
    });
    expect(s.columns.net).toBe("Net Amount");
  });

  it("⚠️ سطر المجموع مالوش رقم فاتورة — بيتشال بسببه مش بيتخمّن", () => {
    const s = parseStatement(csv);
    expect(s.problems.map((p) => p.reason)).toContain("مفيش رقم فاتورة");
  });

  it("الترتيب مش مهم — الأعمدة بالاسم", () => {
    const flipped = ["Fees,Net,Invoice,Date", "107.37,3671.63,SUNCOD06SEP26,2026-09-06"].join("\n");
    expect(parseStatement(flipped).rows[0]).toMatchObject({ fees: 107.37, net: 3671.63 });
  });

  it("العناوين بالعربي", () => {
    const ar = ["رقم الفاتورة,التاريخ,دورات التحصيل,رسوم بوسطة,مبلغ التحويل", "SUNCOD06SEP26,٠٦/٠٩/٢٠٢٦,٣٬٧٧٩,١٠٧٫٣٧,٣٬٦٧١٫٦٣"].join("\n");
    const s = parseStatement(ar);
    expect(s.rows[0]).toMatchObject({ net: 3671.63, date: "2026-09-06" });
  });

  it("مفيش عمود تحصيل؟ التحصيل = الصافي + الرسوم", () => {
    const s = parseStatement(["Invoice,Date,Fees,Net", "X1,2026-09-06,10,90"].join("\n"));
    expect(s.rows[0]).toMatchObject({ gross: 100, fees: 10, net: 90, orderCount: null });
  });

  it("⚠️ الفاتورة المتكررة في نفس الملف بتتشال", () => {
    const s = parseStatement(["Invoice,Date,Net", "X1,2026-09-06,90", "X1,2026-09-07,90"].join("\n"));
    expect(s.rows).toHaveLength(1);
    expect(s.problems.some((p) => p.reason.includes("متكرر"))).toBe(true);
  });

  it("ملف مش مفهوم = سبب واضح مش صفوف فاضية", () => {
    expect(parseStatement("كلام\nتاني").problems[0].reason).toContain("عناوين الأعمدة");
    expect(parseStatement("Date,Orders\n2026-09-06,3").problems[0].reason).toContain("رقم الفاتورة");
  });
});
