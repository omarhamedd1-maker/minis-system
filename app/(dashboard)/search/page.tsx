import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney, orderStatusBadge } from "@/lib/format";
import { can, requirePagePermission } from "@/lib/permissions";
import { planSearch, MIN_NAME_LENGTH } from "@/lib/search-query";

export const dynamic = "force-dynamic";

/**
 * بحث واحد لكل حاجة.
 *
 * ⚠️ **الفكرة إنك ماتعرفش الحاجة فين.** تكتب رقم أوردر أو تليفون أو اسم أو
 * رقم تتبع في نفس الخانة، والصفحة تدوّر في المكان الصح لوحدها
 * (`lib/search-query.ts` بيقرر يدوّر على إيه).
 *
 * **مفيش استعلام بيتضرب من غير لازمة**: البحث بالاسم مابيلمسش جدول
 * الأوردرات، والرقم القصير مابيدوّرش في التليفونات.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const user = await requirePagePermission("orders.view");
  const plan = planSearch(q);

  const seeCustomers = can(user, "customers.view");
  const seeProducts = can(user, "products.view");

  const supabase = await createClient();

  type OrderHit = {
    id: string;
    order_number: string | null;
    order_status: string | null;
    order_date: string | null;
    bosta_tracking: string | null;
    customers: { full_name: string | null; phone: string | null } | null;
    order_items: { quantity: number; sale_price_at_order: number }[];
  };
  type CustomerHit = {
    id: string;
    full_name: string | null;
    phone: string | null;
    city: string | null;
  };
  type ProductHit = {
    id: string;
    name: string | null;
    name_ar: string | null;
    product_variants: { sku: string | null; quantity_on_hand: number }[];
  };

  let orders: OrderHit[] = [];
  let customers: CustomerHit[] = [];
  let products: ProductHit[] = [];

  if (plan) {
    const orderSelect = `id, order_number, order_status, order_date, bosta_tracking,
       customers(full_name, phone), order_items(quantity, sale_price_at_order)`;

    // ===== الأوردرات: بالرقم أو برقم التتبع =====
    if (plan.orderNumber || plan.tracking) {
      const parts: string[] = [];
      if (plan.orderNumber) parts.push(`order_number.eq.${plan.digits}`);
      if (plan.tracking) parts.push(`bosta_tracking.eq.${plan.digits}`);
      orders =
        (
          await supabase
            .from("orders")
            .select(orderSelect)
            .or(parts.join(","))
            .limit(20)
            .overrideTypes<OrderHit[]>()
        ).data ?? [];
    }

    // ===== العملاء: بالاسم أو بالتليفون =====
    if (seeCustomers && (plan.name || plan.phone)) {
      // ⚠️ التليفون متخزّن بشكله اللي اتكتب بيه، فبندوّر بآخر ٩ أرقام —
      // دي الجزء اللي مابيتغيّرش بين `+20…` و`0…`.
      const needle = plan.phone ? plan.digits.slice(-9) : plan.text;
      const column = plan.phone ? "phone" : "full_name";
      customers =
        (
          await supabase
            .from("customers")
            .select("id, full_name, phone, city")
            .ilike(column, `%${needle}%`)
            .limit(20)
            .overrideTypes<CustomerHit[]>()
        ).data ?? [];

      // العميل اتلقى؟ هات أوردراته — ده اللي بتدوّر عليه أصلًا
      if (customers.length > 0 && orders.length === 0) {
        orders =
          (
            await supabase
              .from("orders")
              .select(orderSelect)
              .in(
                "customer_id",
                customers.slice(0, 5).map((c) => c.id)
              )
              .order("order_date", { ascending: false })
              .limit(20)
              .overrideTypes<OrderHit[]>()
          ).data ?? [];
      }
    }

    // ===== المنتجات: بالاسم =====
    if (seeProducts && plan.name) {
      products =
        (
          await supabase
            .from("products")
            .select("id, name, name_ar, product_variants(sku, quantity_on_hand)")
            .or(`name.ilike.%${plan.text}%,name_ar.ilike.%${plan.text}%`)
            .limit(20)
            .overrideTypes<ProductHit[]>()
        ).data ?? [];
    }
  }

  const nothing =
    plan !== null &&
    orders.length === 0 &&
    customers.length === 0 &&
    products.length === 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">بحث</h1>

      <form method="get" className="flex gap-2">
        <input
          name="q"
          defaultValue={plan?.text ?? ""}
          autoFocus
          placeholder="رقم أوردر · تليفون · اسم عميل · اسم منتج · رقم تتبع"
          className="flex-1 rounded-lg border-0 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
        <button
          type="submit"
          className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          دوّر
        </button>
      </form>

      {!plan && (
        <p className="text-sm text-gray-500">
          اكتب أي حاجة تعرفها عن اللي بتدوّر عليه — مش لازم تعرف هو في أنهي
          شاشة.
        </p>
      )}

      {plan && !plan.name && !plan.orderNumber && !plan.phone && (
        <p className="text-sm text-gray-500">
          محتاج {MIN_NAME_LENGTH} حروف على الأقل.
        </p>
      )}

      {nothing && (
        <p className="rounded-xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          مالقيناش «{plan.text}» في الأوردرات ولا العملاء ولا المنتجات.
        </p>
      )}

      {orders.length > 0 && (
        <Section title="أوردرات" count={orders.length}>
          {orders.map((o) => {
            const total = (o.order_items ?? []).reduce(
              (s, i) => s + i.quantity * i.sale_price_at_order,
              0
            );
            const badge = orderStatusBadge(o.order_status);
            return (
              <Link
                key={o.id}
                href={`/orders/${o.id}`}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg px-3 py-2 hover:bg-gray-50"
              >
                <span className="flex items-baseline gap-2">
                  <span className="font-medium text-gray-900">
                    #{o.order_number}
                  </span>
                  <span className="text-sm text-gray-500">
                    {o.customers?.full_name ?? "—"}
                  </span>
                </span>
                <span className="flex items-baseline gap-2 text-sm">
                  <span className="text-gray-400">
                    {formatDate(o.order_date)}
                  </span>
                  <span className="tabular-nums text-gray-600">
                    {formatMoney(total)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </span>
              </Link>
            );
          })}
        </Section>
      )}

      {customers.length > 0 && (
        <Section title="عملاء" count={customers.length}>
          {customers.map((c) => (
            <Link
              key={c.id}
              href={`/customers/${c.id}`}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg px-3 py-2 hover:bg-gray-50"
            >
              <span className="font-medium text-gray-900">
                {c.full_name ?? "بدون اسم"}
              </span>
              <span className="text-sm text-gray-500">
                {c.phone ?? "—"}
                {c.city ? ` · ${c.city}` : ""}
              </span>
            </Link>
          ))}
        </Section>
      )}

      {products.length > 0 && (
        <Section title="منتجات" count={products.length}>
          {products.map((p) => {
            const stock = (p.product_variants ?? []).reduce(
              (s, v) => s + Number(v.quantity_on_hand ?? 0),
              0
            );
            return (
              <Link
                key={p.id}
                href={`/products/${p.id}`}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg px-3 py-2 hover:bg-gray-50"
              >
                <span className="font-medium text-gray-900">
                  {p.name_ar || p.name}
                </span>
                <span className="text-sm text-gray-500">
                  {(p.product_variants ?? []).length} شكل · مخزون {stock}
                </span>
              </Link>
            );
          })}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm sm:p-4">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
        <span className="text-xs text-gray-500">{count}</span>
      </div>
      <div className="mt-1 divide-y divide-gray-50">{children}</div>
    </div>
  );
}
