import { describe, expect, it } from "vitest";
import { gmailConfirmationCode, keyFromAddress, payoutAddress, setupSteps } from "./payout-address";

describe("العنوان السري", () => {
  it("بيتبني من المفتاح والدومين", () => {
    expect(payoutAddress("abc123", "minis.app")).toBe("transfers+abc123@minis.app");
    expect(payoutAddress("abc123", "https://minis.app/anything")).toBe("transfers+abc123@minis.app");
  });

  it("ناقص = مفيش عنوان — مش عنوان نص مكسور", () => {
    expect(payoutAddress(null, "minis.app")).toBeNull();
    expect(payoutAddress("abc", "")).toBeNull();
  });

  it("⚠️ المفتاح بيتقرا من العنوان مهما كان شكل الحقل", () => {
    expect(keyFromAddress("transfers+abc123@minis.app")).toBe("abc123");
    expect(keyFromAddress('"التحويلات" <Transfers+ABC123@Minis.app>')).toBe("abc123");
    expect(keyFromAddress("someone@else.com")).toBeNull();
    expect(keyFromAddress(null)).toBeNull();
  });

  it("كود تأكيد جيميل بيتقري — وغيره لأ", () => {
    expect(gmailConfirmationCode("Gmail Forwarding Confirmation", "الكود 123456789")).toBe("123456789");
    expect(gmailConfirmationCode("Cashout Receipt", "المبلغ 3671.63")).toBeNull();
  });

  it("خطوات الإعداد فيها العنوان نفسه", () => {
    const steps = setupSteps("transfers+abc@minis.app");
    expect(steps.some((s) => s.includes("transfers+abc@minis.app"))).toBe(true);
    expect(steps.some((s) => s.includes("كود تأكيد"))).toBe(true);
  });
});
