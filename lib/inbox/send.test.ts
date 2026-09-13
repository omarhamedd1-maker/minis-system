import { describe, expect, it, vi } from "vitest";
import { sendMessage, missingCredentials, type SendTarget } from "./send";
import { signBody, verifySignature } from "./signature";

const base: SendTarget = {
  channel: "whatsapp",
  externalId: "201001234567",
  whatsappPhoneId: "PHONE1",
  whatsappToken: "T1",
  pageToken: "P1",
};

const reply = (body: unknown, ok = true, status = 200) =>
  vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;

describe("الرد على العميل", () => {
  it("واتساب بيروح على رقم البيزنس", async () => {
    const f = reply({ messages: [{ id: "wamid.out" }] });
    const r = await sendMessage(base, "تمام يا فندم", f);
    expect(r).toEqual({ ok: true, messageId: "wamid.out" });

    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/PHONE1/messages");
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.messaging_product).toBe("whatsapp");
    expect(sent.to).toBe("201001234567");
    expect(sent.text.body).toBe("تمام يا فندم");
  });

  it("ماسنجر وإنستجرام بنفس الشكل", async () => {
    for (const channel of ["messenger", "instagram"] as const) {
      const f = reply({ message_id: "m_out" });
      const r = await sendMessage(
        { ...base, channel, externalId: "PSID1" },
        "أهلًا",
        f
      );
      expect(r, channel).toEqual({ ok: true, messageId: "m_out" });
      const [url] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain("/me/messages");
    }
  });

  it("⚠️⚠️ رفض الـ٢٤ ساعة بيترجم لكلام مفهوم", async () => {
    const f = reply({ error: { code: 131047, message: "Re-engagement" } }, false, 400);
    const r = await sendMessage(base, "لسه فاكرني؟", f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("٢٤ ساعة");
  });

  it("التوكن المنتهي بيتقال صح", async () => {
    const f = reply({ error: { code: 190 } }, false, 401);
    const r = await sendMessage(base, "أهلًا", f);
    if (!r.ok) expect(r.error).toContain("انتهت صلاحيته");
  });

  it("⚠️ الرسالة الفاضية مابتروحش", async () => {
    const f = reply({});
    for (const v of ["", "   ", "\n"]) {
      const r = await sendMessage(base, v, f);
      expect(r.ok).toBe(false);
    }
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("⚠️ من غير ربط مافيش طلب أصلاً", async () => {
    const f = reply({});
    const r = await sendMessage(
      { ...base, whatsappToken: null },
      "أهلًا",
      f
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("مش متوصّل");
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("نقص الربط بيتقال لكل قناة باسمها", () => {
    expect(missingCredentials({ ...base, whatsappToken: null })).toContain("واتساب");
    expect(
      missingCredentials({ ...base, channel: "instagram", pageToken: null })
    ).toContain("إنستجرام");
    expect(
      missingCredentials({ ...base, channel: "messenger", pageToken: null })
    ).toContain("ماسنجر");
    expect(missingCredentials(base)).toBeNull();
  });

  it("العطل في الشبكة مابيرميش استثناء", async () => {
    const f = (async () => {
      throw new Error("انقطع");
    }) as unknown as typeof fetch;
    const r = await sendMessage(base, "أهلًا", f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("انقطع");
  });
});

describe("توقيع ميتا", () => {
  const secret = "s3cr3t";
  const raw = '{"object":"page","entry":[]}';

  it("التوقيع الصح بيعدّي", () => {
    expect(verifySignature(raw, signBody(raw, secret), secret)).toBe(true);
  });

  it("⚠️⚠️ أي حرف يتغيّر في الجسم والتوقيع بيفشل", () => {
    const sig = signBody(raw, secret);
    // نفس الداتا بشكل تاني — ده بالظبط اللي بيحصل مع JSON.stringify
    const restrung = JSON.stringify(JSON.parse(raw)) + " ";
    expect(verifySignature(restrung, sig, secret)).toBe(false);
  });

  it("⚠️ السرّ الغلط بيترفض", () => {
    expect(verifySignature(raw, signBody(raw, "tany"), secret)).toBe(false);
  });

  it("⚠️ الناقص بيترفض — مش بيعدّي", () => {
    const sig = signBody(raw, secret);
    expect(verifySignature(raw, null, secret)).toBe(false);
    expect(verifySignature(raw, sig, null)).toBe(false);
    expect(verifySignature(raw, sig, "")).toBe(false);
    expect(verifySignature(raw, "sha256=", secret)).toBe(false);
  });
});
