import { describe, expect, it, vi } from "vitest";
import {
  ShopifyError,
  fetchAccessToken,
  isCustomDomain,
  isValidShop,
  normalizeShop,
  testShopifyConnection,
  testShopifyToken,
} from "./client";

const CREDS = {
  shop: "d8rtv0-uq.myshopify.com",
  clientId: "cid",
  clientSecret: "secret",
};

const reply = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe("دومين المتجر", () => {
  it("بينضّف اللي الناس بتلزقه", () => {
    // كل الأشكال دي بتحصل فعلًا
    expect(normalizeShop("https://d8rtv0-uq.myshopify.com/")).toBe(
      "d8rtv0-uq.myshopify.com"
    );
    expect(normalizeShop("  D8RTV0-UQ.MyShopify.com  ")).toBe(
      "d8rtv0-uq.myshopify.com"
    );
    expect(normalizeShop("d8rtv0-uq.myshopify.com/admin")).toBe(
      "d8rtv0-uq.myshopify.com"
    );
  });

  it("بيرفض اللي شوبيفاي مش بتفهمه", () => {
    expect(isValidShop("d8rtv0-uq.myshopify.com")).toBe(true);
    // الدومين المخصّص مابينفعش مع الـAPI
    expect(isValidShop("minishomedecor.com")).toBe(false);
    expect(isValidShop("")).toBe(false);
    expect(isValidShop(null)).toBe(false);
  });

  it("**الاسم لوحده بيكمّل نفسه**", () => {
    // أغلب الناس بتعرف اسم متجرها بس مش الدومين الكامل، وكانوا بياخدوا
    // رسالة خطأ على حاجة هي صح في الأساس
    expect(normalizeShop("d8rtv0-uq")).toBe("d8rtv0-uq.myshopify.com");
    expect(isValidShop("d8rtv0-uq")).toBe(true);
    expect(normalizeShop("  MINIS  ")).toBe("minis.myshopify.com");
  });

  it("بيشيل www من الدومين", () => {
    expect(normalizeShop("www.d8rtv0-uq.myshopify.com")).toBe(
      "d8rtv0-uq.myshopify.com"
    );
  });

  it("بيفرّق بين الدومين المخصّص والغلط", () => {
    // الفرق ده بيحدد الرسالة اللي العميل بيشوفها
    expect(isCustomDomain("minishomedecor.com")).toBe(true);
    expect(isCustomDomain("https://www.minishomedecor.com/shop")).toBe(true);
    expect(isCustomDomain("d8rtv0-uq.myshopify.com")).toBe(false);
    expect(isCustomDomain("d8rtv0-uq")).toBe(false);
    expect(isCustomDomain("")).toBe(false);
  });
});

describe("طلب التوكن", () => {
  it("بيبعت بيانات التطبيق وبيرجّع التوكن", async () => {
    const f = vi.fn(async () => reply(200, { access_token: "shpat_x" }));
    const token = await fetchAccessToken(CREDS, f as unknown as typeof fetch);

    expect(token).toBe("shpat_x");
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toBe(
      "https://d8rtv0-uq.myshopify.com/admin/oauth/access_token"
    );
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      client_id: "cid",
      client_secret: "secret",
      grant_type: "client_credentials",
    });
  });

  it("دومين غلط = رسالة مفهومة من غير ما نضيّع نداء", async () => {
    const f = vi.fn();
    await expect(
      fetchAccessToken(
        { ...CREDS, shop: "minishomedecor.com" },
        f as unknown as typeof fetch
      )
    ).rejects.toBeInstanceOf(ShopifyError);
    expect(f).not.toHaveBeenCalled();
  });

  it("مفاتيح ناقصة = مابنحاولش", async () => {
    const f = vi.fn();
    await expect(
      fetchAccessToken(
        { ...CREDS, clientSecret: "" },
        f as unknown as typeof fetch
      )
    ).rejects.toThrow("ناقصة");
    expect(f).not.toHaveBeenCalled();
  });

  it("متجر مش موجود = بنقولها بالعربي", async () => {
    const f = vi.fn(async () => reply(404, {}));
    await expect(
      fetchAccessToken(CREDS, f as unknown as typeof fetch)
    ).rejects.toThrow("مش موجود");
  });
});

describe("جرّب الاتصال", () => {
  /** أول نداء = التوكن، والتاني = GraphQL */
  const flow = (tokenBody: unknown, gqlBody: unknown, gqlStatus = 200) => {
    let n = 0;
    return vi.fn(async () =>
      n++ === 0 ? reply(200, tokenBody) : reply(gqlStatus, gqlBody)
    );
  };

  it("بيقرا اسم المتجر فعلاً مش بيكتفي بـ ٢٠٠", async () => {
    // الدرس من بوسطة: فيه مسارات بترد ٢٠٠ من غير ما تتحقق من المفتاح
    const f = flow(
      { access_token: "t" },
      {
        data: {
          shop: {
            name: "Minis Home Decor",
            myshopifyDomain: "d8rtv0-uq.myshopify.com",
            currencyCode: "EGP",
          },
        },
      }
    );
    const r = await testShopifyConnection(CREDS, f as unknown as typeof fetch);
    expect(r).toEqual({
      ok: true,
      shop: {
        name: "Minis Home Decor",
        domain: "d8rtv0-uq.myshopify.com",
        currency: "EGP",
      },
    });
  });

  it("مفاتيح مرفوضة = بيرجّع سبب شوبيفاي", async () => {
    const f = vi.fn(async () =>
      reply(401, { error_description: "Invalid API key or access token" })
    );
    const r = await testShopifyConnection(CREDS, f as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain("Invalid API key");
  });

  it("GraphQL بترجّع ٢٠٠ مع أخطاء — لازم نمسكها", async () => {
    const f = flow(
      { access_token: "t" },
      { errors: [{ message: "Access denied for shop field" }] }
    );
    const r = await testShopifyConnection(CREDS, f as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain("Access denied");
  });

  it("الشبكة وقعت = مابيرميش برّه", async () => {
    const f = vi.fn(async () => {
      throw new Error("timeout");
    });
    const r = await testShopifyConnection(CREDS, f as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false, error: "timeout" });
  });
});

describe("الربط بتوكن جاهز", () => {
  // تطبيق المتجر (`Develop apps`) بيدّي `shpat_…` على طول. و`API key`
  // و`API secret` بتوعه **مابيطلّعوش توكن** — شوبيفاي بترد ٤٠٠ من غير
  // سبب في الرد، فالرسالة كانت بتطلع «كود ٤٠٠» ومحدش يعرف ليه.
  it("**بينادي GraphQL على طول من غير تبادل توكن**", async () => {
    const urls: string[] = [];
    const f = vi.fn(async (u: string) => {
      urls.push(String(u));
      return reply(200, { data: { shop: { name: "٢ سِك", myshopifyDomain: "s.myshopify.com", currencyCode: "EGP" } } });
    });
    const r = await testShopifyToken("s.myshopify.com", "shpat_x", f as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: true });
    // نداء واحد بس — مافيش `/admin/oauth/access_token`
    expect(f).toHaveBeenCalledTimes(1);
    expect(urls[0]).toContain("/graphql.json");
  });

  it("التوكن الغلط بيرجّع سبب مفهوم مش كود", async () => {
    const f = vi.fn(async () => reply(401, { errors: "Invalid API key or access token" }));
    const r = await testShopifyToken("s.myshopify.com", "shpat_bad", f as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false });
  });

  it("الشبكة وقعت = مابيرميش برّه", async () => {
    const f = vi.fn(async () => { throw new Error("timeout"); });
    const r = await testShopifyToken("s.myshopify.com", "shpat_x", f as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false, error: "timeout" });
  });
});
