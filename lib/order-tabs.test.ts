import { describe, expect, it } from "vitest";
import { ORDER_STATUS_OPTIONS } from "./format";
import { ORDER_TABS, resolveOrderTab, tabOfStatus } from "./order-tabs";

describe("تبويبات الأوردرات", () => {
  it("⚠️ كل حالة في تبويب واحد بالظبط", () => {
    const listed = ORDER_TABS.flatMap((t) => t.statuses);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual(ORDER_STATUS_OPTIONS.map((o) => o.value).sort());
  });

  it("الحالة بتفتح تبويبها", () => {
    expect(tabOfStatus("awaiting_action")?.key).toBe("work");
    expect(tabOfStatus("returning")?.key).toBe("transit");
    expect(tabOfStatus("cancelled")?.key).toBe("done");
    expect(tabOfStatus("كلام")).toBeNull();
  });

  it("الحالة بتكسب على التبويب اللي في اللينك · والغلط = الكل", () => {
    expect(resolveOrderTab("work", "delivered").key).toBe("done");
    expect(resolveOrderTab("transit", undefined).key).toBe("transit");
    expect(resolveOrderTab("xyz", undefined).key).toBe("all");
    expect(resolveOrderTab(undefined, "كلام").key).toBe("all");
  });
});
