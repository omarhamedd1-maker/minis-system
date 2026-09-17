import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EXCLUDED_STATUSES, formatDate, formatMoney } from "@/lib/format";
import { CustomerRow } from "@/components/CustomerRow";
import { can, requirePagePermission } from "@/lib/permissions";
import { mergeCustomers } from "./actions";
import { ShowMore } from "@/components/ShowMore";
import { resolveShowCount } from "@/lib/show-more";

type CustomerData = {
  id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  orders: {
    id: string;
    order_date: string | null;
    order_status: string | null;
    shipping_price: number;
    discount: number;
    order_items: { quantity: number; sale_price_at_order: number }[];
  }[];
};

const EXCLUDED = EXCLUDED_STATUSES;

const SORTS: Record<string, string> = {
  total: "الأكبر مبلغاً",
  orders: "الأكتر أوردرات",
  recent: "آخر أوردر",
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    sort?: string;
    saved?: string;
    deleted?: string;
    error?: string;
    show?: string;
  }>;
}) {
  const {
    q,
    sort: rawSort,
    saved,
    deleted,
    error: actionError,
    show,
  } = await searchParams;
  const searchTerm = (q ?? "").trim();
  const sort = SORTS[rawSort ?? ""] ? (rawSort as string) : "total";
  const user = await requirePagePermission("customers.view");
  const canEdit = can(user, "customers.edit");
  const supabase = await createClient();

  const { data: customers, error } = await supabase
    .from("customers")
    .select(
      `id, full_name, phone, address,
       orders(id, order_date, order_status, shipping_price, discount,
         order_items(quantity, sale_price_at_order))`
    )
    .limit(1000)
    .overrideTypes<CustomerData[]>();

  if (error) {
    return (
      <div className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
        حصل خطأ أثناء تحميل العملاء: {error.message}
      </div>
    );
  }

  const normalized = searchTerm.toLowerCase().replace(/\s+/g, "");

  const rows = customers
    .map((customer) => {
      const validOrders = customer.orders.filter(
        (o) => !EXCLUDED.includes(o.order_status ?? "")
      );
      const total = validOrders.reduce(
        (sum, order) =>
          sum +
          order.order_items.reduce(
            (s, item) => s + item.quantity * item.sale_price_at_order,
            0
          ) -
          order.discount +
          order.shipping_price,
        0
      );
      const lastOrderDate = customer.orders.reduce<string | null>(
        (latest, order) =>
          order.order_date && (!latest || order.order_date > latest)
            ? order.order_date
            : latest,
        null
      );
      return {
        id: customer.id,
        name: customer.full_name ?? "بدون اسم",
        phone: customer.phone,
        address: customer.address,
        ordersCount: validOrders.length,
        total,
        lastOrderDate,
      };
    })
    .filter((row) => {
      if (!searchTerm) return true;
      const name = row.name.toLowerCase().replace(/\s+/g, "");
      const phone = (row.phone ?? "").replace(/\s+/g, "");
      return name.includes(normalized) || phone.includes(normalized);
    })
    .sort((a, b) => {
      if (sort === "orders") return b.ordersCount - a.ordersCount;
      if (sort === "recent")
        return (b.lastOrderDate ?? "").localeCompare(a.lastOrderDate ?? "");
      return b.total - a.total;
    });

  // عملاء مكررين: نفس رقم التليفون (بعد التنظيف) لأكتر من عميل
  const byPhone = new Map<string, typeof rows>();
  for (const r of rows) {
    const digits = (r.phone ?? "").replace(/\D/g, "").replace(/^(20|0)+/, "");
    if (digits.length < 8) continue;
    const list = byPhone.get(digits) ?? [];
    list.push(r);
    byPhone.set(digits, list);
  }
  const duplicateGroups = [...byPhone.entries()]
    .filter(([, list]) => list.length > 1)
    .slice(0, 30)
    .map(([digits, list]) => ({
      phone: list[0].phone ?? digits,
      // الأكتر أوردرات الأول — عشان يبقى هو الافتراضي اللي نسيبه
      members: [...list].sort((a, b) => b.ordersCount - a.ordersCount),
    }));

  // ⚠️ **المكررين اتحسبوا فوق على القايمة الكاملة** — القص ده للعرض بس
  const showCount = resolveShowCount(show);
  const visible = rows.slice(0, showCount);

  const sortHref = (key: string) => {
    const params = new URLSearchParams();
    if (searchTerm) params.set("q", searchTerm);
    if (key !== "total") params.set("sort", key);
    const qs = params.toString();
    return qs ? `/customers?${qs}` : "/customers";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">العملاء</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-muted">{rows.length} عميل</span>
          {/* الشرايح — «مين يستاهل معاملة مختلفة» بدل رقم واحد */}
          <Link
            href="/customers/segments"
            className="rounded-control px-3 py-1.5 text-sm text-ink-muted hover:bg-sunken hover:text-ink"
          >
            الشرايح
          </Link>
          {/* البحث من الأيقونة اللي فوق — هنا بيبان بس لو شغّال */}
          {searchTerm && (
            <Link
              href={sort !== "total" ? `/customers?sort=${sort}` : "/customers"}
              className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-xs text-ink"
            >
              بحث: {searchTerm}
              <span aria-hidden className="text-ink-muted">✕</span>
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-muted">ترتيب حسب:</span>
        {Object.entries(SORTS).map(([key, label]) => (
          <Link
            key={key}
            href={sortHref(key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              sort === key
                ? "bg-primary text-white"
                : "bg-surface text-ink-muted shadow-card hover:bg-sunken"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {actionError && (
        <div className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
          {actionError}
        </div>
      )}
      {saved && (
        <div className="rounded-control bg-success-soft px-4 py-3 text-sm text-success">
          تم حفظ بيانات العميل
        </div>
      )}
      {deleted && (
        <div className="rounded-control bg-success-soft px-4 py-3 text-sm text-success">
          تم مسح العميل
        </div>
      )}

      {/* عملاء مشتبه إنهم مكررين — نفس التليفون بأسماء/بيانات مختلفة */}
      {canEdit && duplicateGroups.length > 0 && (
        <details className="rounded-card border border-warning-line bg-warning-soft p-4">
          <summary className="cursor-pointer text-sm font-bold text-warning">
            عملاء مكررين ({duplicateGroups.length} مجموعة) — دوس للدمج
          </summary>
          <p className="mt-2 text-xs text-warning">
            دول عملاء بنفس رقم التليفون. اختار اللي تسيبه، والباقي هيتدمج فيه
            (أوردراتهم هتتنقل له).
          </p>
          <div className="mt-3 space-y-3">
            {duplicateGroups.map((g) => (
              <form
                key={g.phone}
                action={mergeCustomers}
                className="rounded-control bg-surface p-3"
              >
                <div className="mb-2 text-xs text-ink-muted" dir="ltr">
                  {g.phone}
                </div>
                <div className="space-y-1.5">
                  {g.members.map((m, i) => (
                    <label
                      key={m.id}
                      className="flex items-center gap-2 text-sm text-ink-body"
                    >
                      <input
                        type="radio"
                        name="keep_id"
                        value={m.id}
                        defaultChecked={i === 0}
                        className="h-4 w-4"
                      />
                      <span className="min-w-0 flex-1 truncate">{m.name}</span>
                      <span className="shrink-0 text-xs text-ink-muted">
                        {m.ordersCount} أوردر
                      </span>
                    </label>
                  ))}
                </div>
                {/* بنبعت كل أعضاء المجموعة، والسيرفر بيستثني اللي اخترته */}
                {g.members.map((m) => (
                  <input
                    key={`d-${m.id}`}
                    type="hidden"
                    name="all_ids"
                    value={m.id}
                  />
                ))}
                <button
                  type="submit"
                  className="mt-2 btn btn-primary btn-sm"
                >
                  ادمج المجموعة
                </button>
              </form>
            ))}
          </div>
        </details>
      )}

      {rows.length === 0 ? (
        <div className="card empty p-12">
          {searchTerm
            ? `مفيش عملاء فيهم "${searchTerm}".`
            : "لسه مفيش عملاء — بيتسجلوا تلقائياً مع الأوردرات."}
        </div>
      ) : (
        <>
        {/* ===== موبايل: كروت (مفيش سحب جانبي) ===== */}
        <div className="space-y-2 md:hidden">
          {visible.map((row) => (
            <Link
              key={row.id}
              href={`/customers/${row.id}`}
              className="card block p-3 transition-colors active:bg-sunken"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-ink">
                    {row.name}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-muted" dir="ltr">
                    {row.phone ?? "—"}
                  </div>
                </div>
                <div className="shrink-0 text-sm font-bold text-ink">
                  {formatMoney(row.total)}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-2 text-xs text-ink-muted">
                <span>{row.ordersCount} أوردر</span>
                <span>آخر أوردر: {formatDate(row.lastOrderDate)}</span>
              </div>
            </Link>
          ))}
        </div>

        {/* ===== كمبيوتر: جدول ===== */}
        <div className="card hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-right text-ink-muted">
                <th className="px-4 py-3 font-medium">العميل</th>
                <th className="px-4 py-3 font-medium">التليفون</th>
                <th className="px-4 py-3 font-medium">العنوان</th>
                <th className="px-4 py-3 font-medium">الأوردرات</th>
                <th className="px-4 py-3 font-medium">إجمالي المشتريات</th>
                <th className="px-4 py-3 font-medium">آخر أوردر</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <CustomerRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
        <ShowMore
          basePath="/customers"
          query={{ q: searchTerm || undefined, sort: sort !== "total" ? sort : undefined }}
          shown={visible.length}
          total={rows.length}
        />
        </>
      )}
    </div>
  );
}
