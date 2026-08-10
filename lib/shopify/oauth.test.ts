import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  SHOPIFY_SCOPES,
  buildInstallUrl,
  checkInstallStart,
  checkCallback,
  newState,
  verifyHmac,
} from "./oauth";

const SECRET = "shpss_test_secret";

/** بيوقّع زي ما شوبيفاي بتوقّع بالظبط */
function sign(params: Record<string, string>) {
  const message = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHmac("sha256", SECRET).update(message).digest("hex");
}

describe("لينك الموافقة", () => {
  it("بيبني لينك شوبيفاي بالصلاحيات المطلوبة", () => {
    const url = buildInstallUrl({
      shop: "d8rtv0-uq.myshopify.com",
      clientId: "cid",
      redirectUri: "https://minis-system.vercel.app/api/shopify/callback",
      state: "abc",
    });
    expect(url).toContain("https://d8rtv0-uq.myshopify.com/admin/oauth/authorize");
    expect(url).toContain("client_id=cid");
    expect(url).toContain("state=abc");
    expect(decodeURIComponent(url!)).toContain(SHOPIFY_SCOPES);
  });

  it("بينضّف الدومين لو المستخدم لزقه بـ https", () => {
    const url = buildInstallUrl({
      shop: "https://d8rtv0-uq.myshopify.com/",
      clientId: "cid",
      redirectUri: "x",
      state: "s",
    });
    expect(url).toContain("https://d8rtv0-uq.myshopify.com/admin");
  });

  it("دومين مش مظبوط = null مش لينك مكسور", () => {
    expect(
      buildInstallUrl({
        shop: "minishomedecor.com",
        clientId: "cid",
        redirectUri: "x",
        state: "s",
      })
    ).toBeNull();
  });
});

describe("الـstate", () => {
  it("مختلف كل مرة وطويل كفاية", () => {
    const a = newState();
    const b = newState();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });
});

describe("التحقق من توقيع شوبيفاي", () => {
  it("التوقيع الصح بيعدّي", () => {
    const p = { shop: "x.myshopify.com", code: "c", state: "s" };
    expect(verifyHmac({ ...p, hmac: sign(p) }, SECRET)).toBe(true);
  });

  it("أي تلاعب في الباراميترات بيكشف", () => {
    const p = { shop: "x.myshopify.com", code: "c", state: "s" };
    const hmac = sign(p);
    // حد غيّر المتجر بعد التوقيع
    expect(
      verifyHmac({ ...p, shop: "hacker.myshopify.com", hmac }, SECRET)
    ).toBe(false);
  });

  it("مفتاح سري غلط = مرفوض", () => {
    const p = { shop: "x.myshopify.com", code: "c" };
    expect(verifyHmac({ ...p, hmac: sign(p) }, "wrong-secret")).toBe(false);
  });

  it("من غير توقيع خالص = مرفوض", () => {
    expect(verifyHmac({ shop: "x.myshopify.com" }, SECRET)).toBe(false);
  });
});

describe("فحص الرد كامل", () => {
  const good = () => {
    const p = { shop: "d8rtv0-uq.myshopify.com", code: "the-code", state: "st" };
    return { ...p, hmac: sign(p) };
  };

  it("الرد السليم بيعدّي وبيرجّع البيانات", () => {
    expect(checkCallback(good(), SECRET)).toEqual({
      ok: true,
      shop: "d8rtv0-uq.myshopify.com",
      code: "the-code",
      state: "st",
    });
  });

  it("رد مزوّر بيتمنع", () => {
    const r = checkCallback({ ...good(), hmac: "deadbeef" }, SECRET);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain("توقيع");
  });

  it("من غير كود = مرفوض", () => {
    const p = { shop: "d8rtv0-uq.myshopify.com", state: "st" };
    const r = checkCallback({ ...p, hmac: sign(p) }, SECRET);
    expect(r).toMatchObject({ ok: false });
  });

  it("من غير state = مرفوض", () => {
    const p = { shop: "d8rtv0-uq.myshopify.com", code: "c" };
    const r = checkCallback({ ...p, hmac: sign(p) }, SECRET);
    expect(r).toMatchObject({ ok: false });
  });
});

describe("مين بدأ التركيب — للتطبيق العام", () => {
  const SECRET = "shpss_secret";
  const signed = (p: Record<string, string>) => {
    const message = Object.keys(p).sort().map((k) => `${k}=${p[k]}`).join("&");
    const hmac = crypto.createHmac("sha256", SECRET).update(message).digest("hex");
    return { ...p, hmac };
  };

  it("واحد داخل بحسابه: بيعدّي من غير توقيع", () => {
    const r = checkInstallStart({ shop: "x.myshopify.com" }, SECRET, true);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fromShopify).toBe(false);
  });

  // **دي اللي كانت بترد ٤٠١** — التاجر جايّ من شوبيفاي ومالوش حساب عندنا،
  // والمراجعة بترفض على ده
  it("جايّ من شوبيفاي بتوقيع صح: بيعدّي من غير حساب", () => {
    const r = checkInstallStart(
      signed({ shop: "x.myshopify.com", timestamp: "123" }),
      SECRET,
      false
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fromShopify).toBe(true);
  });

  it("من غير جلسة ومن غير توقيع: يترفض", () => {
    const r = checkInstallStart({ shop: "x.myshopify.com" }, SECRET, false);
    expect(r.ok).toBe(false);
  });

  it("توقيع مزوّر: يترفض", () => {
    const r = checkInstallStart(
      { shop: "x.myshopify.com", timestamp: "123", hmac: "غلط" },
      SECRET,
      false
    );
    expect(r.ok).toBe(false);
  });

  it("مفيش دومين: يترفض حتى مع جلسة", () => {
    expect(checkInstallStart({}, SECRET, true).ok).toBe(false);
  });
});
