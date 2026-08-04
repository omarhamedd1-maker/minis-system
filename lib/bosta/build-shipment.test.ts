import { describe, expect, it } from "vitest";
import {
  buildAddressLine,
  buildExchangeShipment,
  buildShipment,
  computeCod,
  type ShipmentCustomer,
  type ShipmentInput,
} from "./build-shipment";

const cairo = { _id: "cairo1", nameAr: "القاهرة", name: "Cairo" };

const customer: ShipmentCustomer = {
  full_name: "محمد السعودي",
  phone: "01001234567",
  address: "التجمع الخامس، القاهرة",
  city: "القاهرة",
  zone: null,
  street: null,
  building: null,
  floor: null,
  apartment: null,
  landmark: null,
};

const input = (over: Partial<ShipmentInput> = {}): ShipmentInput => ({
  orderNumber: "1371",
  discount: 0,
  shippingPrice: 90,
  items: [{ quantity: 2, salePrice: 500, productName: "مرايه" }],
  customer,
  city: cairo,
  zone: null,
  ...over,
});

const built = (over: Partial<ShipmentInput> = {}) => {
  const r = buildShipment(input(over));
  if (!r.ok) throw new Error("المفروض تنجح: " + r.error);
  return r.shipment;
};

describe("حسبة التحصيل", () => {
  it("بضاعة − خصم + شحن", () => {
    expect(
      computeCod({
        items: [{ quantity: 2, salePrice: 500, productName: null }],
        discount: 100,
        shippingPrice: 90,
      })
    ).toBe(990);
  });

  it("مابينزلش تحت الصفر", () => {
    expect(
      computeCod({
        items: [{ quantity: 1, salePrice: 100, productName: null }],
        discount: 500,
        shippingPrice: 0,
      })
    ).toBe(0);
  });

  it("بيستحمل الخصم والشحن الفاضيين", () => {
    expect(
      computeCod({
        items: [{ quantity: 3, salePrice: 200, productName: null }],
        discount: null,
        shippingPrice: null,
      })
    ).toBe(600);
  });

  it("اللي اتدفع مقدم بيتخصم", () => {
    expect(
      computeCod({
        items: [{ quantity: 1, salePrice: 1000, productName: null }],
        discount: 0,
        shippingPrice: 90,
        amountPaid: 500,
      })
    ).toBe(590);
  });

  it("**المدفوع بالكامل بيروح بتحصيل صفر** — حالة أوردر ١٣٣٦", () => {
    // اتدفع ١١٬٩٧٨ إنستا باي وراح لبوسطة بتحصيل ١١٬٩٧٨، فبوسطة حسبت
    // عمولة تحصيل ورسم تحويل على فلوس مالهاش لازمة تتحصّل أصلاً
    expect(
      computeCod({
        items: [{ quantity: 1, salePrice: 11888, productName: null }],
        discount: 0,
        shippingPrice: 90,
        amountPaid: 11978,
      })
    ).toBe(0);
  });

  it("دفع أكتر من المطلوب برضه صفر مش بالسالب", () => {
    expect(
      computeCod({
        items: [{ quantity: 1, salePrice: 100, productName: null }],
        discount: 0,
        shippingPrice: 0,
        amountPaid: 500,
      })
    ).toBe(0);
  });

  it("مافيش مدفوع = زي ما كانت بالظبط", () => {
    const base = {
      items: [{ quantity: 2, salePrice: 500, productName: null }],
      discount: 100,
      shippingPrice: 90,
    };
    expect(computeCod(base)).toBe(990);
    expect(computeCod({ ...base, amountPaid: null })).toBe(990);
    expect(computeCod({ ...base, amountPaid: 0 })).toBe(990);
  });
});

describe("سطر العنوان", () => {
  it("بيفضّل العنوان المقسّم على النص الحر", () => {
    const line = buildAddressLine({
      ...customer,
      street: "شارع التسعين",
      building: "12",
      floor: "3",
      apartment: "5",
      landmark: "جنب المدرسة",
    });
    expect(line).toBe(
      "شارع التسعين — عمارة 12 — الدور 3 — شقة 5 — علامة: جنب المدرسة"
    );
  });

  it("بيرجع للنص الحر لو مفيش تقسيم", () => {
    expect(buildAddressLine(customer)).toBe("التجمع الخامس، القاهرة");
  });
});

describe("الشحنة الجاهزة", () => {
  it("بتحسب التحصيل وعدد القطع والوصف", () => {
    const s = built();
    expect(s.cod).toBe(1090);
    expect(s.itemsCount).toBe(2);
    expect(s.description).toBe("مرايه × 2");
  });

  it("بتقسّم الاسم لأول وآخر، والاسم الواحد بيتكرر", () => {
    const one = built({ customer: { ...customer, full_name: "أحمد" } });
    expect(one.base.receiver).toEqual({
      firstName: "أحمد",
      lastName: "أحمد",
      phone: "01001234567",
    });
  });

  it("بتشيل أي رموز من التليفون", () => {
    const s = built({ customer: { ...customer, phone: "+20 100-123-4567" } });
    expect((s.base.receiver as { phone: string }).phone).toBe("201001234567");
  });

  it("أول شكل للعنوان هو city — ده اللي بوسطة بتقبله", () => {
    const s = built();
    expect(s.variants[0].name).toBe("city+zoneId");
    expect(s.variants[0].dropOffAddress.city).toBe("cairo1");
    expect(s.variants[0].dropOffAddress.cityId).toBeUndefined();
    expect(s.variants.map((v) => v.name)).toEqual([
      "city+zoneId",
      "city-only",
      "cityId+city",
    ]);
  });

  it("رقم الأوردر بيتبعت كمرجع عشان المزامنة تعرف تربطه", () => {
    expect(built().base.businessReference).toBe("1371");
  });

  it("بتحط رقم عنوان الاستلام لو البيزنس مظبّطه", () => {
    expect(built({ pickupAddressId: "pick1" }).base.pickupAddressId).toBe("pick1");
    expect(built().base.pickupAddressId).toBeUndefined();
  });

  it("الوصف مابيعديش ٢٥٠ حرف", () => {
    const many = Array.from({ length: 60 }, () => ({
      quantity: 1,
      salePrice: 10,
      productName: "منتج طويل الاسم جدًا",
    }));
    expect(built({ items: many }).description.length).toBeLessThanOrEqual(250);
  });
});

describe("أسباب الرفض", () => {
  const reject = (over: Partial<ShipmentInput>) => {
    const r = buildShipment(input(over));
    if (r.ok) throw new Error("المفروض ترفض");
    return r.error;
  };

  it("مدينة مش واضحة = مانبعتش", () => {
    expect(reject({ city: null })).toContain("معرفناش نحدد المدينة");
  });

  it("عميل من غير عنوان", () => {
    expect(
      reject({ customer: { ...customer, address: null } })
    ).toContain("ملوش عنوان");
  });

  it("تليفون ناقص", () => {
    expect(reject({ customer: { ...customer, phone: "0100" } })).toContain(
      "تليفون"
    );
  });

  it("أوردر من غير منتجات", () => {
    expect(reject({ items: [] })).toContain("ملوش منتجات");
  });

  it("أوردر من غير عميل", () => {
    expect(reject({ customer: null })).toContain("مالوش عميل");
  });
});

describe("شحنة التبديل", () => {
  const exchange = (over: Record<string, unknown> = {}) =>
    buildExchangeShipment({
      orderNumber: "1371",
      originalTracking: "102657691",
      outgoing: [{ quantity: 1, productName: "مرايه كبيرة" }],
      incoming: [{ quantity: 1, productName: "مرايه صغيرة" }],
      customer,
      city: cairo,
      zone: null,
      ...over,
    });

  const okShipment = (over: Record<string, unknown> = {}) => {
    const r = exchange(over);
    if (!r.ok) throw new Error("المفروض تنجح: " + r.error);
    return r.shipment;
  };

  it("نوعها ٣٠ عند بوسطة", () => {
    expect(okShipment().base.type).toBe(30);
  });

  it("بتوصف الرايح والراجع كل واحد لوحده", () => {
    const s = okShipment();
    expect(s.base.specs).toMatchObject({
      packageDetails: { itemsCount: 1, description: "مرايه كبيرة × 1" },
    });
    expect(s.base.returnSpecs).toMatchObject({
      packageDetails: { itemsCount: 1, description: "مرايه صغيرة × 1" },
    });
  });

  it("**التحصيل فرق السعر بس، والافتراضي صفر**", () => {
    // الحاجة القديمة مدفوعة خلاص — مانحصّلش سعر الأوردر تاني
    expect(okShipment().cod).toBe(0);
    expect(okShipment({ cod: 150 }).cod).toBe(150);
  });

  it("مابينزلش تحت الصفر — بوسطة مابتدفعش للعميل", () => {
    expect(okShipment({ cod: -200 }).cod).toBe(0);
  });

  it("مفيش رايح = مش تبديل", () => {
    const r = exchange({ outgoing: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("هيروح للعميل");
  });

  it("مفيش راجع = ده إرسال عادي مش تبديل", () => {
    const r = exchange({ incoming: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("إرسال عادي");
  });

  it("الكميات بصفر بتتشال زي المرتجع", () => {
    const r = exchange({ outgoing: [{ quantity: 0, productName: "مرايه" }] });
    expect(r.ok).toBe(false);
  });

  it("بترفض بنفس أسباب الإرسال: مفيش عنوان أو مدينة", () => {
    const noCity = exchange({ city: null });
    expect(noCity.ok).toBe(false);
    const noAddress = exchange({
      customer: { ...customer, address: null, street: null },
    });
    expect(noAddress.ok).toBe(false);
  });

  it("بتربطها بالشحنة الأصلية وبتديها مرجع مميز", () => {
    const s = okShipment();
    expect(s.base.originalTrackingNumber).toBe("102657691");
    expect(s.base.businessReference).toBe("EXC-1371");
  });

  it("بتجرّب نفس أشكال العنوان بالترتيب", () => {
    expect(okShipment().variants.map((v) => v.name)).toEqual([
      "city+zoneId",
      "city-only",
      "cityId+city",
    ]);
  });
});
