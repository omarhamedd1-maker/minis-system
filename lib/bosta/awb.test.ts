import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runBostaAwb, runBostaUpdateCod } from "./awb";
import { canEditDelivery } from "./order-status";

const ORDER = {
  id: "o1",
  order_number: "1336",
  bosta_tracking: "9349282587",
  tenant_id: "t1",
  discount: 0,
  shipping_price: 90,
  order_items: [{ quantity: 2, sale_price_at_order: 500 }],
};

function fakeDb(o: { order?: Record<string, unknown> | null; creds?: Record<string, unknown> } = {}) {
  const order = o.order === undefined ? ORDER : o.order;
  const creds = o.creds ?? { tenant_id: "t1", bosta_api_key: "KEY" };
  const readOnce = (data: unknown) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error: null }) }) }),
  });
  return {
    from: (t: string) =>
      t === "orders" ? readOnce(order) : readOnce(creds),
  } as unknown as SupabaseClient;
}

const PDF_B64 = Buffer.from("%PDF-1.4 fake").toString("base64");

/** بيرد على مسار البحث عن الشحنة ومسار البوليصة ومسار التعديل */
function fakeFetch(opts: {
  delivery?: Record<string, unknown> | null;
  awb?: unknown;
  updateOk?: boolean;
}) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    calls.push({
      url: u,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });

    if (u.includes("/deliveries/business/")) {
      const d = opts.delivery === undefined ? { _id: "bid1", trackingNumber: "9349282587", state: { value: "Created" }, cod: 1090 } : opts.delivery;
      return { ok: Boolean(d), status: d ? 200 : 404, json: async () => ({ data: d }) } as Response;
    }
    if (u.includes("/deliveries/awb/")) {
      const body = opts.awb === undefined ? { data: PDF_B64 } : opts.awb;
      return { ok: body !== null, status: body ? 200 : 404, json: async () => body } as Response;
    }
    // PUT التعديل
    return {
      ok: opts.updateOk !== false,
      status: opts.updateOk === false ? 400 : 200,
      json: async () => ({ message: opts.updateOk === false ? "مرفوض" : "تم" }),
    } as Response;
  });
  return { f: f as unknown as typeof fetch, calls };
}

describe("قفل التعديل حسب حالة الشحنة", () => {
  it("بنجرّب التعديل طول ما الشحنة لسه في الطريق", () => {
    // مش متأكدين إن بوسطة هتقبل ولا لأ — فبنجرّب، لأن تحصيل غلط أوجع
    // من محاولة مرفوضة
    for (const s of [
      "Created",
      "Waiting for pickup",
      "Picked up",
      "In transit",
      "Received at warehouse",
    ]) {
      expect(canEditDelivery(s), s).toBe(true);
    }
  });

  it("مابنجربش على الحالات النهائية", () => {
    for (const s of [
      "Delivered",
      "Out for delivery",
      "Returned to origin",
      "Cancelled",
      "Archived",
      "Lost",
    ]) {
      expect(canEditDelivery(s), s).toBe(false);
    }
  });

  it("حالة مجهولة بتتعامل كمقفولة — الأأمن", () => {
    expect(canEditDelivery("")).toBe(false);
    expect(canEditDelivery(null)).toBe(false);
  });
});

describe("بوليصة الشحن", () => {
  it("بتحوّل رقم التتبع لرقم بوسطة وبترجّع الملف", async () => {
    const { f, calls } = fakeFetch({});
    const res = await runBostaAwb({ db: fakeDb(), orderId: "o1", fetchImpl: f });

    if (!res.ok) throw new Error("المفروض ينجح: " + res.error);
    expect(Buffer.from(res.pdf).toString()).toContain("%PDF");
    // المطابقة بالرقم بالظبط مش بحث حر — البحث الحر بيرجّع شحنة تانية
    expect(calls[0].url).toContain("/deliveries/business/9349282587");
    expect(calls[1].url).toContain("/api/v0/deliveries/awb/bid1");
  });

  it("أوردر من غير شحنة", async () => {
    const { f } = fakeFetch({});
    const res = await runBostaAwb({
      db: fakeDb({ order: { ...ORDER, bosta_tracking: null } }),
      orderId: "o1",
      fetchImpl: f,
    });
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(f).not.toHaveBeenCalled();
  });

  it("بوسطة مالقتش الشحنة", async () => {
    const { f } = fakeFetch({ delivery: null });
    const res = await runBostaAwb({ db: fakeDb(), orderId: "o1", fetchImpl: f });
    if (res.ok) throw new Error("المفروض يرفض");
    expect(res.error).toContain("مالقتش شحنة");
  });

  it("شحنة اتسلّمت — بوسطة مابتديش بوليصة، والرسالة بتقول الحالة", async () => {
    const { f } = fakeFetch({
      delivery: { _id: "bid1", trackingNumber: "1", state: { value: "Delivered" } },
      awb: null,
    });
    const res = await runBostaAwb({ db: fakeDb(), orderId: "o1", fetchImpl: f });
    if (res.ok) throw new Error("المفروض يرفض");
    expect(res.error).toContain("Delivered");
  });
});

describe("تحديث التحصيل", () => {
  it("بيبعت التحصيل الجديد لو الشحنة لسه ماتاخدتش", async () => {
    const { f, calls } = fakeFetch({
      delivery: { _id: "bid1", trackingNumber: "1", state: { value: "Created" }, cod: 500 },
    });
    const res = await runBostaUpdateCod({ db: fakeDb(), orderId: "o1", fetchImpl: f });

    expect(res).toEqual({ ok: true, changed: true, cod: 1090, was: 500 });
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.body).toEqual({
      cod: 1090,
      specs: { packageDetails: { itemsCount: 2 } },
    });
    // المسار على v0 — v2 بيرجّع ٤٠٤
    expect(put?.url).toContain("/api/v0/deliveries/bid1");
  });

  it("مابيلمسش شحنة اتسلّمت خلاص", async () => {
    const { f, calls } = fakeFetch({
      delivery: { _id: "bid1", trackingNumber: "1", state: { value: "Delivered" }, cod: 500 },
    });
    const res = await runBostaUpdateCod({ db: fakeDb(), orderId: "o1", fetchImpl: f });

    expect(res).toMatchObject({ ok: true, changed: false });
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("مابيبعتش لو التحصيل مطابق أصلاً", async () => {
    const { f, calls } = fakeFetch({
      delivery: { _id: "bid1", trackingNumber: "1", state: { value: "Created" }, cod: 1090 },
    });
    const res = await runBostaUpdateCod({ db: fakeDb(), orderId: "o1", fetchImpl: f });

    expect(res).toMatchObject({ ok: true, changed: false, reason: "التحصيل مطابق أصلاً" });
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("وضع التجربة بيقول اللي هيتغيّر من غير ما يبعت", async () => {
    const { f, calls } = fakeFetch({
      delivery: { _id: "bid1", trackingNumber: "1", state: { value: "Created" }, cod: 500 },
    });
    const res = await runBostaUpdateCod({
      db: fakeDb(),
      orderId: "o1",
      dry: true,
      fetchImpl: f,
    });
    expect(res).toEqual({ ok: true, changed: true, cod: 1090, was: 500 });
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("بيرجّع رسالة بوسطة لو رفضت", async () => {
    const { f } = fakeFetch({
      delivery: { _id: "bid1", trackingNumber: "1", state: { value: "Created" }, cod: 500 },
      updateOk: false,
    });
    const res = await runBostaUpdateCod({ db: fakeDb(), orderId: "o1", fetchImpl: f });
    expect(res).toMatchObject({ ok: false, error: "مرفوض" });
  });
});
