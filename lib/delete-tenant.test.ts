import { describe, expect, it } from "vitest";
import { TENANT_TABLES, confirmMatches } from "./delete-tenant";

describe("تأكيد الحذف — الاسم حرف بحرف", () => {
  // **مش زرار «متأكد؟»** — الزرار بيتداس بالغلط، والكتابة بتخلّي الواحد
  // يبص على اللي هيمسحه
  it("المطابق بس بيعدّي", () => {
    expect(confirmMatches("مينيز", "مينيز")).toBe(true);
    expect(confirmMatches("  مينيز  ", "مينيز")).toBe(true);
  });

  it("الناقص والزيادة والمختلف بيترفضوا", () => {
    expect(confirmMatches("مينيز", "مينيز ستور")).toBe(false);
    expect(confirmMatches("مين", "مينيز")).toBe(false);
    expect(confirmMatches("MINIS", "مينيز")).toBe(false);
  });

  it("الفاضي بيترفض — حتى لو الاسم نفسه فاضي", () => {
    expect(confirmMatches("", "مينيز")).toBe(false);
    expect(confirmMatches("   ", "مينيز")).toBe(false);
    expect(confirmMatches("", "")).toBe(false);
    expect(confirmMatches("  ", "  ")).toBe(false);
  });
});

describe("ترتيب المسح", () => {
  const at = (t: string) => TENANT_TABLES.indexOf(t as never);

  // المفاتيح الأجنبية بتمنع مسح الأب قبل ابنه
  it("الأبناء قبل الآباء", () => {
    expect(at("order_items")).toBeLessThan(at("orders"));
    expect(at("shipments")).toBeLessThan(at("orders"));
    expect(at("task_steps")).toBeLessThan(at("tasks"));
    expect(at("task_comments")).toBeLessThan(at("tasks"));
    expect(at("task_assignees")).toBeLessThan(at("tasks"));
    expect(at("product_variants")).toBeLessThan(at("products"));
    expect(at("supplier_transactions")).toBeLessThan(at("suppliers"));
    expect(at("orders")).toBeLessThan(at("customers"));
  });

  // دول ليهم خطوات خاصة في الآخر — الحسابات لازم تتمسح من نظام الدخول
  // كمان، و`roles.tenant_id` بـ`on delete restrict`
  it("الحسابات والأدوار والبيزنس مش في القايمة", () => {
    for (const t of ["app_users", "roles", "tenants"]) {
      expect(TENANT_TABLES).not.toContain(t);
    }
  });

  it("مافيش جدول مكرر", () => {
    expect(new Set(TENANT_TABLES).size).toBe(TENANT_TABLES.length);
  });
});
