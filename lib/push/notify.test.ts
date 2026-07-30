import { describe, expect, it } from "vitest";
import { plainText } from "./notify";

describe("تحويل رسالة تليجرام لإشعار", () => {
  it("بيشيل الوسوم — الإشعار مابيعرضش HTML", () => {
    expect(plainText("⚠️ <b>العميل مستلمش</b>")).toBe("⚠️ العميل مستلمش");
    expect(plainText("شحنة: <code>102657691</code>")).toBe(
      "شحنة: 102657691"
    );
  });

  it("بيلمّ السطور الفاضية الزيادة", () => {
    expect(plainText("سطر\n\n\n\nسطر تاني")).toBe("سطر\n\nسطر تاني");
  });

  it("بيشيل المسافات من الأطراف", () => {
    expect(plainText("  \n نص \n  ")).toBe("نص");
  });

  it("النص العادي مابيتغيّرش", () => {
    expect(plainText("أوردر 1374 قاعد 5 يوم")).toBe("أوردر 1374 قاعد 5 يوم");
  });
});
