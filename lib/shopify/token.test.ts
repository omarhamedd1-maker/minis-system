import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveShopifyToken, clearTokenCache } from "./token";

const NOW = 1_800_000_000_000;

/** قاعدة بيانات وهمية */
function fakeDb(over: {
  creds?: Record<string, unknown>;
  app?: { client_id: string; client_secret: string } | null;
} = {}) {
  const creds = {
    shopify_shop: "shop.myshopify.com",
    shopify_access_token: "shpat_stored",
    shopify_client_id: null,
    shopify_client_secret: null,
    ...over.creds,
  };
  const app = over.app === undefined ? null : over.app;

  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === "shopify_app" ? { data: app } : { data: creds },
        }),
      }),
    }),
  } as never;
}

/** ردّ شوبيفاي على طلب التوكن */
const minted = (token = "shpat_fresh") =>
  vi.fn(async () =>
    new Response(JSON.stringify({ access_token: token, expires_in: 86399 }), {
      status: 200,
    })
  );

const refused = () =>
  vi.fn(async () =>
    new Response(JSON.stringify({ error: "invalid_client" }), { status: 401 })
  );

beforeEach(() => clearTokenCache());

describe("توكن شوبيفاي", () => {
  it("⚠️⚠️ بيطلب توكن جديد حتى لو فيه واحد متخزّن — المتخزّن هو اللي بيموت", async () => {
    const f = minted();
    const r = await resolveShopifyToken(
      fakeDb({ creds: { shopify_client_id: "id", shopify_client_secret: "sec" } }),
      "t1",
      undefined,
      f as never,
      NOW
    );
    expect(r).toMatchObject({ ok: true, token: "shpat_fresh", source: "fresh" });
    expect(f).toHaveBeenCalledOnce();
  });

  it("بياخد مفاتيح تطبيق المنصة لو البيزنس مالوش مفاتيح", async () => {
    const f = minted();
    const r = await resolveShopifyToken(
      fakeDb({ app: { client_id: "id", client_secret: "sec" } }),
      "t1",
      undefined,
      f as never,
      NOW
    );
    expect(r).toMatchObject({ ok: true, source: "fresh" });
  });

  it("⚠️ مافيش مفاتيح خالص = المتخزّن (توكن دائم متحطّ بالإيد)", async () => {
    const f = minted();
    const r = await resolveShopifyToken(fakeDb(), "t1", undefined, f as never, NOW);
    expect(r).toMatchObject({ ok: true, token: "shpat_stored", source: "stored" });
    expect(f).not.toHaveBeenCalled();
  });

  it("⚠️ الطلب لو فشل بنجرّب المتخزّن قبل ما نستسلم", async () => {
    const r = await resolveShopifyToken(
      fakeDb({ creds: { shopify_client_id: "id", shopify_client_secret: "sec" } }),
      "t1",
      undefined,
      refused() as never,
      NOW
    );
    expect(r).toMatchObject({ ok: true, token: "shpat_stored", source: "stored" });
  });

  it("فشل الطلب ومافيش متخزّن = السبب بيتقال", async () => {
    const r = await resolveShopifyToken(
      fakeDb({
        creds: {
          shopify_client_id: "id",
          shopify_client_secret: "sec",
          shopify_access_token: null,
        },
      }),
      "t1",
      undefined,
      refused() as never,
      NOW
    );
    expect(r.ok).toBe(false);
  });

  it("⚠️ مافيش متجر = مش مربوط", async () => {
    const r = await resolveShopifyToken(
      fakeDb({ creds: { shopify_shop: null } }),
      "t1",
      undefined,
      minted() as never,
      NOW
    );
    expect(r).toEqual({
      ok: false,
      error: "البيزنس ده لسه مربطش متجر شوبيفاي",
    });
  });

  it("⚠️ اللفة الواحدة بتطلب التوكن مرة مش كل نداء", async () => {
    const f = minted();
    const db = fakeDb({
      creds: { shopify_client_id: "id", shopify_client_secret: "sec" },
    });
    for (let i = 0; i < 5; i++) {
      await resolveShopifyToken(db, "t1", undefined, f as never, NOW);
    }
    expect(f).toHaveBeenCalledOnce();
  });

  it("⚠️⚠️ وبعد ساعة بيتطلب من جديد — قبل ما يموت بكتير", async () => {
    const f = minted();
    const db = fakeDb({
      creds: { shopify_client_id: "id", shopify_client_secret: "sec" },
    });
    await resolveShopifyToken(db, "t1", undefined, f as never, NOW);
    await resolveShopifyToken(
      db,
      "t1",
      undefined,
      f as never,
      NOW + 61 * 60 * 1000
    );
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("⚠️ كل بيزنس ليه توكنه — مافيش خلط", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "a" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "b" }), { status: 200 })
      );
    const db = fakeDb({
      creds: { shopify_client_id: "id", shopify_client_secret: "sec" },
    });
    const one = await resolveShopifyToken(db, "t1", undefined, f as never, NOW);
    const two = await resolveShopifyToken(db, "t2", undefined, f as never, NOW);
    expect(one.ok && one.token).toBe("a");
    expect(two.ok && two.token).toBe("b");
  });
});
