import { describe, expect, it } from "vitest";
import { findUnboundedReads } from "./unbounded-reads";

describe("findUnboundedReads", () => {
  it("قايمة من غير حد", () => {
    expect(findUnboundedReads(`const { data } = await db.from("orders").select("id").eq("tenant_id", t);`)).toEqual([
      { table: "orders", line: 1 },
    ]);
  });

  it("محدودة أو ملفوفة أو صف واحد = تمام", () => {
    const src = [
      `await db.from("orders").select("id").limit(50);`,
      `await db.from("orders").select("id").range(0, 9);`,
      `await db.from("orders").select("id").eq("id", x).maybeSingle();`,
      `await db.from("orders").select("id", { count: "exact", head: true });`,
      `await allRows(db\n  .from("orders")\n  .select("id")\n  .eq("tenant_id", t));`,
      `await db.from("orders").update({ a: 1 }).eq("tenant_id", t);`,
    ].join("\n");
    expect(findUnboundedReads(src)).toEqual([]);
  });

  it("السلسلة بتكمّل بعد تعليق وأنواع على كذا سطر", () => {
    const src = `const r = await db
  .from("orders")
  .select("id")
  // تعليق في النص
  .eq("tenant_id", t)
  .overrideTypes<
    { id: string }[]
  >()
  .limit(10);`;
    expect(findUnboundedReads(src)).toEqual([]);
  });

  it("تعليق في آخر الملف مابيعلّقش الفحص", () => {
    expect(findUnboundedReads(`await db.from("orders").select("id")\n  // آخر سطر`)).toEqual([
      { table: "orders", line: 1 },
    ]);
  });
});
