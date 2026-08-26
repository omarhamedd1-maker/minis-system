import { describe, it, expect } from "vitest";
import {
  isPreviewHost,
  webhookOrigin,
  webhookCallbackUrl,
  FALLBACK_ORIGIN,
} from "./webhook-url";

describe("⚠️⚠️ معاينات فيرسل", () => {
  it("معاينة الفرع بتتعرف", () => {
    expect(isPreviewHost("minis-system-git-rating-minishome.vercel.app")).toBe(
      true
    );
  });

  it("معاينة النشرة بالهاش بتتعرف", () => {
    expect(isPreviewHost("minis-system-k3n2p9x8a-minishome.vercel.app")).toBe(
      true
    );
  });

  it("⚠️ دومين الإنتاج مش معاينة", () => {
    expect(isPreviewHost("minis-system.vercel.app")).toBe(false);
  });

  it("⚠️ الدومين الخاص مش معاينة", () => {
    expect(isPreviewHost("gridpoint.app")).toBe(false);
    expect(isPreviewHost("app.gridpoint.com")).toBe(false);
  });

  it("البروتوكول والمسار مابيلخبطوش", () => {
    expect(isPreviewHost("https://minis-system-git-x-y.vercel.app/settings")).toBe(
      true
    );
    expect(isPreviewHost("HTTPS://Minis-System.Vercel.App")).toBe(false);
  });
});

describe("عنوان الويب هوك", () => {
  it("الإعداد الثابت بيكسب", () => {
    expect(
      webhookOrigin({ configured: "https://gridpoint.app", host: "whatever" })
    ).toBe("https://gridpoint.app");
  });

  it("السلاش الآخر بيتشال", () => {
    expect(webhookOrigin({ configured: "https://gridpoint.app/" })).toBe(
      "https://gridpoint.app"
    );
  });

  it("عنوان الصفحة بيتقبل لو مش معاينة", () => {
    expect(webhookOrigin({ host: "minis-system.vercel.app" })).toBe(
      "https://minis-system.vercel.app"
    );
  });

  it("⚠️⚠️ المعاينة عمرها ما تتسجّل — بترجع للدومين المعروف", () => {
    expect(
      webhookOrigin({ host: "minis-system-git-rating-minishome.vercel.app" })
    ).toBe(FALLBACK_ORIGIN);
  });

  it("⚠️ الكرون مالوش صفحة — بيرجع للدومين المعروف", () => {
    expect(webhookOrigin({})).toBe(FALLBACK_ORIGIN);
    expect(webhookOrigin({ host: null, configured: null })).toBe(FALLBACK_ORIGIN);
  });

  it("المسار الكامل", () => {
    expect(webhookCallbackUrl({ configured: "https://gridpoint.app" })).toBe(
      "https://gridpoint.app/api/shopify/webhooks"
    );
    expect(webhookCallbackUrl({})).toBe(
      `${FALLBACK_ORIGIN}/api/shopify/webhooks`
    );
  });

  it("⚠️ نفس العنوان في كل الحالات — الربط والكرون لازم يتفقوا", () => {
    // لو الاتنين اختلفوا، الكرون هيسجّل ويب هوك تاني جنب الأول
    const fromConnect = webhookCallbackUrl({ host: "minis-system.vercel.app" });
    const fromCron = webhookCallbackUrl({});
    expect(fromConnect).toBe(fromCron);
  });
});
