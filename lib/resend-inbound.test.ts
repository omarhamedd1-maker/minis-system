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
