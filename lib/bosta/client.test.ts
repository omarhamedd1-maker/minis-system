import { describe, expect, it, vi } from "vitest";
import { BostaError, fetchAllDeliveries, testConnection } from "./client";

function reply(status: number, body: unknown) {
  return Promise.resolve({
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

function page(ids: string[]) {
  return { data: { deliveries: ids.map((id) => ({ _id: id, trackingNumber: id })) } };
}

describe("جلب الشحنات صفحة صفحة", () => {
  it("بيلمّ كل الصفحات لحد ما تخلص", async () => {
    const f = vi
      .fn()
      .mockReturnValueOnce(reply(200, page(["a", "b"])))
      .mockReturnValueOnce(reply(200, page(["c"])))
      .mockReturnValueOnce(reply(200, page([])));

    const out = await fetchAllDeliveries("key", f as unknown as typeof fetch);
    expect(out.map((d) => d._id)).toEqual(["a", "b", "c"]);
  });

  it("بيقف لو بوسطة فضلت تكرر نفس الصفحة", async () => {
    // ده بيحصل فعلاً: بوسطة أحيانًا بترجّع آخر صفحة للأبد
    const f = vi.fn().mockReturnValue(reply(200, page(["a", "b"])));

    const out = await fetchAllDeliveries("key", f as unknown as typeof fetch);
    expect(out).toHaveLength(2);
    expect(f).toHaveBeenCalledTimes(2); // وقف بدري، مالفّش ٦٠ مرة
  });

  it("بيرمي خطأ واضح لو المفتاح مرفوض", async () => {
    const f = vi.fn().mockReturnValue(reply(401, {}));
    await expect(
      fetchAllDeliveries("bad", f as unknown as typeof fetch)
    ).rejects.toBeInstanceOf(BostaError);
  });

  it("بيرجّع اللي جمعه لو صفحة وقعت في النص", async () => {
    const f = vi
      .fn()
      .mockReturnValueOnce(reply(200, page(["a"])))
      .mockReturnValueOnce(reply(500, {}));

    const out = await fetchAllDeliveries("key", f as unknown as typeof fetch);
    expect(out.map((d) => d._id)).toEqual(["a"]);
  });
});

describe("مفتاح مش صالح", () => {
  it("مفتاح فيه حروف عربية بيدي رسالة مفهومة مش خطأ تقني", async () => {
    const f = vi.fn();
    await expect(
      fetchAllDeliveries("مفتاح-غلط", f as unknown as typeof fetch)
    ).rejects.toThrow(/حروف مش مظبوطة/);
    expect(f).not.toHaveBeenCalled(); // مابعتناش أصلاً
  });

  it("مفتاح فاضي بيدي رسالة مفهومة", async () => {
    const f = vi.fn();
    await expect(
      fetchAllDeliveries("   ", f as unknown as typeof fetch)
    ).rejects.toThrow(/فاضي/);
  });

  it("المسافات الزايدة حوالين المفتاح بتتشال", async () => {
    const f = vi.fn().mockReturnValue(reply(200, page([])));
    await fetchAllDeliveries("  key  ", f as unknown as typeof fetch);
    const sent = f.mock.calls[0][1].headers.Authorization;
    expect(sent).toBe("key");
  });

  it("تجربة الاتصال كمان بتمسك المفتاح الغلط", async () => {
    const r = await testConnection("مفتاح-غلط", vi.fn() as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/حروف مش مظبوطة/);
  });
});

describe("تجربة الاتصال", () => {
  it("بتنجح لو بوسطة ردّت تمام", async () => {
    const f = vi.fn().mockReturnValue(reply(200, {}));
    expect(await testConnection("key", f as unknown as typeof fetch)).toEqual({
      ok: true,
    });
  });

  it("بتقول إن المفتاح مرفوض", async () => {
    const f = vi.fn().mockReturnValue(reply(401, {}));
    const r = await testConnection("bad", f as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("مرفوض");
  });

  it("مابتكسرش لو النت فصل", async () => {
    const f = vi.fn().mockRejectedValue(new Error("network"));
    const r = await testConnection("key", f as unknown as typeof fetch);
    expect(r.ok).toBe(false);
  });
});
