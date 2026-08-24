import { describe, expect, it } from "vitest";
import {
  failedDeliveryMessage,
  shopifyImportFailMessage,
  syncDownMessage,
} from "./alert-messages";
import { codMismatchMessage } from "./bosta/cod-check";
import { stalePickupMessage } from "./bosta/stale-shipment";
import { refundReminderMessage } from "./refund";
import { unconfirmedGroupMessage, unconfirmedMessage } from "./unconfirmed";

/** كل الإشعارات اللي ليها عميل — الشكل لازم يبقى واحد فيهم كلهم */
const withCustomer = [
  [
    "العميل مستلمش",
    failedDeliveryMessage({
      orderNumber: "1374",
      customerName: "أمينة فتحي",
      customerPhone: "01005361491",
      reason: null,
      arrived: false,
    }),
  ],
  [
    "رجع ومتسلمش",
    failedDeliveryMessage({
      orderNumber: "1374",
      customerName: "أمينة فتحي",
      customerPhone: null,
      reason: null,
      arrived: true,
    }),
  ],
  [
    "التحصيل مختلف",
    codMismatchMessage({
      orderNumber: "1374",
      customerName: "أمينة فتحي",
      ours: 649,
      bosta: 1298,
      fixable: true,
    }),
  ],
  [
    "شحنة واقفة",
    stalePickupMessage({
      orderNumber: "1374",
      customerName: "أمينة فتحي",
      days: 5,
      milestone: 3,
    }),
  ],
  [
    "فلوس مرتجع",
    refundReminderMessage({
      orderNumber: "1374",
      customerName: "أمينة فتحي",
      customerPhone: "01005361491",
      amount: 649,
      days: 3,
    }),
  ],
  [
    "لسه مش مؤكد",
    unconfirmedMessage({
      orderNumber: "1374",
      customerName: "أمينة فتحي",
      customerPhone: "01005361491",
      total: 649,
      days: 2,
    }),
  ],
] as const;

/**
 * **الآيفون بيعرض ٤ سطور بس على شاشة القفل.** أي إشعار أطول من كده بيتقص،
 * والسطر اللي بيتقص هو الأخير — يعني اللي بيقول "اعمل إيه". فالاختبار ده
 * بيمنع أي إشعار جديد أو تعديل إنه يرجّع المشكلة.
 */
describe("مفيش إشعار بيتقص", () => {
  it.each(withCustomer)("«%s»: ٤ سطور بالكتير", (_name, msg) => {
    const lines = msg.split("\n").filter((l) => l.trim());
    expect(lines.length).toBeLessThanOrEqual(4);
  });

  it("الإشعارات اللي مالهاش عميل كمان", () => {
    const group = unconfirmedGroupMessage({ count: 7, oldestDays: 3 });
    expect(group.split("\n").filter((l) => l.trim()).length).toBeLessThanOrEqual(4);

    const sync = syncDownMessage("آخر تشغيل ناجح من ساعتين");
    expect(sync.split("\n").filter((l) => l.trim()).length).toBeLessThanOrEqual(4);
  });

  it.each(withCustomer)("«%s»: مفيش سطر بيبدأ برقم", (_name, msg) => {
    // كل السطور بتتبعت بعلامة "ابدأ من الشمال"، والسطر اللي بيبدأ برقم
    // بيتلخبط ترتيبه والرقم بيقفز لآخر السطر:
    // «٦٤٩ جنيه · نزل من ٢ يوم» كانت بتطلع «جنيه · نزل من ٢ يوم ٦٤٩»
    for (const line of msg.replace(/<[^>]+>/g, "").split("\n")) {
      if (line.trim()) expect(line.trim()).not.toMatch(/^\d/);
    }
  });

  it("**وحتى بأطول بيانات ممكنة**", () => {
    // كل الخانات مليانة وأطول سبب بوسطة بتكتبه
    const msg = failedDeliveryMessage({
      orderNumber: "1374",
      customerName: "عبد الرحمن محمد السيد",
      customerPhone: "01005361491",
      reason: "العميل رفض يستلم (٣ أغسطس) — 3 محاولات — اتجدولت ٧ أغسطس",
      arrived: false,
      waiting: true,
    });
    expect(msg.split("\n").filter((l) => l.trim()).length).toBeLessThanOrEqual(4);
  });
});

describe("شكل الإشعارات", () => {
  it.each(withCustomer)("«%s»: رقم الأوردر فوق واسم العميل تحته", (_name, msg) => {
    const lines = msg.split("\n");
    expect(lines[0]).toContain("1374");
    // الاسم أول حاجة في السطر التاني — والتليفون معاه لو موجود، عشان
    // الآيفون بيعرض ٤ سطور بس
    expect(lines[1].startsWith("أمينة فتحي")).toBe(true);
  });

  it("**الإشعار مايزيدش عن ٤ سطور** — ده كل اللي الآيفون بيعرضه", () => {
    const msg = failedDeliveryMessage({
      orderNumber: "1374",
      customerName: "أمينة فتحي",
      customerPhone: "01005361491",
      reason: "العميل رفض يستلم (٣ أغسطس) — 2 محاولات — اتجدولت ٥ أغسطس",
      arrived: false,
    });
    const lines = msg.split("\n").filter((l) => l.trim());
    expect(lines).toHaveLength(3);
    // والتواريخ اتشالت من السبب عشان مايلفّش لسطرين
    expect(msg).toContain("العميل رفض يستلم");
    expect(msg).not.toContain("اتجدولت");
    // **مفيش سطر بيقول اعمل إيه** — اتشال بطلب عمر
    expect(msg).not.toContain("كلّمه");
  });

  it.each(withCustomer)("«%s»: مفيش رقم شحنة", (_name, msg) => {
    // التليفون مطلوب، رقم الشحنة لأ — فبندوّر على سطر الشحنة نفسه
    expect(msg).not.toMatch(/شحنة:/);
    expect(msg).not.toContain("<code>");
  });

  it("الأوردر من غير اسم بيسيب السطر فاضي مش undefined", () => {
    const msg = failedDeliveryMessage({
      orderNumber: "1374",
      customerName: null,
      customerPhone: null,
      reason: null,
      arrived: false,
    });
    expect(msg.split("\n")[1]).toBe("");
    expect(msg).not.toContain("undefined");
    expect(msg).not.toContain("null");
  });

  it("«مستنية قرار» بتتكلم على حسب السبب الحقيقي", () => {
    const address = failedDeliveryMessage({
      orderNumber: "1374",
      customerName: "أمينة فتحي",
      customerPhone: null,
      reason: "العنوان غلط",
      arrived: false,
      waiting: true,
    });
    expect(address).toContain("العنوان غلط");
    expect(address).not.toContain("صحّح العنوان");

    // نفس الحالة بسبب تاني = كلام تاني خالص
    const noAnswer = failedDeliveryMessage({
      orderNumber: "1374",
      customerName: "أمينة فتحي",
      customerPhone: null,
      reason: "العميل مش بيرد",
      arrived: false,
      waiting: true,
    });
    expect(noAnswer).toContain("العميل مش بيرد");
    expect(noAnswer).not.toContain("صحّح العنوان");
    // الرسالتين مختلفتين بالسبب لوحده من غير أي نصيحة
    expect(noAnswer).not.toBe(address);
  });

  it("المزامنة الواقفة مالهاش عميل — وبتفضل زي ما هي", () => {
    const msg = syncDownMessage("آخر تشغيل ناجح من ساعتين");
    expect(msg.split("\n")[0]).toContain("المزامنة");
    expect(msg).toContain("آخر تشغيل ناجح من ساعتين");
  });
});

describe("رسالة استيراد شوبيفاي الواقف", () => {
  it("السبب بيتكتب زي ما هو — هو اللي بيفهم صاحب المتجر إن التوكن باظ", () => {
    const msg = shopifyImportFailMessage(
      "[API] Invalid API key or access token (unrecognized login or wrong password)"
    );
    expect(msg).toContain(
      "[API] Invalid API key or access token (unrecognized login or wrong password)"
    );
  });

  it("أول سطر هو عنوان الإشعار — والآخر بيقول اعمل إيه", () => {
    const msg = shopifyImportFailMessage("اتقطع النت");
    const lines = msg.split("\n");
    expect(lines[0]).toContain("استيراد أوردرات شوبيفاي وقف");
    expect(lines[lines.length - 1]).toContain("اربط المتجر تاني");
  });
});
