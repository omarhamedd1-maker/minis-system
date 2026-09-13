import { describe, expect, it, vi } from "vitest";
import { exchangeCode, subscribeWaba, readSessionInfo } from "./meta-oauth";
import { parseMetaWebhook } from "./meta-payload";

const reply = (body: unknown, ok = true, status = 200) =>
  vi.fn(async () => ({ ok, status, json: async () => body })) as unknown as typeof fetch;

describe("الربط بضغطة", () => {
  it("الكود بيتبدّل بتوكن", async () => {
    const f = reply({ access_token: "BIZ_TOKEN" });
    const r = await exchangeCode("CODE1", "APP", "SECRET", f);
    expect(r).toEqual({ ok: true, token: "BIZ_TOKEN" });

    const [url] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("client_id=APP");
    expect(url).toContain("code=CODE1");
  });

  it("⚠️⚠️ الكود اللي خلص وقته بيتقال بالعربي مش برقم", () => {
    // ميتا بترد «Invalid verification code» وده بيتقري كأن الحساب غلط
    return exchangeCode("OLD", "APP", "SECRET", reply({ error: { code: 100 } }, false, 400)).then(
      (r) => {
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toContain("خلص وقته");
      }
    );
  });

  it("⚠️ من غير تطبيق مافيش طلب أصلاً", async () => {
    const f = reply({});
    for (const [id, secret] of [
      [null, "S"],
      ["A", null],
      ["", ""],
    ] as [string | null, string | null][]) {
      const r = await exchangeCode("CODE", id, secret, f);
      expect(r.ok).toBe(false);
    }
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("⚠️ الكود الفاضي بيترفض", async () => {
    const r = await exchangeCode("  ", "APP", "SECRET", reply({}));
    expect(r.ok).toBe(false);
  });

  it("الاشتراك في ويب هوك واتساب", async () => {
    const f = reply({ success: true });
    expect(await subscribeWaba("WABA1", "T", f)).toEqual({ ok: true });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/WABA1/subscribed_apps");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("⚠️ فشل الاشتراك بيترجّع — مش بيعدّي ساكت", async () => {
    const r = await subscribeWaba("WABA1", "T", reply({ error: { message: "مالكش صلاحية" } }, false, 403));
    expect(r.ok).toBe(false);
    expect(r.error).toBe("مالكش صلاحية");
  });

  it("معلومات الجلسة بتتقري", () => {
    const got = readSessionInfo({
      type: "WA_EMBEDDED_SIGNUP",
      data: {
        waba_id: "W1",
        phone_number_id: "P1",
        business_id: "B1",
        page_ids: ["PG1", "PG2"],
        instagram_account_ids: ["IG1"],
      },
    });
    expect(got).toEqual({
      wabaId: "W1",
      phoneNumberId: "P1",
      businessId: "B1",
      pageId: "PG1",
      instagramAccountId: "IG1",
    });
  });

  it("⚠️ الناقص بيفضل فاضي — مابيوقفش الربط", () => {
    // اللي ربط واتساب بس مافيش عنده صفحة، والعكس
    const onlyWa = readSessionInfo({ data: { waba_id: "W1", phone_number_id: "P1" } });
    expect(onlyWa.pageId).toBeNull();
    expect(onlyWa.instagramAccountId).toBeNull();

    for (const junk of [null, undefined, {}, "نص", 5]) {
      expect(() => readSessionInfo(junk)).not.toThrow();
    }
  });
});

describe("صدى واتساب — رد صاحب المتجر من موبايله", () => {
  const echoBody = (over: Record<string, unknown> = {}) => ({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "smb_message_echoes",
            value: {
              metadata: { phone_number_id: "PHONE1" },
              message_echoes: [
                {
                  to: "201001234567",
                  id: "wamid.echo",
                  timestamp: "1789000000",
                  type: "text",
                  text: { body: "أهلًا، الأوردر طلع النهاردة" },
                },
              ],
              ...over,
            },
          },
        ],
      },
    ],
  });

  it("⚠️⚠️ بيتسجّل كرد مننا — مش بيترمي", () => {
    const { messages } = parseMetaWebhook(echoBody());
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      channel: "whatsapp",
      direction: "out",
      // المعرّف بتاع **المستقبل** — الصدى رايح مش جاي
      externalId: "201001234567",
      messageId: "wamid.echo",
      body: "أهلًا، الأوردر طلع النهاردة",
      accountId: "PHONE1",
    });
  });

  it("⚠️ وصدى ماسنجر بيفضل متشال — ده نسختنا راجعة لنا", () => {
    const { messages, skipped } = parseMetaWebhook({
      object: "page",
      entry: [
        {
          id: "PAGE1",
          messaging: [
            {
              sender: { id: "PAGE1" },
              recipient: { id: "PSID1" },
              timestamp: 1789000000000,
              message: { mid: "m_e", text: "ردنا", is_echo: true },
            },
          ],
        },
      ],
    });
    expect(messages).toHaveLength(0);
    expect(skipped[0].why).toContain("صدى");
  });

  it("⚠️ الصدى من غير مستقبل بيتساب", () => {
    const { messages, skipped } = parseMetaWebhook(
      echoBody({ message_echoes: [{ id: "wamid.x", timestamp: "1789000000", type: "text" }] })
    );
    expect(messages).toHaveLength(0);
    expect(skipped[0].why).toContain("مستقبل");
  });

  it("الرسالة الجاية لسه direction in", () => {
    const { messages } = parseMetaWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "PHONE1" },
                messages: [
                  { from: "201001234567", id: "wamid.in", timestamp: "1789000000", type: "text", text: { body: "أهلًا" } },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(messages[0].direction).toBe("in");
  });
});
