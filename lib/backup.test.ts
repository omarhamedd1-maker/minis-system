import { describe, it, expect } from "vitest";
import {
  toCsv,
  buildBackup,
  backupSummary,
  tooBig,
  MAX_FILE_BYTES,
} from "./backup";

describe("النسخة الاحتياطية", () => {
  it("بيعمل ملف لكل جدول فيه صفوف", () => {
    const files = buildBackup({
      day: "2026-08-20",
      tables: [
        { name: "orders", rows: [{ id: 1 }, { id: 2 }] },
        { name: "customers", rows: [{ id: 9 }] },
      ],
    });
    expect(files.map((f) => f.name)).toEqual([
      "orders-2026-08-20.csv",
      "customers-2026-08-20.csv",
    ]);
    expect(files[0].rows).toBe(2);
  });

  it("⚠️ الجدول الفاضي مابيتبعتش", () => {
    const files = buildBackup({
      day: "2026-08-20",
      tables: [
        { name: "orders", rows: [{ id: 1 }] },
        { name: "expenses", rows: [] },
      ],
    });
    expect(files).toHaveLength(1);
  });

  it("⚠️ الأعمدة بتتجمع من كل الصفوف مش من الأول بس", () => {
    const csv = toCsv([{ a: 1 }, { a: 2, b: 3 }]);
    const [head, first, second] = csv.split("\r\n");
    expect(head).toBe('﻿"a","b"');
    expect(first).toBe('"1",""');
    expect(second).toBe('"2","3"');
  });

  it("⚠️ BOM في الأول عشان إكسيل يقرا العربي", () => {
    expect(toCsv([{ الاسم: "محمد" }]).startsWith("\ufeff")).toBe(true);
  });

  it("علامات التنصيص جوّه الداتا مابتكسرش الملف", () => {
    const csv = toCsv([{ note: 'قال "تمام"' }]);
    expect(csv).toContain('"قال ""تمام"""');
  });

  it("⚠️ الفاصلة والسطر الجديد جوّه الخانة مابيزحلقوش الأعمدة", () => {
    const csv = toCsv([{ a: "١، ٢", b: "سطر\nتاني" }]);
    expect(csv.split("\r\n")[1]).toBe('"١، ٢","سطر\nتاني"');
  });

  it("⚠️ الكائن بيتكتب JSON مش [object Object]", () => {
    expect(toCsv([{ x: { a: 1 } }])).toContain('"{""a"":1}"');
  });

  it("الفاضي بيتكتب فاضي مش null", () => {
    expect(toCsv([{ a: null, b: undefined }]).split("\r\n")[1]).toBe('"",""');
  });

  it("مافيش صفوف = مافيش ملفات", () => {
    expect(buildBackup({ day: "2026-08-20", tables: [] })).toEqual([]);
    expect(toCsv([])).toBe("\ufeff");
  });

  it("الملخّص بيقول العدد", () => {
    const files = buildBackup({
      day: "2026-08-20",
      tables: [
        { name: "orders", rows: [{ id: 1 }, { id: 2 }] },
        { name: "customers", rows: [{ id: 3 }] },
      ],
    });
    const text = backupSummary(files, "مينيز");
    expect(text).toContain("مينيز");
    expect(text).toContain("2 ملف");
    expect(text).toContain("3 صف");
  });

  it("مافيش داتا = جملة واضحة مش ملخّص بأصفار", () => {
    expect(backupSummary([])).toBe("مافيش داتا تتحفظ لسه.");
  });

  it("⚠️ الملف الكبير بيتعرف قبل ما تليجرام يرفضه", () => {
    const big = {
      name: "orders-2026-08-20.csv",
      content: "a".repeat(MAX_FILE_BYTES + 1),
      rows: 1,
    };
    expect(tooBig(big)).toBe(true);
    expect(tooBig({ ...big, content: "a" })).toBe(false);
  });
});
