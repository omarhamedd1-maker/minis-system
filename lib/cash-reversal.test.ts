import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { auditFields, buildReversal, cashSourceNote, type ReversibleRow } from "./cash-reversal";
import { cashRowLabel } from "./cash-label";

const actor = { appUserId: "u1", fullName: "محمود", email: "m@x.com" };

const row = (over: Partial<ReversibleRow>): ReversibleRow => ({
  id: "c1",
  direction: "out",
  amount: 750,
  source_type: "expense",
  description: null,
  orders: null,
  expenses: { category: "إعلانات", description: "إنستجرام" },
  ...over,
});

describe("buildReversal", () => {
  it("نفس المبلغ والاتجاه بالعكس وبتاريخ النهارده", () => {
    const r = buildReversal(row({}), "t1", actor, "2026-09-16");
    expect(r).toMatchObject({
      tenant_id: "t1",
      direction: "in",
      amount: 750,
      source_type: "reversal",
      reversal_of: "c1",
      transaction_date: "2026-09-16",
      created_by: "u1",
      created_by_name: "محمود",
      origin: "app",
    });
  });

  it("الوصف بيقول اتلغى إيه — من بيانات الأصل قبل ما يتمسح", () => {
    expect(buildReversal(row({}), "t1", actor, "2026-09-16").description).toBe(
      "إلغاء: مصروف: إعلانات (إنستجرام)"
    );
  });

  it("إلغاء إيداع = سحب", () => {
    expect(
      buildReversal(row({ direction: "in", source_type: "manual", expenses: null }), "t1", null, "2026-09-16")
        .direction
    ).toBe("out");
  });

  it("⚠️ الرصيد بعد الإلغاء = الرصيد قبل الحركة", () => {
    const signed = (d: string, a: number) => (d === "in" ? a : -a);
    const orig = row({ direction: "out", amount: 320 });
    const rev = buildReversal(orig, "t1", actor, "2026-09-16");
    expect(signed(orig.direction, orig.amount) + signed(rev.direction, rev.amount)).toBe(0);
  });
});

describe("مصدر الحركة", () => {
  it("اسم اللي سجّل الأول، وبعدين الإيميل", () => {
    expect(auditFields(actor, "app").created_by_name).toBe("محمود");
    expect(auditFields({ ...actor, fullName: null }, "app").created_by_name).toBe("m@x.com");
    expect(auditFields(null, "prepaid")).toEqual({ created_by: null, created_by_name: null, origin: "prepaid" });
  });

  it("النص اللي بيتعرض", () => {
    expect(cashSourceNote({ created_by_name: "محمود", origin: "app" })).toBe("سجّلها محمود");
    expect(cashSourceNote({ origin: "bosta-cashout" })).toBe("من تحويل بوسطة");
    expect(cashSourceNote({ origin: "prepaid" })).toBe("من المدفوع مقدم");
    // الحركات القديمة مالهاش مصدر — مابنخمّنش
    expect(cashSourceNote({})).toBeNull();
  });
});

describe("اسم الحركة العكسية", () => {
  it("بيظهر وصفها مش كلمة إنجليزي", () => {
    expect(
      cashRowLabel({ direction: "in", source_type: "reversal", description: "إلغاء: سحب يدوي", orders: null, expenses: null })
    ).toBe("إلغاء: سحب يدوي");
  });
});

/**
 * ⚠️⚠️ **حركة الخزنة مابتتمسحش** — بتتلغي بحركة عكسية.
 * المسح المسموح: الرجوع عن عملية فشلت في نفس الطلب (الموردين)، والرجوع عن
 * استيراد كامل. (مسح بيزنس كامل بيمشي على الجداول كلها بالاسم في `lib/delete-tenant.ts`.) أي مكان جديد بيمسح لازم يتضاف هنا بسبب.
 */
describe("مافيش مسح لحركات الخزنة", () => {
  const root = join(__dirname, "..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name) && !name.includes(".test.")) files.push(p);
    }
  };
  walk(join(root, "app"));
  walk(join(root, "lib"));

  const ALLOWED: Record<string, number> = {
    // الرجوع عن دفعة مورد فشلت في نفس الطلب
    [join("app", "(dashboard)", "suppliers", "actions.ts")]: 2,
    // الرجوع عن استيراد كامل
    [join("lib", "import-runs.ts")]: 1,
  };

  it("كل مسح لحركة خزنة مكتوب سببه", () => {
    const found: Record<string, number> = {};
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const n = (src.match(/from\("cash_transactions"\)\s*\.delete\(/g) ?? []).length;
      if (n) found[f.slice(root.length + 1)] = n;
    }
    expect(found).toEqual(ALLOWED);
  });
});
