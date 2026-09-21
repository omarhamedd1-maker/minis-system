import { describe, expect, it } from "vitest";
import { issueWindowNote, withinIssueWindow } from "./issues-since";

describe("مشاكل الأوردرات من تاريخ", () => {
  it("فاضي = كل حاجة بتبان", () => {
    expect(withinIssueWindow({ order_date: "2025-01-01" }, null)).toBe(true);
    expect(withinIssueWindow({ order_date: "2025-01-01" }, "")).toBe(true);
  });

  it("الأقدم من التاريخ بيتخفي واللي بعده بيبان", () => {
    expect(withinIssueWindow({ order_date: "2026-07-17T10:00:00Z" }, "2026-07-18")).toBe(false);
    expect(withinIssueWindow({ order_date: "2026-07-18T10:00:00Z" }, "2026-07-18")).toBe(true);
    expect(withinIssueWindow({ order_date: "2026-09-01T10:00:00Z" }, "2026-07-18")).toBe(true);
  });

  it("⚠️ الأوردر من غير تاريخ بيبان — إخفاؤه بيخفي مشكلة حقيقية", () => {
    expect(withinIssueWindow({ order_date: null, created_at: null }, "2026-07-18")).toBe(true);
  });

  it("مفيش تاريخ أوردر؟ بيستعمل تاريخ الإنشاء", () => {
    expect(withinIssueWindow({ order_date: null, created_at: "2026-01-01" }, "2026-07-18")).toBe(false);
  });

  it("⚠️ الفلتر لازم يبان — والسطر بيتقال بس لما يكون فيه متخفي فعلًا", () => {
    expect(issueWindowNote("2026-07-18", 12)).toContain("12");
    expect(issueWindowNote("2026-07-18", 0)).toBeNull();
    expect(issueWindowNote(null, 12)).toBeNull();
  });
});
