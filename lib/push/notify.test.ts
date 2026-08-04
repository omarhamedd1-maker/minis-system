import { describe, expect, it } from "vitest";
import { plainText } from "./notify";
import { isApple, shapeFor } from "./send";

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

describe("شكل الإشعار حسب الجهاز", () => {
  const msg = { title: "أوردر 1374 لسه مش مؤكد", body: "أمينة فتحي\nالمبلغ: 649 جنيه" };
  const APPLE = "https://web.push.apple.com/QJcHhxQ0djrpph4m8jIF";
  const ANDROID = "https://fcm.googleapis.com/fcm/send/dSZsEE5DZw0";

  it("بيعرف الآيفون من عنوان الخدمة", () => {
    expect(isApple(APPLE)).toBe(true);
    expect(isApple(ANDROID)).toBe(false);
    expect(isApple("")).toBe(false);
  });

  it("**الآيفون: العنوان مسافة والكلام كله في الجسم**", () => {
    // عشان سطر `from MINIS` بتاع آبل يطلع فوق خالص بدل ما يتقحم في نص الكلام
    const out = shapeFor(APPLE, msg);
    expect(out.title).toBe(" ");
    expect(out.body).toBe("أوردر 1374 لسه مش مؤكد\nأمينة فتحي\nالمبلغ: 649 جنيه");
  });

  it("الأندرويد زي ما هو — المسافة كانت هتطلع سطر عريض فاضي", () => {
    expect(shapeFor(ANDROID, msg)).toEqual(msg);
  });

  it("الجسم الفاضي مابيسيبش سطر زيادة", () => {
    expect(shapeFor(APPLE, { title: "عنوان", body: "" }).body).toBe("عنوان");
  });
});
