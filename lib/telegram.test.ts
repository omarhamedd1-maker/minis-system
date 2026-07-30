import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  discoverChats,
  failedDeliveryMessage,
  looksLikeChatId,
  sendTelegram,
  syncDownMessage,
} from "./telegram";

function fakeDb(creds: Record<string, unknown> | null): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: creds, error: null }) }),
      }),
    }),
  } as unknown as SupabaseClient;
}

const WIRED = {
  tenant_id: "t1",
  telegram_bot_token: "123:ABC",
  telegram_chat_id: "-100999",
};

describe("إرسال تليجرام", () => {
  it("بيبعت على جروب البيزنس بتوكنه", async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response);
    const res = await sendTelegram(fakeDb(WIRED), "t1", "تجربة", f as unknown as typeof fetch);

    expect(res).toEqual({ ok: true });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain("/bot123:ABC/sendMessage");
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      chat_id: "-100999",
      text: "تجربة",
    });
  });

  it("مش مظبّط = مابيحاولش يبعت", async () => {
    const f = vi.fn();
    const res = await sendTelegram(
      fakeDb({ tenant_id: "t1", telegram_bot_token: null, telegram_chat_id: null }),
      "t1",
      "تجربة",
      f as unknown as typeof fetch
    );
    expect(res).toEqual({ ok: false, reason: "not_configured" });
    expect(f).not.toHaveBeenCalled();
  });

  it("تليجرام رفض = بيرجّع سببه مش بيرمي", async () => {
    const f = vi.fn(
      async () =>
        ({
          ok: false,
          status: 400,
          json: async () => ({ description: "chat not found" }),
        }) as Response
    );
    const res = await sendTelegram(fakeDb(WIRED), "t1", "x", f as unknown as typeof fetch);
    expect(res).toMatchObject({ ok: false, reason: "failed", error: "chat not found" });
  });

  it("الشبكة وقعت = مابيرميش برّه", async () => {
    const f = vi.fn(async () => {
      throw new Error("timeout");
    });
    const res = await sendTelegram(fakeDb(WIRED), "t1", "x", f as unknown as typeof fetch);
    expect(res).toMatchObject({ ok: false, reason: "failed" });
  });
});

describe("نص التنبيه", () => {
  const base = {
    orderNumber: "1359",
    customerName: "شيماء خالد",
    customerPhone: "01001234567",
    tracking: "8187675582",
    reason: "العميل مش بيرد",
  };

  it("لسه في الطريق = كلّم العميل", () => {
    const m = failedDeliveryMessage({ ...base, arrived: false });
    expect(m).toContain("العميل مستلمش");
    expect(m).toContain("1359");
    expect(m).toContain("شيماء خالد");
    expect(m).toContain("01001234567");
    expect(m).toContain("العميل مش بيرد");
    expect(m).toContain("كلّم العميل");
  });

  it("وصل خلاص = راجع المخزون والفلوس", () => {
    const m = failedDeliveryMessage({ ...base, arrived: true });
    expect(m).toContain("رجع ومتسلّمش");
    expect(m).toContain("راجع المخزون");
  });

  it("بيستحمل البيانات الناقصة", () => {
    const m = failedDeliveryMessage({
      orderNumber: null,
      customerName: null,
      customerPhone: null,
      tracking: null,
      reason: null,
      arrived: false,
    });
    expect(m).toContain("العميل مستلمش");
    expect(m).not.toContain("undefined");
    expect(m).not.toContain("null");
  });

  it("تنبيه المزامنة بيقول النتيجة بوضوح", () => {
    const m = syncDownMessage("واقفة من ١٢٠ دقيقة");
    expect(m).toContain("المزامنة مع بوسطة واقفة");
    expect(m).toContain("الأرقام في السيستم قديمة");
  });
});

describe("لقط الجروب لوحده", () => {
  const updates = (result: unknown[]) =>
    vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, result }) }) as Response);

  it("بيلاقي الجروب من الرسايل", async () => {
    const f = updates([
      { message: { chat: { id: -1001, title: "مينيز - تنبيهات" } } },
      { message: { chat: { id: -1001, title: "مينيز - تنبيهات" } } },
    ]);
    const r = await discoverChats("123:ABC", f as unknown as typeof fetch);
    if (!r.ok) throw new Error(r.error);
    // المكرر بيتشال
    expect(r.chats).toEqual([{ id: "-1001", title: "مينيز - تنبيهات" }]);
  });

  it("بيلاقيه كمان من إضافة البوت للجروب", async () => {
    const f = updates([
      { my_chat_member: { chat: { id: -2002, title: "جروب تاني" } } },
    ]);
    const r = await discoverChats("123:ABC", f as unknown as typeof fetch);
    if (!r.ok) throw new Error(r.error);
    expect(r.chats[0].id).toBe("-2002");
  });

  it("مفيش رسايل = قايمة فاضية مش خطأ", async () => {
    const r = await discoverChats("123:ABC", updates([]) as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, chats: [] });
  });

  it("توكن غلط = رسالة تليجرام نفسها", async () => {
    const f = vi.fn(
      async () =>
        ({
          ok: false,
          status: 401,
          json: async () => ({ ok: false, description: "Unauthorized" }),
        }) as Response
    );
    const r = await discoverChats("bad", f as unknown as typeof fetch);
    expect(r).toEqual({ ok: false, error: "Unauthorized" });
  });

  it("توكن فاضي مابيحاولش", async () => {
    const f = vi.fn();
    const r = await discoverChats("  ", f as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("شكل رقم الجروب", () => {
  it("بيقبل أرقام الجروبات والقنوات", () => {
    expect(looksLikeChatId("-5129764895")).toBe(true);
    expect(looksLikeChatId("-1001234567890")).toBe(true);
    expect(looksLikeChatId("123456789")).toBe(true);
    expect(looksLikeChatId("@minis_alerts")).toBe(true);
  });

  it("بيرفض اللي المتصفح بيحطه autofill", () => {
    // دي حصلت فعلًا: المتصفح حطّ الإيميل، اتحفظ، وفشل الإرسال بـ chat not found
    expect(looksLikeChatId("omarhamedd1@gmail.com")).toBe(false);
    expect(looksLikeChatId("Omar Hamed")).toBe(false);
    expect(looksLikeChatId("01001234567 ")).toBe(true); // تليفون شكله رقم — بس التجربة هي اللي بتكشفه
    expect(looksLikeChatId("")).toBe(false);
    expect(looksLikeChatId(null)).toBe(false);
  });
});
