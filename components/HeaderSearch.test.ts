import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { searchTarget } from "./HeaderSearch";

describe("البحث الذكي بيروح فين", () => {
  it("في الأوردرات بيبحث في الأوردرات ومحافظ على الحالة والفترة", () => {
    expect(searchTarget("/orders", "?status=new&period=7d&show=100&q=قديم", "أحمد")).toBe(
      "/orders?status=new&period=7d&q=%D8%A3%D8%AD%D9%85%D8%AF"
    );
  });

  it("في العملاء بيحافظ على الترتيب", () => {
    expect(searchTarget("/customers", "?sort=orders", "010")).toBe("/customers?sort=orders&q=010");
  });

  it("خانة فاضية في صفحة = مسح البحث", () => {
    expect(searchTarget("/products", "?q=كرسي", "  ")).toBe("/products");
  });

  it("أي صفحة تانية ← البحث العام", () => {
    expect(searchTarget("/cash", "?tab=expenses", "1288")).toBe("/search?q=1288");
    expect(searchTarget("/orders/123", "", "1288")).toBe("/search?q=1288");
  });
});

/**
 * ⚠️ **ممنوع خانة بحث جوّه الصفحات** (قرار عمر) — الأيقونة اللي فوق بس.
 * صفحة `/search` نفسها مستثناة: هي البحث العام.
 */
describe("مفيش بحث تاني جوّه الصفحات", () => {
  const root = join(__dirname, "..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".tsx")) files.push(p);
    }
  };
  walk(join(root, "app", "(dashboard)"));

  it("مافيش input اسمه q برّه صفحة البحث", () => {
    const hits = files
      .filter((f) => !f.includes(join("(dashboard)", "search")))
      .filter((f) => /name=["']q["']/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
