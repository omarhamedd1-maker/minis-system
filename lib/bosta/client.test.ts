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
