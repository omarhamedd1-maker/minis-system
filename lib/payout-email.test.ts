import { describe, expect, it } from "vitest";
import { dateFromInvoice, emailText, parsePayoutEmail } from "./payout-email";

const html = `
<html><body>
<table>
  <tr><td>رقم الفاتورة</td><td>SUNCOD06SEP26</td></tr>
  <tr><td>التاريخ</td><td>06 Sep, 2026</td></tr>
  <tr><td>مبلغ التحويل</td><td>3,671.63 EGP</td></tr>
  <tr><td>دورات التحصيل</td><td>3,779 لـ3 أوردرات</td></tr>
  <tr><td>رسوم بوسطة</td><td>107.37</td></tr>
</table>
</body></html>`;

describe("قراية إيميل التحويل", () => {
  it("بيقرا الخمسة من HTML", () => {
    const r = parsePayoutEmail(html);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payout).toEqual({
        invoiceNumber: "SUNCOD06SEP26",
        date: "2026-09-06",
        gross: 3779,
        fees: 107.37,
        net: 3671.63,
        orderCount: 3,
      });
    }
  });

  it("والإنجليزي كمان", () => {
    const en = `Cashout Receipt
Invoice SUNCOD06SEP26
Date 06 Sep, 2026
Cashout Amount 3,671.63
COD Collected 3,779 for 3 orders
Bosta Fees 107.37`;
    const r = parsePayoutEmail(en);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payout).toMatchObject({ net: 3671.63, orderCount: 3, gross: 3779 });
  });

  it("الاسم في سطر والقيمة في اللي بعده", () => {
    const r = parsePayoutEmail("SUNCOD06SEP26\nمبلغ التحويل\n3,671.63\nالتاريخ\n2026-09-06");
    expect(r.ok && r.payout.net).toBe(3671.63);
  });

  it("⚠️ مفيش رسوم ولا تحصيل؟ التحصيل = الصافي", () => {
    const r = parsePayoutEmail("TUECOD08SEP26 مبلغ التحويل 64.80 التاريخ 08 Sep, 2026");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payout).toMatchObject({ net: 64.8, gross: 64.8, fees: 0, orderCount: null });
  });

  it("⚠️ التاريخ من رقم الفاتورة لو السطر مش موجود", () => {
    const r = parsePayoutEmail("SUNCOD06SEP26 مبلغ التحويل 3,671.63");
    expect(r.ok && r.payout.date).toBe("2026-09-06");
    expect(dateFromInvoice("THUCOD10SEP26")).toBe("2026-09-10");
    expect(dateFromInvoice("كلام")).toBeNull();
  });

  it("⚠️ اللي مايتقراش بيرجع سببه — مش أصفار", () => {
    expect(parsePayoutEmail("")).toMatchObject({ ok: false });
    expect(parsePayoutEmail("إيميل عادي من حد تاني")).toMatchObject({
      ok: false,
      reason: expect.stringContaining("رقم الفاتورة"),
    });
    expect(parsePayoutEmail("SUNCOD06SEP26 بس من غير أرقام")).toMatchObject({
      ok: false,
      reason: expect.stringContaining("مبلغ التحويل"),
    });
  });

  it("النص بيتشال من الـHTML من غير ما الأرقام تلزق", () => {
    expect(emailText("<p>مبلغ</p><p>100</p>")).toBe("مبلغ\n100");
  });
});
