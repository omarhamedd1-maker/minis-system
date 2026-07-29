import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runBostaCreate, runBostaReturn } from "./create";

const CITIES = {
  data: {
    list: [
      { _id: "cairo1", nameAr: "القاهرة", name: "Cairo" },
      { _id: "giza1", nameAr: "الجيزة", name: "Giza" },
    ],
  },
};

const ORDER = {
  id: "o1",
  order_number: "1371",
  discount: 0,
  shipping_price: 90,
  bosta_tracking: null as string | null,
  tenant_id: "t1",
  customers: {
    full_name: "محمد السعودي",
    phone: "01001234567",
    address: "التجمع الخامس، Hogcity",
    city: null,
    zone: null,
    street: null,
    building: null,
    floor: null,
    apartment: null,
    landmark: null,
  },
  order_items: [
    {
      quantity: 2,
      sale_price_at_order: 500,
      product_variants: { products: { name: "Mirror", name_ar: "مرايه" } },
    },
  ],
};

type DbOpts = {
  order?: Record<string, unknown> | null;
  creds?: Record<string, unknown> | null;
  updateError?: { message: string } | null;
  onUpdate?: (patch: Record<string, unknown>) => void;
};

function fakeDb(o: DbOpts = {}): SupabaseClient {
  const order = o.order === undefined ? ORDER : o.order;
  const creds =
    o.creds === undefined ? { tenant_id: "t1", bosta_api_key: "KEY" } : o.creds;

  const readOnce = (data: unknown) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error: null }) }) }),
  });

  return {
    from(table: string) {
      if (table === "orders") {
        return {
          ...readOnce(order),
          update: (patch: Record<string, unknown>) => ({
            eq: async () => {
              o.onUpdate?.(patch);
              return { error: o.updateError ?? null };
            },
          }),
        };
      }
      if (table === "tenant_credentials") return readOnce(creds);
      throw new Error("جدول مش متوقع: " + table);
    },
  } as unknown as SupabaseClient;
}

/**
 * بيرد على: البحث عن شحنة قديمة، جلب المدن، وإنشاء الشحنة.
 * `existing` = الشحنة القديمة اللي بوسطة بترجّعها (undefined = مفيش سؤال عنها)
 */
function fakeFetch(
  deliveryReplies: { ok: boolean; body: unknown }[],
  existing?: Record<string, unknown> | null
) {
  const calls: { url: string; body: unknown; key: string }[] = [];
  let i = 0;
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: init?.body ? JSON.parse(String(init.body)) : null,
      key: (init?.headers as Record<string, string>)?.Authorization ?? "",
    });
    if (String(url).includes("/deliveries/business/")) {
      const d =
        existing === undefined
          ? { _id: "old1", trackingNumber: "5555", state: { value: "Created", code: 10 } }
          : existing;
      return {
        ok: Boolean(d),
        status: d ? 200 : 404,
        json: async () => ({ data: d }),
      } as Response;
    }
    if (String(url).endsWith("/cities")) {
      return { ok: true, status: 200, json: async () => CITIES } as Response;
    }
    const r = deliveryReplies[Math.min(i++, deliveryReplies.length - 1)];
    return {
      ok: r.ok,
      status: r.ok ? 200 : 400,
      json: async () => r.body,
    } as Response;
  });
  return { f: f as unknown as typeof fetch, calls };
}

const created = (tracking: string) => ({
  ok: true,
  body: { data: { trackingNumber: tracking } },
});
const rejected = (message: string) => ({ ok: false, body: { message } });

describe("إرسال شحنة", () => {
  it("بيبعت وبيحفظ رقم التتبع وبيخلي الأوردر جاهز", async () => {
    const patches: Record<string, unknown>[] = [];
    const { f, calls } = fakeFetch([created("2237843281")]);

    const res = await runBostaCreate({
      db: fakeDb({ onUpdate: (p) => patches.push(p) }),
      orderId: "o1",
      fetchImpl: f,
    });

    expect(res).toMatchObject({
      ok: true,
      tracking: "2237843281",
      city: "القاهرة",
      usedVariant: "city+zoneId",
    });
    expect(patches[0]).toEqual({
      bosta_tracking: "2237843281",
      order_status: "ready",
      cancelled_at: null,
    });
    // التحصيل = ٢×٥٠٠ + ٩٠ شحن
    expect((calls[1].body as { cod: number }).cod).toBe(1090);
  });

  it("بيستخدم مفتاح البيزنس صاحب الأوردر مش مفتاح واحد للكل", async () => {
    const { f, calls } = fakeFetch([created("1")]);
    await runBostaCreate({
      db: fakeDb({ creds: { tenant_id: "t1", bosta_api_key: "key-of-tenant-1" } }),
      orderId: "o1",
      fetchImpl: f,
    });
    expect(calls.map((c) => c.key)).toEqual(["key-of-tenant-1", "key-of-tenant-1"]);
  });

  it("مفتاح متلزوق غلط بيدّي رسالة مفهومة مش خطأ تقني", async () => {
    const { f } = fakeFetch([created("1")]);
    const res = await runBostaCreate({
      db: fakeDb({ creds: { tenant_id: "t1", bosta_api_key: "مفتاح بالعربي" } }),
      orderId: "o1",
      fetchImpl: f,
    });
    if (res.ok) throw new Error("المفروض يرفض");
    expect(res.error).toContain("حروف مش مظبوطة");
  });

  it("بيجرّب الشكل اللي بعده لو بوسطة رفضت الأول", async () => {
    const { f, calls } = fakeFetch([
      rejected("city, zoneId, or districtId is required"),
      created("999"),
    ]);

    const res = await runBostaCreate({ db: fakeDb(), orderId: "o1", fetchImpl: f });

    expect(res).toMatchObject({ ok: true, tracking: "999", usedVariant: "city-only" });
    expect(calls).toHaveLength(3); // مدن + محاولتين
  });

  it("بيرجّع سبب الرفض لو كل الأشكال فشلت", async () => {
    const { f } = fakeFetch([rejected("العنوان ناقص")]);
    const res = await runBostaCreate({ db: fakeDb(), orderId: "o1", fetchImpl: f });
    expect(res).toMatchObject({ ok: false, error: "العنوان ناقص" });
    if (!res.ok) expect(res.attempts).toHaveLength(3);
  });
});

describe("الحالات اللي بتوقف الإرسال", () => {
  it("أوردر عليه شحنة لسه نافعة مابيتبعتش تاني", async () => {
    const { f, calls } = fakeFetch([created("1")]);
    const res = await runBostaCreate({
      db: fakeDb({ order: { ...ORDER, bosta_tracking: "5555" } }),
      orderId: "o1",
      fetchImpl: f,
    });
    expect(res).toEqual({ ok: true, already: true, tracking: "5555" });
    // سأل بوسطة عن الشحنة القديمة بس، ومابعتش جديدة
    expect(calls.every((c) => c.url.includes("/deliveries/business/"))).toBe(true);
  });

  it("شحنة ماتت (أرشيف) = بيعمل شحنة جديدة بدالها", async () => {
    // ده حصل فعلًا: أوردر ١٣٣٦ قعد أسبوعين من غير بيك اب فبوسطة أرشفت
    // الشحنة، والسيستم كان بيرفض يبعت تاني فالأوردر يقعد مقفول
    const patches: Record<string, unknown>[] = [];
    const { f } = fakeFetch([created("8888")], {
      _id: "old1",
      trackingNumber: "5555",
      state: { value: "Archived", code: 104 },
    });

    const res = await runBostaCreate({
      db: fakeDb({
        order: { ...ORDER, bosta_tracking: "5555" },
        onUpdate: (p) => patches.push(p),
      }),
      orderId: "o1",
      fetchImpl: f,
    });

    expect(res).toMatchObject({ ok: true, tracking: "8888" });
    expect(patches[0]).toMatchObject({ bosta_tracking: "8888" });
  });

  it("معرفناش نتأكد من الشحنة القديمة = مانبعتش تاني", async () => {
    // الأأمن: أحسن ما نبعت شحنتين لنفس العميل
    const { f } = fakeFetch([created("1")], null);
    const res = await runBostaCreate({
      db: fakeDb({ order: { ...ORDER, bosta_tracking: "5555" } }),
      orderId: "o1",
      fetchImpl: f,
    });
    expect(res).toEqual({ ok: true, already: true, tracking: "5555" });
  });

  it("بيزنس مش مربوط ببوسطة", async () => {
    const { f } = fakeFetch([created("1")]);
    const res = await runBostaCreate({
      db: fakeDb({ creds: { tenant_id: "t1", bosta_api_key: null } }),
      orderId: "o1",
      fetchImpl: f,
    });
    expect(res).toMatchObject({ ok: false, error: "البيزنس ده لسه مربطش حساب بوسطة" });
    expect(f).not.toHaveBeenCalled();
  });

  it("أوردر مش موجود", async () => {
    const { f } = fakeFetch([created("1")]);
    const res = await runBostaCreate({
      db: fakeDb({ order: null }),
      orderId: "مش-موجود",
      fetchImpl: f,
    });
    expect(res).toMatchObject({ ok: false, error: "الأوردر مش موجود" });
  });

  it("عنوان مايتعرفش منه المدينة مابيتبعتش", async () => {
    const { f, calls } = fakeFetch([created("1")]);
    const res = await runBostaCreate({
      db: fakeDb({
        order: {
          ...ORDER,
          customers: { ...ORDER.customers, address: "شارع ٩ الدور التالت" },
        },
      }),
      orderId: "o1",
      fetchImpl: f,
    });
    if (res.ok) throw new Error("المفروض يرفض");
    expect(res.error).toContain("معرفناش نحدد المدينة");
    expect(calls).toHaveLength(1); // جاب المدن بس، مابعتش
  });
});

describe("وضع التجربة", () => {
  it("بيعرض اللي هيتبعت من غير ما يبعت ولا يكتب", async () => {
    const patches: Record<string, unknown>[] = [];
    const { f, calls } = fakeFetch([created("1")]);

    const res = await runBostaCreate({
      db: fakeDb({ onUpdate: (p) => patches.push(p) }),
      orderId: "o1",
      dry: true,
      fetchImpl: f,
    });

    expect(res).toMatchObject({
      ok: true,
      dry: true,
      cod: 1090,
      itemsCount: 2,
      city: "القاهرة",
    });
    expect(calls).toHaveLength(1); // المدن بس
    expect(patches).toHaveLength(0); // مافيش كتابة
  });
});

// ==========================================================================
// شحنة المرتجع
// ==========================================================================

const RETURN_ORDER = {
  id: "o2",
  order_number: "1300",
  bosta_tracking: "8550116799",
  return_tracking: null as string | null,
  tenant_id: "t1",
  customers: ORDER.customers,
  order_items: [
    {
      quantity: 3,
      returned_quantity: 2,
      product_variants: { products: { name: "Mirror", name_ar: "مرايه" } },
    },
    {
      quantity: 1,
      returned_quantity: 0,
      product_variants: { products: { name: "Lamp", name_ar: "أباجورة" } },
    },
  ],
};

describe("شحنة المرتجع", () => {
  it("بتاخد الكميات الراجعة بس، وبتحفظ رقم تتبع المرتجع", async () => {
    const patches: Record<string, unknown>[] = [];
    const { f, calls } = fakeFetch([created("7777777777")]);

    const res = await runBostaReturn({
      db: fakeDb({ order: RETURN_ORDER, onUpdate: (p) => patches.push(p) }),
      orderId: "o2",
      fetchImpl: f,
    });

    expect(res).toMatchObject({ ok: true, tracking: "7777777777", usedVariant: "city" });
    expect(patches[0]).toEqual({ return_tracking: "7777777777" });

    const body = calls[1].body as {
      cod: number;
      type: number;
      specs: { packageDetails: { itemsCount: number; description: string } };
      originalTrackingNumber: string;
      businessReference: string;
    };
    expect(body.type).toBe(15); // سحب مرتجع من العميل
    expect(body.cod).toBe(0); // الفلوس بترجع للعميل منّنا مش من بوسطة
    expect(body.specs.packageDetails.itemsCount).toBe(2); // الراجع بس مش الأربعة
    expect(body.specs.packageDetails.description).toBe("مرايه × 2");
    expect(body.originalTrackingNumber).toBe("8550116799");
    expect(body.businessReference).toBe("RET-1300");
  });

  it("بتبعت العنوان في pickupAddress بشكل city مش cityId", async () => {
    const { f, calls } = fakeFetch([created("1")]);
    await runBostaReturn({
      db: fakeDb({ order: RETURN_ORDER }),
      orderId: "o2",
      fetchImpl: f,
    });
    const body = calls[1].body as {
      pickupAddress: Record<string, unknown>;
      dropOffAddress: Record<string, unknown>;
    };
    expect(body.pickupAddress.city).toBe("cairo1");
    expect(body.pickupAddress.cityId).toBeUndefined();
    expect(body.dropOffAddress.city).toBe("cairo1");
  });

  it("مافيش حاجة متعلّم إنها راجعة = مانعملش شحنة", async () => {
    const { f, calls } = fakeFetch([created("1")]);
    const res = await runBostaReturn({
      db: fakeDb({
        order: {
          ...RETURN_ORDER,
          order_items: RETURN_ORDER.order_items.map((i) => ({
            ...i,
            returned_quantity: 0,
          })),
        },
      }),
      orderId: "o2",
      fetchImpl: f,
    });
    if (res.ok) throw new Error("المفروض يرفض");
    expect(res.error).toContain("حدّد الأول المنتجات الراجعة");
    expect(calls).toHaveLength(1); // جاب المدن بس
  });

  it("أوردر عليه مرتجع أصلاً مابيتعملش تاني", async () => {
    const { f } = fakeFetch([created("1")]);
    const res = await runBostaReturn({
      db: fakeDb({ order: { ...RETURN_ORDER, return_tracking: "999" } }),
      orderId: "o2",
      fetchImpl: f,
    });
    expect(res).toEqual({ ok: true, already: true, tracking: "999" });
    expect(f).not.toHaveBeenCalled();
  });

  it("بيجرّب cityId لو بوسطة رفضت city", async () => {
    const { f, calls } = fakeFetch([rejected("bad address"), created("555")]);
    const res = await runBostaReturn({
      db: fakeDb({ order: RETURN_ORDER }),
      orderId: "o2",
      fetchImpl: f,
    });
    expect(res).toMatchObject({ ok: true, usedVariant: "cityId" });
    expect(calls).toHaveLength(3);
  });

  it("وضع التجربة مابيبعتش ومابيكتبش", async () => {
    const patches: Record<string, unknown>[] = [];
    const { f, calls } = fakeFetch([created("1")]);
    const res = await runBostaReturn({
      db: fakeDb({ order: RETURN_ORDER, onUpdate: (p) => patches.push(p) }),
      orderId: "o2",
      dry: true,
      fetchImpl: f,
    });
    expect(res).toMatchObject({ ok: true, dry: true, itemsCount: 2, city: "القاهرة" });
    expect(calls).toHaveLength(1);
    expect(patches).toHaveLength(0);
  });
});
