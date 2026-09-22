import { describe, expect, it } from "vitest";
import {
  gmailConfirmLink,
  keyFromAddress,
  payoutAddress,
  setupSteps,
} from "./payout-address";

/**
 * ⚠️ **ده جسم رسالة حقيقية وصلت** (٢٢ سبتمبر ٢٠٢٦) — مش مثال مكتوب
 * بالإيد. فيها **رابطين** ورقم مقال مساعدة، والتلاتة كانوا فخ:
 * `uf-` بيلغي الطلب، و١٨٤٩٧٣ رقم مقال اتعرض كأنه كود.
 */
const REAL_SUBJECT =
  "(Gmail Forwarding Confirmation - Receive Mail from omarhamedd1@gmail.com";
const REAL = [
  "omarhamedd1@gmail.com has requested to automatically forward mail to your",
  "email address transfers+bf55@ildobkrou.resend.app.",
  "To allow it, please click the link below to confirm the request:",
  "https://mail.google.com/mail/vf-%5BANGjdJ9e4eXp5hKey8Wz%5D-158Amv9LHmEse",
  "If you do not approve of this request, click:",
  "https://mail.google.com/mail/uf-%5BANGjdJ_7_PEARZi1RyJJ%5D-158Amv9LHmEse",
  "Learn more at http://support.google.com/mail/bin/answer.py?answer=184973.",
].join("\n");

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

  it("رابط التأكيد بيتقري من الرسالة الحقيقية", () => {
    expect(gmailConfirmLink(REAL_SUBJECT, REAL)).toBe(
      "https://mail.google.com/mail/vf-%5BANGjdJ9e4eXp5hKey8Wz%5D-158Amv9LHmEse"
    );
  });

  it("⚠️⚠️ بياخد vf- مش uf- — الرابط التاني بيلغي الطلب", () => {
    const link = gmailConfirmLink(REAL_SUBJECT, REAL);
    expect(link).toContain("/vf-");
    expect(link).not.toContain("/uf-");
  });

  it("⚠️⚠️ رسالة فيها uf- بس مابترجّعش حاجة — أحسن من رابط بيلغي", () => {
    const onlyDeny = [
      "Gmail Forwarding Confirmation",
      "https://mail.google.com/mail/uf-%5Bxyz%5D-abc",
    ].join("\n");
    expect(gmailConfirmLink("Gmail Forwarding Confirmation", onlyDeny)).toBeNull();
  });

  it("⚠️ مافيش استخراج «كود» خالص — الرقم اللي كان بيطلع رقم مقال مساعدة", () => {
    // الرسالة الحقيقية فيها ١٨٤٩٧٣، ولازم مايبانش في أي حتة
    expect(REAL).toContain("184973");
    expect(gmailConfirmLink(REAL_SUBJECT, REAL)).not.toContain("184973");
  });

  it("رابط جيميل في إيميل مش تأكيد مابيتحسبش", () => {
    expect(
      gmailConfirmLink("Cashout Receipt", "https://mail.google.com/mail/vf-x")
    ).toBeNull();
  });

  it("الرموز المهرّبة في الرابط بترجع زي ما هي", () => {
    expect(
      gmailConfirmLink("Gmail Forwarding Confirmation", "https://mail.google.com/mail/vf-a&amp;b")
    ).toBe("https://mail.google.com/mail/vf-a&b");
  });

  it("خطوات الإعداد فيها العنوان نفسه", () => {
    const steps = setupSteps("transfers+abc@minis.app");
    expect(steps.some((s) => s.includes("transfers+abc@minis.app"))).toBe(true);
    expect(steps.some((s) => s.includes("أكّد التحويل"))).toBe(true);
  });
});
