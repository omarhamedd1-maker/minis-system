import { describe, expect, it } from "vitest";
import { RESERVED_SLUGS, SLUG_MAX, checkSlug, slugify } from "./tenant-slug";
import { displayEmail, isScopedTo, scopedEmail } from "./tenant-email";

describe("اقتراح الاسم المختصر من اسم البيزنس", () => {
  it("الاسم الإنجليزي بيتحوّل عادي", () => {
    expect(slugify("Minis Store")).toBe("minis-store");
    expect(slugify("  Omar's  Shop  ")).toBe("omars-shop");
    expect(slugify("Shop #2 — Cairo")).toBe("shop-2-cairo");
  });

  // **مقصود**: الترجمة الصوتية بتطلّع أسامي وحشة، والاسم ده بيبان لعملاء
  // المتجر في اللينك. الفاضي معناه «اسأل صاحبه»
  it("الاسم العربي بيرجع فاضي عشان صاحبه يكتبه بنفسه", () => {
    expect(slugify("مينيز")).toBe("");
    expect(slugify("متجر الأمل")).toBe("");
  });

  it("مابيسيبش شرطة في الأول ولا الآخر", () => {
    expect(slugify("--hello--")).toBe("hello");
    expect(slugify("!!shop!!")).toBe("shop");
  });

  it("بيقص الطويل من غير ما يسيب شرطة معلّقة", () => {
    const out = slugify("a".repeat(50));
    expect(out.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(out.endsWith("-")).toBe(false);
  });
});

describe("فحص الاسم المختصر", () => {
  it("الأسامي السليمة بتعدّي", () => {
    for (const s of ["minis-store", "shop2", "a1", "my-shop-2"]) {
      expect(checkSlug(s), s).toBe(null);
    }
  });

  it("العربي والمسافات بيترفضوا", () => {
    expect(checkSlug("متجر")).toBeTruthy();
    expect(checkSlug("my shop")).toBeTruthy();
    expect(checkSlug("Shop")).toBeTruthy(); // حروف كبيرة
  });

  it("الشرطة في الأطراف والمزدوجة بيترفضوا", () => {
    expect(checkSlug("-shop")).toBeTruthy();
    expect(checkSlug("shop-")).toBeTruthy();
    expect(checkSlug("my--shop")).toBeTruthy();
  });

  it("الأرقام لوحدها بتترفض", () => {
    expect(checkSlug("2026")).toBeTruthy();
    expect(checkSlug("a2026")).toBe(null);
  });

  it("الطول", () => {
    expect(checkSlug("a")).toBeTruthy();
    expect(checkSlug("a".repeat(SLUG_MAX + 1))).toBeTruthy();
  });

  // **مسارات السيستم لازم تفضل محجوزة** — متجر اسمه orders بيخلّي
  // اللينك غامض بينه وبين شاشة الأوردرات
  it("الأسامي المحجوزة بتترفض", () => {
    for (const s of ["orders", "login", "api", "www", "admin"]) {
      expect(checkSlug(s), s).toBeTruthy();
    }
    expect(RESERVED_SLUGS).toContain("settings");
  });

  // **كان محجوز بالغلط** — «مينيز» اسم متجر عمر نفسه، وأول اسم حاول
  // يحطه اترفض. اسم المنتج مكانه الدومين الرئيسي مش ساب دومين متجر
  it("«minis» مش محجوز — ده اسم متجر", () => {
    expect(checkSlug("minis")).toBe(null);
  });

  it("الفاضي بيترفض", () => {
    expect(checkSlug("")).toBeTruthy();
    expect(checkSlug("   ")).toBeTruthy();
  });
});

describe("الإيميل المبوّب بالمتجر", () => {
  it("بيتحط تبويب المتجر", () => {
    expect(scopedEmail("omar@gmail.com", "minis")).toBe("omar+minis@gmail.com");
  });

  it("**نفس الإيميل في متجرين = حسابين مختلفين**", () => {
    const a = scopedEmail("omar@gmail.com", "minis");
    const b = scopedEmail("omar@gmail.com", "shop2");
    expect(a).not.toBe(b);
  });

  it("بينضّف المسافات والحروف الكبيرة", () => {
    expect(scopedEmail("  Omar@Gmail.COM ", "Minis")).toBe("omar+minis@gmail.com");
  });

  it("مابيزوّدش تبويب مرتين", () => {
    const once = scopedEmail("omar@gmail.com", "minis");
    expect(scopedEmail(once, "minis")).toBe(once);
  });

  // **التبويب اللي كتبه صاحبه بيفضل** — a+work@x.com و a@x.com عنوانين
  // مختلفين عنده، ولو لمّيناهم كنا هنخلّي حسابين يتصادموا
  it("التبويب القديم مابيتشالش", () => {
    expect(scopedEmail("omar+work@gmail.com", "minis")).toBe(
      "omar+work+minis@gmail.com"
    );
  });

  it("الإيميل البايظ بيرجع زي ما هو", () => {
    expect(scopedEmail("مش إيميل", "minis")).toBe("مش إيميل");
    expect(scopedEmail("omar@gmail.com", "")).toBe("omar@gmail.com");
  });
});

describe("رجوع الإيميل لشكله المعروف", () => {
  it("بيشيل تبويب المتجر بس", () => {
    expect(displayEmail("omar+minis@gmail.com", "minis")).toBe("omar@gmail.com");
    expect(displayEmail("omar+work+minis@gmail.com", "minis")).toBe(
      "omar+work@gmail.com"
    );
  });

  it("**تبويب صاحبه مابيتشالش**", () => {
    expect(displayEmail("omar+work@gmail.com", "minis")).toBe(
      "omar+work@gmail.com"
    );
  });

  it("بيرجّع اللي دخل لو مش مبوّب", () => {
    expect(displayEmail("omar@gmail.com", "minis")).toBe("omar@gmail.com");
  });

  it("رايح وجاي بيرجّع الأصل", () => {
    const original = "omar@gmail.com";
    expect(displayEmail(scopedEmail(original, "minis"), "minis")).toBe(original);
  });
});

describe("هو مبوّب للمتجر ده؟", () => {
  it("بيفرّق", () => {
    expect(isScopedTo("omar+minis@gmail.com", "minis")).toBe(true);
    expect(isScopedTo("omar+shop2@gmail.com", "minis")).toBe(false);
    expect(isScopedTo("omar@gmail.com", "minis")).toBe(false);
    expect(isScopedTo("omar@gmail.com", "")).toBe(false);
  });
});
