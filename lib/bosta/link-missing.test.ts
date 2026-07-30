import { describe, expect, it } from "vitest";
import { planShipmentLinks, type UnlinkedOrder } from "./link-missing";

const order = (
  orderNumber: string,
  customerName: string,
  id = `o-${orderNumber}`
): UnlinkedOrder => ({ id, orderNumber, customerName, status: "delivered" });

const delivery = (
  orderNumber: string,
  tracking: string,
  fullName: string,
  state = "Delivered"
) => ({
  trackingNumber: tracking,
  businessReference: `ref:${orderNumber}`,
  receiver: { fullName },
  state: { value: state },
});

describe("ربط الشحنات الضايعة", () => {
  it("رقم الأوردر والاسم متطابقين يبقى ربط", () => {
    const plan = planShipmentLinks(
      [order("1284", "أحمد خالد")],
      [delivery("1284", "77001", "أحمد خالد محمد")]
    );
    expect(plan.links).toEqual([
      {
        orderId: "o-1284",
        orderNumber: "1284",
        tracking: "77001",
        receiverName: "أحمد خالد محمد",
        state: "Delivered",
      },
    ]);
    expect(plan.notFound).toEqual([]);
  });

  it("بيتحمّل اختلاف الألف والتاء المربوطة", () => {
    const plan = planShipmentLinks(
      [order("1300", "اسماء ابراهيم")],
      [delivery("1300", "77002", "أسماء إبراهيم")]
    );
    expect(plan.links).toHaveLength(1);
  });

  it("**اسم مختلف تمامًا مايتربطش**", () => {
    // ده اللي بيمنع شحنة عميل تلزق على أوردر عميل تاني
    const plan = planShipmentLinks(
      [order("1305", "منى سعيد")],
      [delivery("1305", "77003", "خالد عبد الرحمن")]
    );
    expect(plan.links).toEqual([]);
    expect(plan.nameMismatch).toEqual([
      {
        orderNumber: "1305",
        tracking: "77003",
        ourName: "منى سعيد",
        bostaName: "خالد عبد الرحمن",
      },
    ]);
  });

  it("أكتر من شحنة على نفس الرقم: بنوقف مش بنخمّن", () => {
    const plan = planShipmentLinks(
      [order("1310", "سارة")],
      [delivery("1310", "77004", "سارة"), delivery("1310", "77005", "سارة")]
    );
    expect(plan.links).toEqual([]);
    expect(plan.ambiguous).toEqual([
      { orderNumber: "1310", trackings: ["77004", "77005"] },
    ]);
  });

  it("مفيش شحنة بالرقم ده", () => {
    const plan = planShipmentLinks(
      [order("1999", "حد")],
      [delivery("1284", "77001", "أحمد")]
    );
    expect(plan.links).toEqual([]);
    expect(plan.notFound).toEqual([{ orderId: "o-1999", orderNumber: "1999" }]);
  });

  it("رقم التتبع المربوط بأوردر تاني بيتشال من الاختيارات", () => {
    const plan = planShipmentLinks(
      [order("1284", "أحمد")],
      [delivery("1284", "77001", "أحمد")],
      new Set(["77001"])
    );
    expect(plan.links).toEqual([]);
    expect(plan.notFound).toHaveLength(1);
  });

  it("الشحنة من غير رقم تتبع بتتجاهل", () => {
    const plan = planShipmentLinks(
      [order("1284", "أحمد")],
      [{ businessReference: "ref:1284", receiver: { fullName: "أحمد" } }]
    );
    expect(plan.notFound).toHaveLength(1);
  });

  it("بيقرا رقم الأوردر من شوبيفاي لو موجود", () => {
    const plan = planShipmentLinks(
      [order("1350", "ياسمين")],
      [
        {
          trackingNumber: "77009",
          shopifyInfo: { orderNumber: "#1350" },
          receiver: { fullName: "ياسمين" },
          state: { value: "Delivered" },
        },
      ]
    );
    expect(plan.links).toHaveLength(1);
    expect(plan.links[0].tracking).toBe("77009");
  });

  it("بيشتغل على مجموعة كاملة ويفرزها", () => {
    const plan = planShipmentLinks(
      [
        order("1284", "أحمد خالد"),
        order("1305", "منى سعيد"),
        order("1310", "سارة"),
        order("1999", "حد"),
      ],
      [
        delivery("1284", "77001", "أحمد خالد"),
        delivery("1305", "77003", "خالد عبد الرحمن"),
        delivery("1310", "77004", "سارة"),
        delivery("1310", "77005", "سارة"),
      ]
    );
    expect(plan.links).toHaveLength(1);
    expect(plan.nameMismatch).toHaveLength(1);
    expect(plan.ambiguous).toHaveLength(1);
    expect(plan.notFound).toHaveLength(1);
  });
});
