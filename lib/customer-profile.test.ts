import { describe, it, expect } from "vitest";
import {
  buildCustomerProfile,
  profileLine,
  MIN_ORDERS_FOR_CADENCE,
  type ProfileOrder,
} from "./customer-profile";

const NOW = new Date("2026-08-19T10:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);

const order = (o: Partial<ProfileOrder>): ProfileOrder => ({
  orderStatus: "delivered",
  orderDate: daysAgo(10),
  total: 1000,
  ...o,
});

describe("الملف الشخصي للعميل", () => {
  it("بيعدّ الأوردرات والفلوس", () => {
    const p = buildCustomerProfile(
      [order({ total: 1000 }), order({ total: 500 })],
      NOW
    );
    expect(p.orders).toBe(2);
    expect(p.spent).toBe(1500);
    expect(p.average).toBe(750);
  });

  it("⚠️ الملغي بره كل الأرقام", () => {
    const p = buildCustomerProfile(
      [order({}), order({ orderStatus: "cancelled", total: 9999 })],
      NOW
    );
    expect(p.orders).toBe(1);
    expect(p.cancelled).toBe(1);
    expect(p.spent).toBe(1000);
  });

  it("⚠️ الراجع مادفعش فلوس", () => {
    const p = buildCustomerProfile(
      [order({ total: 1000 }), order({ orderStatus: "returned", total: 800 })],
      NOW
    );
    expect(p.orders).toBe(2);
    expect(p.spent).toBe(1000);
    expect(p.returned).toBe(1);
  });

  it("⚠️ نسبة الرجوع على اللي خلص مشواره بس", () => {
    const p = buildCustomerProfile(
      [
        order({ orderStatus: "delivered" }),
        order({ orderStatus: "returned" }),
        // لسه في الطريق — مش نتيجة
        order({ orderStatus: "shipped" }),
        order({ orderStatus: "new" }),
      ],
      NOW
    );
    expect(p.settled).toBe(2);
    expect(p.returnRate).toBe(50);
  });

  it("مفيش أوردر خلص = مفيش نسبة، مش صفر", () => {
    const p = buildCustomerProfile([order({ orderStatus: "new" })], NOW);
    expect(p.returnRate).toBeNull();
  });

  it("بيحسب العادة من المسافة بين الأوردرات", () => {
    // ٤ أوردرات كل ١٠ أيام
    const p = buildCustomerProfile(
      [30, 20, 10, 0].map((d) => order({ orderDate: daysAgo(d) })),
      NOW
    );
    expect(p.everyDays).toBe(10);
    expect(p.daysSinceLast).toBe(0);
    expect(p.overdue).toBe(false);
  });

  it("⚠️ أوردرين مش عادة", () => {
    const p = buildCustomerProfile(
      Array.from({ length: MIN_ORDERS_FOR_CADENCE - 1 }, (_, i) =>
        order({ orderDate: daysAgo(i * 10) })
      ),
      NOW
    );
    expect(p.everyDays).toBeNull();
    // ومانقولش إنه مااتأخرش — إحنا مانعرفش أصلًا
    expect(p.overdue).toBe(false);
  });

  it("اللي فات معاده بيتقال", () => {
    // كان بيشتري كل ١٠ أيام وبقاله ٤٠ يوم
    const p = buildCustomerProfile(
      [60, 50, 40].map((d) => order({ orderDate: daysAgo(d) })),
      NOW
    );
    expect(p.everyDays).toBe(10);
    expect(p.daysSinceLast).toBe(40);
    expect(p.overdue).toBe(true);
  });

  it("بيطلّع المنتجات اللي بيشتريها مرتبة", () => {
    const p = buildCustomerProfile(
      [
        order({ items: [{ productName: "مقبض", quantity: 2 }] }),
        order({
          items: [
            { productName: "مقبض", quantity: 3 },
            { productName: "شمعدان", quantity: 1 },
          ],
        }),
      ],
      NOW
    );
    expect(p.favourites).toEqual([
      { name: "مقبض", quantity: 5 },
      { name: "شمعدان", quantity: 1 },
    ]);
  });

  it("منتجات الأوردر الملغي مش من ذوقه", () => {
    const p = buildCustomerProfile(
      [
        order({ orderStatus: "cancelled", items: [{ productName: "ملغي", quantity: 9 }] }),
        order({ items: [{ productName: "مقبض", quantity: 1 }] }),
      ],
      NOW
    );
    expect(p.favourites.map((f) => f.name)).toEqual(["مقبض"]);
  });

  it("التواريخ الغلط أو الناقصة مابتوقعش الحساب", () => {
    const p = buildCustomerProfile(
      [
        order({ orderDate: null }),
        order({ orderDate: "مش تاريخ" }),
      ],
      NOW
    );
    expect(p.firstOrder).toBeNull();
    expect(p.daysSinceLast).toBeNull();
    expect(p.everyDays).toBeNull();
  });

  it("عميل من غير أوردرات مابيوقعش ومفيش قسمة على صفر", () => {
    const p = buildCustomerProfile([], NOW);
    expect(p.orders).toBe(0);
    expect(p.average).toBe(0);
    expect(p.returnRate).toBeNull();
    expect(p.favourites).toEqual([]);
  });

  it("كل الأوردرات في يوم واحد = مفيش عادة", () => {
    const p = buildCustomerProfile(
      [order({ orderDate: daysAgo(5) }), order({ orderDate: daysAgo(5) }), order({ orderDate: daysAgo(5) })],
      NOW
    );
    expect(p.everyDays).toBeNull();
  });
});

describe("سطر الوصف", () => {
  it("بيجمع اللي يستاهل يتقال", () => {
    const p = buildCustomerProfile(
      [
        order({ orderDate: daysAgo(60) }),
        order({ orderDate: daysAgo(50) }),
        order({ orderDate: daysAgo(40), orderStatus: "returned" }),
      ],
      NOW
    );
    const line = profileLine(p)!;
    expect(line).toContain("اشترى 3 مرات");
    expect(line).toContain("رجّع 1");
    expect(line).toContain("بيشتري كل 10 يوم");
    expect(line).toContain("40 يوم مااشتراش");
  });

  it("العميل الجديد مالوش سطر", () => {
    const p = buildCustomerProfile([order({ orderStatus: "new" })], NOW);
    expect(profileLine(p)).toBeNull();
  });
});

describe("النسبة على أوردر واحد", () => {
  it("⚠️ مابتتكتبش نسبة على أوردر واحد خالص", () => {
    const p = buildCustomerProfile([order({ orderStatus: "returned" })], NOW);
    const line = profileLine(p)!;
    expect(line).toContain("أوردره الوحيد");
    expect(line).not.toContain("100%");
  });

  it("من أوردرين فوق النسبة بتبان", () => {
    const p = buildCustomerProfile(
      [order({ orderStatus: "returned" }), order({ orderStatus: "delivered" })],
      NOW
    );
    expect(profileLine(p)!).toContain("50%");
  });
});
