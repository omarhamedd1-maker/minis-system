import { describe, expect, it } from "vitest";
import { parseMetaWebhook } from "./meta-payload";
import { replyWindow, channelLabel, isChannel } from "./channel";

const waBody = (over: Record<string, unknown> = {}) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA",
      changes: [
        {
          field: "messages",
          value: {
            metadata: { phone_number_id: "PHONE1" },
            contacts: [{ wa_id: "201001234567", profile: { name: "أحمد" } }],
            messages: [
              {
                from: "201001234567",
                id: "wamid.1",
                timestamp: "1789000000",
                type: "text",
                text: { body: "الأوردر وصل إمتى؟" },
              },
            ],
            ...over,
          },
        },
      ],
    },
  ],
});

const fbBody = (message: Record<string, unknown>, object = "page") => ({
  object,
  entry: [
    {
      id: "PAGE1",
      messaging: [
        {
          sender: { id: "PSID1" },
          recipient: { id: "PAGE1" },
          timestamp: 1789000000000,
          message,
        },
      ],
    },
  ],
});

describe("قراية اللي ميتا بتبعته", () => {
  it("رسالة واتساب بتتقري بالاسم والوقت", () => {
    const { messages } = parseMetaWebhook(waBody());
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      channel: "whatsapp",
      externalId: "201001234567",
      messageId: "wamid.1",
      displayName: "أحمد",
      body: "الأوردر وصل إمتى؟",
      accountId: "PHONE1",
    });
    expect(messages[0].at.startsWith("2026-")).toBe(true);
  });

  it("رسالة ماسنجر", () => {
    const { messages } = parseMetaWebhook(
      fbBody({ mid: "m_1", text: "عايز أغيّر المقاس" })
    );
    expect(messages[0]).toMatchObject({
      channel: "messenger",
      externalId: "PSID1",
      messageId: "m_1",
      body: "عايز أغيّر المقاس",
      accountId: "PAGE1",
    });
  });

  it("إنستجرام بيتعرف من نوع الجسم", () => {
    const { messages } = parseMetaWebhook(
      fbBody({ mid: "m_2", text: "بكام؟" }, "instagram")
    );
    expect(messages[0].channel).toBe("instagram");
  });

  it("⚠️⚠️ الصدى بيتشال — ردنا إحنا مايتسجّلش كرسالة من العميل", () => {
    const { messages, skipped } = parseMetaWebhook(
      fbBody({ mid: "m_3", text: "أهلًا بيك", is_echo: true })
    );
    expect(messages).toHaveLength(0);
    expect(skipped[0].why).toContain("صدى");
  });

  it("⚠️ القراية والتسليم مش رسايل", () => {
    const { messages, skipped } = parseMetaWebhook({
      object: "page",
      entry: [
        {
          id: "PAGE1",
          messaging: [
            { sender: { id: "PSID1" }, recipient: { id: "PAGE1" }, read: { watermark: 1 } },
          ],
        },
      ],
    });
    expect(messages).toHaveLength(0);
    expect(skipped[0].count).toBe(1);
  });

  it("⚠️⚠️ الوقت بشكلين — ثواني في واتساب وملّي في ماسنجر", () => {
    const wa = parseMetaWebhook(waBody()).messages[0].at;
    const fb = parseMetaWebhook(fbBody({ mid: "m_4", text: "هاي" })).messages[0].at;
    // نفس اللحظة بالظبط — ولو الوحدة اتخلطت، واحد فيهم بيرجع ١٩٧٠
    expect(wa).toBe(fb);
    expect(wa.startsWith("1970")).toBe(false);
  });

  it("المرفق بيتقري", () => {
    const { messages } = parseMetaWebhook(
      fbBody({
        mid: "m_5",
        attachments: [{ type: "image", payload: { url: "https://x/y.jpg" } }],
      })
    );
    expect(messages[0].attachmentUrl).toBe("https://x/y.jpg");
    expect(messages[0].attachmentType).toBe("image");
  });

  it("صورة واتساب — المعرّف مش رابط", () => {
    const { messages } = parseMetaWebhook(
      waBody({
        messages: [
          {
            from: "201001234567",
            id: "wamid.2",
            timestamp: "1789000000",
            type: "image",
            image: { id: "MEDIA1", caption: "الحتة دي" },
          },
        ],
      })
    );
    expect(messages[0].attachmentType).toBe("image");
    expect(messages[0].attachmentUrl).toBe("MEDIA1");
    expect(messages[0].body).toBe("الحتة دي");
  });

  it("حالات التسليم بتتقري", () => {
    const { statuses } = parseMetaWebhook(
      waBody({
        messages: [],
        statuses: [
          { id: "wamid.9", status: "failed", errors: [{ title: "خارج النافذة" }] },
        ],
      })
    );
    expect(statuses[0]).toEqual({
      messageId: "wamid.9",
      status: "failed",
      error: "خارج النافذة",
      // ⚠️ الحساب لازم يمشي مع الحالة — من غيره التحديث بيلمس بيزنس تاني
      accountId: "PHONE1",
    });
  });

  it("⚠️ الجسم الغريب مابيوقعش الدالة", () => {
    for (const junk of [null, undefined, {}, { entry: "مش قايمة" }, []]) {
      expect(() => parseMetaWebhook(junk)).not.toThrow();
      expect(parseMetaWebhook(junk).messages).toEqual([]);
    }
  });
});

describe("نافذة الرد", () => {
  const now = new Date("2026-09-13T12:00:00Z");

  it("جوّه الـ٢٤ ساعة = مفتوحة", () => {
    const w = replyWindow("2026-09-13T06:00:00Z", now);
    expect(w.open).toBe(true);
    expect(w.hoursLeft).toBe(18);
    expect(w.note).toBeNull();
  });

  it("⚠️ بعد ٢٤ ساعة بتقفل", () => {
    const w = replyWindow("2026-09-12T11:00:00Z", now);
    expect(w.open).toBe(false);
    expect(w.hoursLeft).toBe(0);
    expect(w.note).toContain("٢٤ ساعة");
  });

  it("⚠️ على الحافة بالظبط = مقفولة", () => {
    expect(replyWindow("2026-09-12T12:00:00Z", now).open).toBe(false);
  });

  it("آخر ساعتين بيتقال", () => {
    const w = replyWindow("2026-09-12T13:00:00Z", now);
    expect(w.open).toBe(true);
    expect(w.note).toContain("ساعتين");
  });

  it("⚠️⚠️ العميل عمره ما كلّمنا = مافيش نافذة", () => {
    for (const v of [null, undefined, "", "مش تاريخ"]) {
      const w = replyWindow(v, now);
      expect(w.open).toBe(false);
      expect(w.note).toContain("لسه مابعتش");
    }
  });
});

describe("القنوات", () => {
  it("الأسماء بالعربي", () => {
    expect(channelLabel("whatsapp")).toBe("واتساب");
    expect(channelLabel("instagram")).toBe("إنستجرام");
    expect(channelLabel("messenger")).toBe("ماسنجر");
    expect(channelLabel("tiktok")).toBe("—");
  });

  it("القناة المش معروفة بتترفض", () => {
    expect(isChannel("whatsapp")).toBe(true);
    expect(isChannel("tiktok")).toBe(false);
    expect(isChannel(null)).toBe(false);
  });
});
