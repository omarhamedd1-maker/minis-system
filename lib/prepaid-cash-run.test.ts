import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordPrepaidCash } from "./prepaid-cash-run";

type OrderRow = {
  id: string;
  order_number: string;
  amount_paid: number;
  payment_method: string;
  order_date: string;
};

type CashDbRow = {
  id: string;
  direction: string;
  amount: number;
  description: string | null;
  related_order_id: string | null;
  transaction_date: string;
  source_type: string | null;
};

/**
 * قاعدة بيانات وهمية — بترجّع الأوردرات والخزنة، وبتسجّل اللي اتكتب.
 *
 * ⚠️ **بتقبل أي عدد فلاتر** — التثبيت على عدد بيخلّي الاختبار يقع أول ما
 * يتضاف فلتر، وده بيقيس شكل الاستعلام مش النتيجة.
 */
function fakeDb(
  orders: OrderRow[],
  cash: CashDbRow[],
  wrote: { inserted: unknown[]; updated: unknown[] },
  cashError = false
): SupabaseClient {
  const make = (rows: unknown[], error: boolean) => {
    const chain: Record<string, unknown> = {};
    for (const k of ["eq", "gt", "neq", "order"]) chain[k] = () => chain;
    // صفحة صفحة (allRows) — الصفحة الأولى فيها كل الصفوف، والتانية فاضية
    let from = 0;
    chain.range = (f: number) => {
      from = f;
      return chain;
    };
    chain.then = (resolve: (v: unknown) => void) =>
      resolve({
        data: error ? null : from === 0 ? rows : [],
        error: error ? { message: "الجدول مقفول" } : null,
      });
    return chain;
  };

  return {
    from: (table: string) => ({
      select: () =>
        table === "orders" ? make(orders, false) : make(cash, cashError),
      insert: async (row: unknown) => {
        wrote.inserted.push(row);
        return { error: null };
      },
      update: (row: unknown) => {
        const chain: Record<string, unknown> = {};
        chain.eq = () => chain;
        // آخر `eq` هي اللي بتنفّذ — فبنسجّل مرة واحدة
        (chain as { then: unknown }).then = (
          resolve: (v: { error: null }) => void
        ) => {
          wrote.updated.push(row);
          resolve({ error: null });
        };
        return chain;
      },
    }),
  } as unknown as SupabaseClient;
}

const TENANT = "t1";

describe("تسجيل المقدم في الخزنة", () => {
  it("بيسجّل الأوردر اللي مالوش سطر", async () => {
    const wrote = { inserted: [] as unknown[], updated: [] as unknown[] };
    const out = await recordPrepaidCash({
      db: fakeDb(
        [
          {
            id: "o1",
            order_number: "1500",
            amount_paid: 300,
            payment_method: "instapay",
            order_date: "2026-08-01",
          },
        ],
        [
          {
            id: "c0",
            direction: "in",
            amount: 23250,
            description: "رصيد افتتاحي",
            related_order_id: null,
            transaction_date: "2026-07-18",
            source_type: "manual",
          },
        ],
        wrote
      ),
      tenantId: TENANT,
    });

    expect(out.added).toBe(1);
    expect(wrote.inserted).toHaveLength(1);
  });

  it("⚠️ القراية لو فشلت بنقف — مانكتبش حاجة", async () => {
    const wrote = { inserted: [] as unknown[], updated: [] as unknown[] };
    const out = await recordPrepaidCash({
      db: fakeDb(
        [
          {
            id: "o1",
            order_number: "1500",
            amount_paid: 300,
            payment_method: "instapay",
            order_date: "2026-08-01",
          },
        ],
        [],
        wrote,
        true
      ),
      tenantId: TENANT,
    });

    expect(out.added).toBe(0);
    expect(wrote.inserted).toHaveLength(0);
    expect(out.review[0].cashDescription).toContain("معرفناش نقرا الخزنة");
  });

  it("⚠️⚠️ سطر السيستم مابيبقاش هو بداية الخزنة — الحارس مايقارنش نفسه بنفسه", async () => {
    const wrote = { inserted: [] as unknown[], updated: [] as unknown[] };
    const out = await recordPrepaidCash({
      db: fakeDb(
        [
          // أوردر ١٣٤٠ قبل الرصيد الافتتاحي — فلوسه جوّاه، مايتسجّلش
          {
            id: "o-1340",
            order_number: "1340",
            amount_paid: 900,
            payment_method: "instapay",
            order_date: "2026-07-12",
          },
        ],
        [
          {
            id: "c0",
            direction: "in",
            amount: 23250,
            description: "رصيد افتتاحي",
            related_order_id: null,
            transaction_date: "2026-07-18",
            source_type: "manual",
          },
          // سطر كتبه السيستم بالغلط بتاريخ أقدم من الرصيد الافتتاحي
          {
            id: "c-ghost",
            direction: "in",
            amount: 11978,
            description: "انستا باي أوردر 1336",
            related_order_id: "o-1336",
            transaction_date: "2026-07-08",
            source_type: "prepaid",
          },
        ],
        wrote
      ),
      tenantId: TENANT,
    });

    // من غير الاستثناء، بداية الخزنة كانت هتبقى ٨ يوليو، و١٢ يوليو
    // بعدها — فالأوردر كان هيتسجّل وفلوسه متعدّة مرتين
    expect(out.added).toBe(0);
    expect(wrote.inserted).toHaveLength(0);
  });
});
