import { describe, expect, it } from "vitest";
import {
  MAX_FILE_BYTES,
  checkFile,
  ownsFile,
  safeExtension,
  storagePath,
} from "./task-files";

describe("فحص الملف قبل الرفع", () => {
  it("الصور وPDF بس", () => {
    expect(checkFile({ type: "image/jpeg", size: 1000 }).ok).toBe(true);
    expect(checkFile({ type: "application/pdf", size: 1000 }).ok).toBe(true);
    const bad = checkFile({ type: "application/x-msdownload", size: 1000 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain("PDF");
  });

  it("الكبير بيترفض", () => {
    const big = checkFile({ type: "image/png", size: MAX_FILE_BYTES + 1 });
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.error).toContain("٨ ميجا");
  });

  it("الفاضي بيترفض", () => {
    expect(checkFile({ type: "image/png", size: 0 }).ok).toBe(false);
  });
});

describe("مسار التخزين", () => {
  it("البيزنس والتاسك في المسار والاسم عشوائي", () => {
    expect(storagePath("t1", "k1", "المنتج.JPG", "u1")).toBe("t1/k1/u1.jpg");
  });

  it("**اسم الملف الأصلي مابيدخلش المسار**", () => {
    // اسم زي "../../x" أو فيه مسافات كان هيبقى مسار
    const p = storagePath("t1", "k1", "../../hack me.png", "u1");
    expect(p).toBe("t1/k1/u1.png");
    expect(p).not.toContain("..");
    expect(p).not.toContain(" ");
  });

  it("الامتداد المزدوج بياخد الأخير بس", () => {
    expect(safeExtension("x.jpg.exe")).toBe("exe");
    expect(safeExtension("مفيش امتداد")).toBe("bin");
    expect(safeExtension("")).toBe("bin");
  });
});

describe("المرفق تبع التاسك ده؟", () => {
  const files = [
    { path: "t1/k1/a.jpg", name: "أ.jpg" },
    { path: "t1/k1/b.png", name: "ب.png" },
  ];

  it("المسار المسجّل بس هو اللي بيعدّي", () => {
    expect(ownsFile(files, "t1/k1/a.jpg")).toBe(true);
  });

  it("**مسار من بيزنس تاني بيترفض**", () => {
    // ده الفحص اللي بيمنع حد يقرا مرفق مش بتاعه بإنه يبعت مساره
    expect(ownsFile(files, "t2/k9/secret.jpg")).toBe(false);
    expect(ownsFile([], "t1/k1/a.jpg")).toBe(false);
  });
});
