import { describe, expect, it } from "vitest";
import {
  allStepsDone,
  dueLabel,
  isOverdue,
  sortTasks,
  stepsProgress,
  taskStatusBadge,
} from "./tasks";

const TODAY = "2026-08-04";

describe("التاسك المتأخر", () => {
  it("ميعاده فات ولسه مخلصش = متأخر", () => {
    expect(isOverdue({ status: "open", priority: "normal", due_on: "2026-08-01" }, TODAY)).toBe(true);
  });

  it("**اللي خلص عمره ما يبقى متأخر**", () => {
    // من غير ده نص اللوحة كانت هتبقى حمرا على شغل خلصان
    expect(isOverdue({ status: "done", priority: "normal", due_on: "2026-07-01" }, TODAY)).toBe(false);
  });

  it("ميعاده النهاردة مش متأخر", () => {
    expect(isOverdue({ status: "open", priority: "normal", due_on: TODAY }, TODAY)).toBe(false);
  });

  it("مالوش ميعاد مايتأخرش", () => {
    expect(isOverdue({ status: "open", priority: "urgent", due_on: null }, TODAY)).toBe(false);
  });
});

describe("كتابة الميعاد", () => {
  it("بيكتب النهاردة وبكرة وامبارح بالكلام", () => {
    expect(dueLabel(TODAY, TODAY)).toBe("النهاردة");
    expect(dueLabel("2026-08-05", TODAY)).toBe("بكرة");
    expect(dueLabel("2026-08-03", TODAY)).toBe("امبارح");
  });

  it("المتأخر بيقول متأخر كام يوم", () => {
    expect(dueLabel("2026-07-30", TODAY)).toBe("متأخر 5 يوم");
  });

  it("الجاي القريب بالأيام والبعيد بالتاريخ", () => {
    expect(dueLabel("2026-08-08", TODAY)).toBe("بعد 4 أيام");
    expect(dueLabel("2026-12-01", TODAY)).toBe("2026-12-01");
  });

  it("مافيش ميعاد = مافيش نص", () => {
    expect(dueLabel(null, TODAY)).toBeNull();
  });
});

describe("ترتيب اللوحة", () => {
  const t = (over: Partial<Parameters<typeof sortTasks>[0][number]> & { id: string }) => ({
    status: "open",
    priority: "normal",
    due_on: null,
    created_at: "2026-08-01T10:00:00Z",
    ...over,
  });

  it("المتأخر فوق، وبعده العاجل، وبعده العادي، والخلصان تحت", () => {
    const out = sortTasks(
      [
        t({ id: "خلص", status: "done", priority: "urgent" }),
        t({ id: "عادي" }),
        t({ id: "عاجل", priority: "urgent" }),
        t({ id: "متأخر", due_on: "2026-08-01" }),
      ],
      TODAY
    );
    expect(out.map((x) => x.id)).toEqual(["متأخر", "عاجل", "عادي", "خلص"]);
  });

  it("جوّه نفس الرتبة: الأقرب ميعادًا الأول", () => {
    const out = sortTasks(
      [
        t({ id: "بعدين", due_on: "2026-08-20" }),
        t({ id: "قريب", due_on: "2026-08-06" }),
      ],
      TODAY
    );
    expect(out.map((x) => x.id)).toEqual(["قريب", "بعدين"]);
  });

  it("اللي ليه ميعاد قبل اللي مالوش", () => {
    const out = sortTasks(
      [t({ id: "مالوش" }), t({ id: "ليه", due_on: "2026-08-20" })],
      TODAY
    );
    expect(out.map((x) => x.id)).toEqual(["ليه", "مالوش"]);
  });

  it("مابيغيّرش القايمة الأصلية", () => {
    const list = [t({ id: "a" }), t({ id: "b", priority: "urgent" })];
    sortTasks(list, TODAY);
    expect(list.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("تقدّم الخطوات", () => {
  it("بيحسب النسبة", () => {
    expect(stepsProgress([{ done: true }, { done: false }, { done: true }, { done: false }]))
      .toMatchObject({ done: 2, total: 4, percent: 50 });
  });

  it("مافيش خطوات = صفر مش قسمة على صفر", () => {
    expect(stepsProgress([])).toMatchObject({ done: 0, total: 0, percent: 0 });
  });

  it("**التاسك اللي مالوش خطوات مايقفلش لوحده**", () => {
    // صفر من صفر مش مية في المية — ده بيخلص لما صاحبه يقول
    expect(allStepsDone([])).toBe(false);
    expect(allStepsDone([{ done: true }, { done: true }])).toBe(true);
    expect(allStepsDone([{ done: true }, { done: false }])).toBe(false);
  });
});

describe("شريحة الحالة", () => {
  it("بتعرف الحالات المعروفة", () => {
    expect(taskStatusBadge("doing").label).toBe("شغال عليه");
    expect(taskStatusBadge("done").label).toBe("خلص");
  });

  it("الحالة الغريبة مابتكسرش الشاشة", () => {
    expect(taskStatusBadge("whatever").label).toBe("whatever");
    expect(taskStatusBadge(null).label).toBe("مفتوح");
  });
});
