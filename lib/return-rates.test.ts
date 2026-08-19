import { describe, expect, it } from "vitest";
import { customerReturnRates, productReturnRates, type RateOrder } from "./return-rates";

const o = (
  status: string,
  products: string[],
  customer?: { id: string; name: string }
): RateOrder => ({
  orderStatus: status,
  customerId: customer?.id ?? null,
  customerName: customer?.name ?? null,
  items: products.map((p) => ({ variantId: p, productName: p })),
});

const many = (n: number, status: string, products: string[]) =>
  Array.from({ length: n }, () => o(status, products));

describe("نسبة رجوع المنتج", () => {
  it("**المقام هو اللي اتشحن بس** — الملغي والجديد بره الحسبة", () => {
    const r = productReturnRates(
      [
        ...many(8, "delivered", ["كرسي"]),
        ...many(2, "returned", ["كرسي"]),
        ...many(50, "cancelled", ["كرسي"]),
        ...many(50, "new", ["كرسي"]),
      ],
      5
    );
    expect(r.shipped).toBe(10);
    expect(r.rows[0]).toMatchObject({ name: "كرسي", shipped: 10, returned: 2, rate: 20 });
  });

  it("**اللي اتشحن أقل من الحد بيتشال** — مرتين ورجع مرة مش ٥٠٪ بمعنى", () => {
    const r = productReturnRates([o("delivered", ["نادر"]), o("returned", ["نادر"])], 5);
    expect(r.rows).toHaveLength(0);
  });

  it("**المرتجع بعد التسليم بيتحسب رجوع**", () => {
    const r = productReturnRates(
      [...many(9, "delivered", ["مرايه"]), o("returned_after_delivery", ["مرايه"])],
      5
    );
    expect(r.rows[0]).toMatchObject({ returned: 1, rate: 10 });
  });

  it("**المنتج بيتعدّ مرة واحدة في الأوردر** حتى لو ليه كذا بند", () => {
    const dup: RateOrder = {
      orderStatus: "returned",
      items: [
        { variantId: "أ", productName: "أ" },
        { variantId: "أ", productName: "أ" },
        { variantId: "أ", productName: "أ" },
      ],
    };
    const r = productReturnRates([dup, ...many(9, "delivered", ["أ"])], 5);
    expect(r.rows[0]).toMatchObject({ shipped: 10, returned: 1 });
  });

  it("الترتيب بالأعلى نسبة", () => {
    const r = productReturnRates(
      [
        ...many(9, "delivered", ["كويس"]),
        ...many(1, "returned", ["كويس"]),
        ...many(5, "delivered", ["وحش"]),
        ...many(5, "returned", ["وحش"]),
      ],
      5
    );
    expect(r.rows.map((x) => x.name)).toEqual(["وحش", "كويس"]);
    expect(r.rows[0].rate).toBe(50);
  });

  it("النسبة العامة بتتحسب عشان المقارنة يبقى ليها معنى", () => {
    const r = productReturnRates([...many(15, "delivered", ["س"]), ...many(5, "returned", ["س"])], 5);
    expect(r.overall).toBe(25);
  });
});

describe("نسبة رجوع العميل", () => {
  const ahmed = { id: "c1", name: "أحمد" };
  const sara = { id: "c2", name: "سارة" };

  it("**اللي مرجّعش خالص مابيظهرش** — القايمة دي للمشكلة مش للكل", () => {
    const r = customerReturnRates(
      [...Array.from({ length: 5 }, () => o("delivered", ["س"], ahmed))],
      3
    );
    expect(r.rows).toHaveLength(0);
  });

  it("بيطلّع اللي بيرجّع بنسبته", () => {
    const r = customerReturnRates(
      [
        ...Array.from({ length: 2 }, () => o("delivered", ["س"], ahmed)),
        ...Array.from({ length: 4 }, () => o("returned", ["س"], ahmed)),
        ...Array.from({ length: 5 }, () => o("delivered", ["س"], sara)),
      ],
      3
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ name: "أحمد", shipped: 6, returned: 4, rate: 67 });
  });

  it("**العميل المجهول بيتعدّى** — مافيش مفتاح نجمّع عليه", () => {
    const r = customerReturnRates([...Array.from({ length: 5 }, () => o("returned", ["س"]))], 3);
    expect(r.rows).toHaveLength(0);
    expect(r.shipped).toBe(5);
  });
});
