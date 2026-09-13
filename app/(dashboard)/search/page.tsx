import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney, orderStatusBadge, orderStatusClass } from "@/lib/format";
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
      <h1 className="text-2xl font-bold text-ink">بحث</h1>

      <form method="get" className="flex gap-2">
        <input
          name="q"
          defaultValue={plan?.text ?? ""}
          autoFocus
          placeholder="رقم أوردر · تليفون · اسم عميل · اسم منتج · رقم تتبع"
          className="flex-1 rounded-control border-0 bg-surface px-4 py-2.5 text-sm text-ink shadow-card placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="submit"
          className="btn btn-primary px-5"
        >
          دوّر
        </button>
      </form>

      {!plan && (
        <p className="text-sm text-ink-muted">
          اكتب أي حاجة تعرفها عن اللي بتدوّر عليه — مش لازم تعرف هو في أنهي
          شاشة.
        </p>
      )}

      {plan && !plan.name && !plan.orderNumber && !plan.phone && (
        <p className="text-sm text-ink-muted">
          محتاج {MIN_NAME_LENGTH} حروف على الأقل.
        </p>
      )}

      {nothing && (
        <p className="card empty">
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
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-control px-3 py-2 hover:bg-sunken"
              >
                <span className="flex items-baseline gap-2">
                  <span className="font-medium text-ink">
                    #{o.order_number}
                  </span>
                  <span className="text-sm text-ink-muted">
                    {o.customers?.full_name ?? "—"}
                  </span>
                </span>
                <span className="flex items-baseline gap-2 text-sm">
                  <span className="text-ink-faint">
                    {formatDate(o.order_date)}
                  </span>
                  <span className="tabular-nums text-ink-muted">
                    {formatMoney(total)}
                  </span>
                  <span
                    className={orderStatusClass(o.order_status)}
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
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-control px-3 py-2 hover:bg-sunken"
            >
              <span className="font-medium text-ink">
                {c.full_name ?? "بدون اسم"}
              </span>
              <span className="text-sm text-ink-muted">
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
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-control px-3 py-2 hover:bg-sunken"
              >
                <span className="font-medium text-ink">
                  {p.name_ar || p.name}
                </span>
                <span className="text-sm text-ink-muted">
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
    <div className="card p-3 sm:p-4">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-sm font-bold text-ink">{title}</h2>
        <span className="text-xs text-ink-muted">{count}</span>
      </div>
      <div className="mt-1 divide-y divide-line">{children}</div>
    </div>
  );
}
