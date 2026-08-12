// ==========================================================================
// حارس: الأوردر مايتضافش مرتين
// --------------------------------------------------------------------------
// بقى فيه **طريقين** لاستقبال الأوردر من شوبيفاي:
//
//   ١. دالة `shopify-order` في سوبابيز (ويب هوك)
//   ٢. `runOrderImport` في المهمة الدورية كل ربع ساعة
//
// التاني اتزاد في ١٢ أغسطس عشان أي بيزنس جديد يشتغل — الدوال مربوطة بمتجر
// واحد (`SHOPIFY_SHOP` متغيّر بيئة واحد). والاتنين شغّالين مع بعض دلوقتي.
//
// **يعني منع التكرار بقى الحاجة الوحيدة اللي واقفة بينّا وبين أوردر
// مزدوج** — ولو اتكسر، الأوردر يتعد مرتين والمبيعات والمخزون يغلطوا.
//
// اتأكد على الداتا الحقيقية يوم ما اتزاد: ٣١١ أوردر في مينيز، صفر رقم
// مكرر وصفر معرّف شوبيفاي مكرر.
// ==========================================================================

import { describe, expect, it } from "vitest";
import {
  planOrderImport,
  type OurOrderKey,
  type ShopifyOrderIn,
} from "./order-import-plan.ts";

const KNOWN = new Set(["v1"]);

function order(over: Partial<ShopifyOrderIn> = {}): ShopifyOrderIn {
  return {
    shopifyOrderId: "9001",
    orderNumber: "1001",
    createdAt: "2026-08-12",
    cancelled: false,
    fulfilled: false,
    discount: 0,
    shipping: 90,
    customer: {
      shopifyCustomerId: "c1",
      fullName: "أمينة فتحي",
      phone: "01012345678",
      address: "المعادي",
    },
    lines: [
      { shopifyVariantId: "v1", title: "أباجورة", quantity: 1, unitPrice: 500 },
    ],
    ...over,
  };
}

describe("الأوردر مايتضافش مرتين", () => {
  it("**الموجود بمعرّف شوبيفاي مايتضافش تاني**", () => {
    const ours: OurOrderKey[] = [{ shopifyOrderId: "9001", orderNumber: "1001" }];
    const plan = planOrderImport([order()], ours, [], KNOWN);
    expect(plan.toImport).toHaveLength(0);
    expect(plan.alreadyHere).toBe(1);
  });

  it("**والموجود برقمنا إحنا كمان** — المستورد رقمه عندنا مش رقم شوبيفاي", () => {
    const ours: OurOrderKey[] = [
      { shopifyOrderId: "import-1001", orderNumber: "1001" },
    ];
    const plan = planOrderImport([order()], ours, [], KNOWN);
    expect(plan.toImport).toHaveLength(0);
  });

  it("الجديد بيتضاف", () => {
    const plan = planOrderImport([order({ orderNumber: "2002", shopifyOrderId: "9002" })], [], [], KNOWN);
    expect(plan.toImport).toHaveLength(1);
  });

  it("**اللفة اللي بعدها ماتضيفش تاني** — دي اللي بتحصل كل ربع ساعة", () => {
    const incoming = [order({ orderNumber: "3003", shopifyOrderId: "9003" })];

    const first = planOrderImport(incoming, [], [], KNOWN);
    expect(first.toImport).toHaveLength(1);

    // نفس الأوردرات واللفة التانية والأوردر بقى عندنا
    const second = planOrderImport(
      incoming,
      [{ shopifyOrderId: "9003", orderNumber: "3003" }],
      [],
      KNOWN
    );
    expect(second.toImport).toHaveLength(0);
    expect(second.alreadyHere).toBe(1);
  });
});
