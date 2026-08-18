import { describe, expect, it } from "vitest";
import { planWebhooks } from "./register-webhooks";

const URL = "https://minis-system.vercel.app/api/shopify/webhooks";

describe("تسجيل الويب هوكس", () => {
  it("المتجر الفاضي بياخد الاتنين", () => {
    const p = planWebhooks([], URL);
    expect(p.toCreate).toEqual(["ORDERS_CREATE", "APP_UNINSTALLED"]);
    expect(p.alreadyOk).toEqual([]);
  });

  it("**الموجود مابيتعملش تاني** — الإعادة مالهاش ضرر", () => {
    const p = planWebhooks(
      [
        { topic: "ORDERS_CREATE", callbackUrl: URL },
        { topic: "APP_UNINSTALLED", callbackUrl: URL },
      ],
      URL
    );
    expect(p.toCreate).toEqual([]);
    expect(p.alreadyOk).toEqual(["ORDERS_CREATE", "APP_UNINSTALLED"]);
  });

  it("السلاش الأخير مابيعملش فرق", () => {
    const p = planWebhooks([{ topic: "ORDERS_CREATE", callbackUrl: URL + "/" }], URL);
    expect(p.alreadyOk).toContain("ORDERS_CREATE");
  });

  it("الناقص بس هو اللي بيتعمل", () => {
    const p = planWebhooks([{ topic: "ORDERS_CREATE", callbackUrl: URL }], URL);
    expect(p.toCreate).toEqual(["APP_UNINSTALLED"]);
  });

  it("**اللي على مسار تاني مابيتمسحش** — بنسجّل بتاعنا جنبه", () => {
    const other = "https://xyz.supabase.co/functions/v1/shopify-order";
    const p = planWebhooks([{ topic: "ORDERS_CREATE", callbackUrl: other }], URL);
    expect(p.toCreate).toContain("ORDERS_CREATE");
    expect(p.elsewhere).toEqual([{ topic: "ORDERS_CREATE", callbackUrl: other }]);
  });

  it("الموضوعات اللي مش بتاعتنا مابتتلمسش", () => {
    const p = planWebhooks(
      [{ topic: "PRODUCTS_UPDATE", callbackUrl: "https://x/y" }],
      URL
    );
    expect(p.elsewhere).toEqual([]);
    expect(p.toCreate).toEqual(["ORDERS_CREATE", "APP_UNINSTALLED"]);
  });
});
