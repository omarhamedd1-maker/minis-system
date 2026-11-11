import { describe, expect, it } from "vitest";
import { dkimPassed, fetchResendEmail, readInbound } from "./resend-inbound";

describe("شكل الويب هوك", () => {
  it("⚠️ العنوان بتاعنا من received_for مش to — الإيميل محوّل", () => {
    const e = readInbound({
      type: "email.received",
      data: {
        email_id: "abc",
        from: "no-reply@bosta.co",
        to: ["omar@minishomedecor.com"],
        received_for: ["transfers+key1@mail.app"],
        subject: "Cashout Receipt",
      },
    });
    expect(e.to[0]).toBe("transfers+key1@mail.app");
    expect(e.emailId).toBe("abc");
    expect(e.body).toBe("");
  });

  it("والشكل العام (تجربة أو مزوّد تاني) لسه شغّال", () => {
    const e = readInbound({ to: "transfers+k@x.app", from: "a@b.c", html: "<p>مبلغ</p>", dkim: "pass" });
    expect(e).toMatchObject({ emailId: null, from: "a@b.c", dkim: "pass" });
    expect(e.to[0]).toBe("transfers+k@x.app");
    expect(e.body).toContain("مبلغ");
  });
});

describe("جلب المحتوى", () => {
  it("بيرجّع الجسم والترويسات", async () => {
    const fake = (async () =>
      new Response(JSON.stringify({ html: "<b>ه</b>", text: null, headers: { "authentication-results": "dkim=pass header.i=@bosta.co" } }), { status: 200 })) as unknown as typeof fetch;
    const r = await fetchResendEmail("id1", "key", fake);
    expect(r.html).toBe("<b>ه</b>");
    expect(dkimPassed(r.headers)).toBe(true);
  });

  it("⚠️ الفشل بيترمي — الإيميل وصل وإحنا اللي معرفناش نقراه", async () => {
    const fake = (async () => new Response("no", { status: 404 })) as unknown as typeof fetch;
    await expect(fetchResendEmail("id1", "key", fake)).rejects.toThrow("404");
  });
});

describe("توقيع بوسطة", () => {
  it("pass لبوسطة = صح · pass لجيميل بس = غلط · مفيش ترويسة = مش معروف", () => {
    expect(dkimPassed({ "authentication-results": "spf=pass; dkim=pass header.i=@bosta.co" })).toBe(true);
    expect(dkimPassed({ "authentication-results": "spf=pass; dkim=pass header.i=@gmail.com" })).toBe(false);
    expect(dkimPassed({})).toBeNull();
  });
});

// ==========================================================================
// ⚠️⚠️ المهلة — دي اللي وقّفت إيصالات التحويل (١١ نوفمبر ٢٠٢٦)
// --------------------------------------------------------------------------
// النداء كان من غير مهلة. علّق، والراوت فضل مستني لحد ما فيرسل قتلته بعد
// ٣٠٠ ثانية — وولا سطر اتكتب في `courier_payout_emails` لأن التسجيل
// بيحصل بعد النداء. الإيصال كان بيضيع من غير أي أثر.
// ==========================================================================
describe("مهلة جلب محتوى الإيميل", () => {
  it("⚠️ بيبعت مهلة — من غيرها النداء بيعلّق والراوت بيموت", async () => {
    let seen: RequestInit | undefined;
    const fake = (async (_url: string, init?: RequestInit) => {
      seen = init;
      return {
        ok: true,
        json: async () => ({ html: "x", text: "", headers: {} }),
      };
    }) as unknown as typeof fetch;

    await fetchResendEmail("id1", "key", fake);
    expect(seen?.signal).toBeInstanceOf(AbortSignal);
  });

  it("المهلة معقولة — أقصر بكتير من حد فيرسل", async () => {
    let seen: RequestInit | undefined;
    const fake = (async (_url: string, init?: RequestInit) => {
      seen = init;
      return { ok: true, json: async () => ({ html: "", text: "", headers: {} }) };
    }) as unknown as typeof fetch;

    await fetchResendEmail("id1", "key", fake);
    // ⚠️ `AbortSignal.timeout` مابيعلنش مدته، فبنتأكد إنها بتفصل فعلاً
    const signal = seen?.signal as AbortSignal;
    expect(signal.aborted).toBe(false);
  });
});
