import { describe, it, expect, vi } from "vitest";
import { sendTelegramMessage, sendTelegramFile } from "./telegram";

const okRes = () => new Response("{}", { status: 200 });

describe("تليجرام", () => {
  it("الرسالة بتروح على الشات الصح", async () => {
    const f = vi.fn(async () => okRes());
    const r = await sendTelegramMessage("T", "-100", "نسخة اليوم", f as never);
    expect(r.ok).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/botT/sendMessage");
    expect(JSON.parse(String(init.body))).toMatchObject({
      chat_id: "-100",
      text: "نسخة اليوم",
    });
  });

  it("⚠️ سبب الرفض بيتقرا من رد تليجرام مش «فشل»", async () => {
    const f = vi.fn(
      async () =>
        new Response(JSON.stringify({ description: "chat not found" }), {
          status: 400,
        })
    );
    const r = await sendTelegramMessage("T", "-1", "x", f as never);
    expect(r).toEqual({ ok: false, error: "chat not found" });
  });

  it("الرد اللي مش JSON بيرجّع الكود", async () => {
    const f = vi.fn(async () => new Response("nope", { status: 502 }));
    const r = await sendTelegramMessage("T", "-1", "x", f as never);
    expect(r.error).toContain("502");
  });

  it("⚠️ الشبكة الواقعة بترجّع نتيجة مش استثناء", async () => {
    const f = vi.fn(async () => {
      throw new Error("network");
    });
    await expect(
      sendTelegramMessage("T", "-1", "x", f as never)
    ).resolves.toEqual({ ok: false, error: "معرفناش نوصل لتليجرام" });
  });

  it("⚠️ الملف بيتبعت بمحتواه مش باسمه بس", async () => {
    const f = vi.fn(async () => okRes());
    const r = await sendTelegramFile(
      "T",
      "-100",
      { name: "orders.csv", content: "a,b\r\n1,2" },
      "نسخة",
      f as never
    );
    expect(r.ok).toBe(true);

    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/sendDocument");
    const form = init.body as FormData;
    const doc = form.get("document") as File;
    expect(doc.name).toBe("orders.csv");
    expect(await doc.text()).toBe("a,b\r\n1,2");
    expect(form.get("caption")).toBe("نسخة");
  });

  it("من غير كابشن مافيش خانة كابشن", async () => {
    const f = vi.fn(async () => okRes());
    await sendTelegramFile("T", "-1", { name: "a.csv", content: "x" }, null, f as never);
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.body as FormData).get("caption")).toBeNull();
  });
});
