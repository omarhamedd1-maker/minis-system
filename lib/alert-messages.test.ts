import { describe, expect, it } from "vitest";
import { failedDeliveryMessage, syncDownMessage } from "./alert-messages";
import { codMismatchMessage } from "./bosta/cod-check";
import { stalePickupMessage } from "./bosta/stale-shipment";
import { refundReminderMessage } from "./refund";
import { unconfirmedMessage } from "./unconfirmed";

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

describe("شكل الإشعارات", () => {
  it.each(withCustomer)("«%s»: رقم الأوردر فوق واسم العميل تحته", (_name, msg) => {
    const lines = msg.split("\n");
    expect(lines[0]).toContain("1374");
    expect(lines[1]).toBe("أمينة فتحي");
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
    expect(address).toContain("صحّح عنوان العميل");

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
    expect(noAnswer).not.toContain("صحّح عنوان العميل");
  });

  it("المزامنة الواقفة مالهاش عميل — وبتفضل زي ما هي", () => {
    const msg = syncDownMessage("آخر تشغيل ناجح من ساعتين");
    expect(msg.split("\n")[0]).toContain("المزامنة");
    expect(msg).toContain("آخر تشغيل ناجح من ساعتين");
  });
});
