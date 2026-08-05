import { describe, expect, it } from "vitest";
import {
  ANNOUNCE_MAX_DETAILS,
  ANNOUNCE_MAX_TITLE,
  announceLineCount,
  announceWarning,
  checkAnnouncement,
  composeAnnouncement,
} from "./announce";
import { plainText } from "./notify";

describe("شكل الإشعار المكتوب بالإيد", () => {
  it("العنوان فوق، وتحته مين باعت، وبعدين الكلام", () => {
    expect(
      composeAnnouncement({
        title: "الشحن هيتأخر النهاردة",
        details: "بوسطة قالت الساعة ٤ بدل ٢",
        sender: "عمر",
      })
    ).toBe("<b>الشحن هيتأخر النهاردة</b> 📣\nمن عمر\nبوسطة قالت الساعة ٤ بدل ٢");
  });

  // نفس السبب المكتوب في alert-messages: السطر اللي بيبدأ بإيموجي بيترمي شمال
  it("الإيموجي في آخر السطر مش أوله", () => {
    const out = composeAnnouncement({ title: "خبر", details: "", sender: "عمر" });
    expect(out.startsWith("📣")).toBe(false);
    expect(out.split("\n")[0].endsWith("📣")).toBe(true);
  });

  it("من غير كلام؟ سطرين بس، مفيش سطر فاضي", () => {
    expect(
      composeAnnouncement({ title: "اجتماع ٥", details: "", sender: "عمر" })
    ).toBe("<b>اجتماع ٥</b> 📣\nمن عمر");
  });

  it("السطور الفاضية بتتشال — بتاكل من الأربعة اللي الآيفون بيعرضهم", () => {
    const out = composeAnnouncement({
      title: "خبر",
      details: "سطر\n\n\nسطر تاني",
      sender: "عمر",
    });
    expect(announceLineCount(out)).toBe(4);
    expect(out).toContain("سطر\nسطر تاني");
  });

  it("العنوان بيفضل سطر واحد مهما اتكتب", () => {
    const out = composeAnnouncement({
      title: "سطر\nسطر تاني",
      details: "",
      sender: "عمر",
    });
    expect(out.split("\n")[0]).toBe("<b>سطر · سطر تاني</b> 📣");
  });

  it("الوسوم بتتشال قبل ما يطلع على الموبايل", () => {
    const out = composeAnnouncement({
      title: "الشحن اتأخر",
      details: "",
      sender: "عمر",
    });
    expect(plainText(out)).toBe("الشحن اتأخر 📣\nمن عمر");
  });
});

describe("الفحص قبل الإرسال — الإشعار مالوش تراجع", () => {
  it("من غير عنوان مايتبعتش", () => {
    const r = checkAnnouncement({ title: "  ", details: "كلام", sender: "عمر" });
    expect(r.ok).toBe(false);
  });

  it("العنوان الطويل بيترفض", () => {
    const r = checkAnnouncement({
      title: "ا".repeat(ANNOUNCE_MAX_TITLE + 1),
      details: "",
      sender: "عمر",
    });
    expect(r.ok).toBe(false);
  });

  it("الكلام الطويل بيترفض", () => {
    const r = checkAnnouncement({
      title: "خبر",
      details: "ا".repeat(ANNOUNCE_MAX_DETAILS + 1),
      sender: "عمر",
    });
    expect(r.ok).toBe(false);
  });

  it("الرسالة العادية بتعدّي", () => {
    expect(
      checkAnnouncement({ title: "خبر", details: "كلام", sender: "عمر" }).ok
    ).toBe(true);
  });
});

describe("تحذير القص على الآيفون", () => {
  it("٤ سطور أو أقل: مفيش تحذير", () => {
    const out = composeAnnouncement({
      title: "خبر",
      details: "سطر\nسطر تاني",
      sender: "عمر",
    });
    expect(announceWarning(out)).toBe(null);
  });

  it("أكتر من ٤: بيحذّر ومابيمنعش", () => {
    const out = composeAnnouncement({
      title: "خبر",
      details: "١\n٢\n٣\n٤",
      sender: "عمر",
    });
    expect(announceWarning(out)).toContain("بيتقص");
  });
});
