import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EXCLUDED_STATUSES, formatDate, formatMoney, orderStatusBadge, orderStatusClass } from "@/lib/format";
import { orderNetTotal } from "@/lib/returned-items";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CustomerEdit } from "@/components/CustomerEdit";
import { CustomerAddress } from "@/components/CustomerAddress";
import { BackLink } from "@/components/BackLink";
import { can, requirePagePermission } from "@/lib/permissions";
import { buildCustomerProfile, profileLine } from "@/lib/customer-profile";
import {
  deleteCustomer,
  updateCustomer,
  updateCustomerAddress,
} from "../actions";

type CustomerDetail = {
  id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  zone: string | null;
  street: string | null;
  building: string | null;
  floor: string | null;
  apartment: string | null;
  landmark: string | null;
  orders: {
    id: string;
    order_number: string | null;
    order_status: string | null;
    order_date: string | null;
    shipping_price: number;
    discount: number;
    refunded_amount: number | null;
    refunded_at: string | null;
    order_items: {
      quantity: number;
      sale_price_at_order: number;
      returned_quantity: number | null;
      product_variants: {
        variant_name: string | null;
        products: { name_ar: string | null; name: string | null } | null;
      } | null;
    }[];
  }[];
};

const EXCLUDED = EXCLUDED_STATUSES;

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const { saved, error: actionError } = await searchParams;
  const user = await requirePagePermission("customers.view");
  const isAdmin = can(user, "customers.edit");
  const supabase = await createClient();

  const { data: customer, error } = await supabase
    .from("customers")
    .select(
      `id, full_name, phone, address, city, zone, street, building, floor, apartment, landmark,
       orders(id, order_number, order_status, order_date, shipping_price, discount, refunded_amount, refunded_at,
         order_items(quantity, sale_price_at_order, returned_quantity,
           product_variants(variant_name, products(name_ar, name))))`
    )
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<CustomerDetail>();

  if (error) {
    return (
      <div className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
        حصل خطأ أثناء تحميل العميل: {error.message}
      </div>
    );
  }
  if (!customer) {
    notFound();
  }

  const orders = [...customer.orders].sort((a, b) =>
    (b.order_date ?? "").localeCompare(a.order_date ?? "")
  );
  const validOrders = orders.filter(
    (o) => !EXCLUDED.includes(o.order_status ?? "")
  );
  // الريفند بيتطرح — اللي رجع بعد التسليم بيتحسب بالصافي (ب)
  const orderTotal = (o: CustomerDetail["orders"][number]) => orderNetTotal(o);
  const total = validOrders.reduce((s, o) => s + orderTotal(o), 0);
  const deliveredCount = orders.filter(
    (o) => o.order_status === "delivered"
  ).length;
  const avgOrder = validOrders.length > 0 ? total / validOrders.length : 0;

  // ⚠️ **ده اللي بيتقري قبل المكالمة** — مش إجمالي فلوس، ده «ده مين».
  const profile = buildCustomerProfile(
    orders.map((o) => ({
      orderStatus: o.order_status,
      orderDate: o.order_date,
      total: orderTotal(o),
      items: o.order_items.map((i) => {
        const v = i.product_variants;
        const base = v?.products?.name_ar || v?.products?.name || "منتج";
        const variant = String(v?.variant_name ?? "").trim();
        return {
          productName: variant ? base + " — " + variant : base,
          quantity: i.quantity,
        };
      }),
    })),
    new Date()
  );
  const line = profileLine(profile);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">
          {customer.full_name ?? "بدون اسم"}
        </h1>
        <BackLink href="/customers" label="الرجوع للعملاء" />
      </div>

      {/*
        الملف الشخصي.

        ⚠️ **الملغي بره كل الأرقام، والراجع مادفعش** — الأوردر اللي اتلغى
        مش شرا، واللي رجع مش فلوس دخلت.
      */}
      <div className="card p-4 sm:p-5">
        {line ? (
          <p className="text-sm text-ink">{line}</p>
        ) : (
          <p className="text-sm text-ink-muted">
            لسه مافيش تاريخ كفاية نقول منه حاجة عن العميل ده.
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="أوردرات" value={String(profile.orders)} />
          <Stat label="دفع" value={formatMoney(Math.round(profile.spent))} />
          <Stat
            label="متوسط الأوردر"
            value={formatMoney(Math.round(profile.average))}
          />
          <Stat
            label="نسبة الرجوع"
            value={
              profile.returnRate === null
                ? "—"
                : profile.returnRate + "%"
            }
            hint={
              profile.returnRate === null
                ? "مفيش أوردر خلص لسه"
                : profile.returned + " من " + profile.settled
            }
            danger={(profile.returnRate ?? 0) >= 30}
          />
        </div>

        {profile.favourites.length > 0 && (
          <p className="mt-3 border-t border-line pt-2 text-xs text-ink-muted">
            بيشتري:{" "}
            {profile.favourites
              .slice(0, 3)
              .map((f) => f.name + " ×" + f.quantity)
              .join(" · ")}
          </p>
        )}
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

      {isAdmin ? (
        <CustomerEdit
          customer={{
            id: customer.id,
            full_name: customer.full_name,
            phone: customer.phone,
            address: customer.address,
          }}
          updateAction={updateCustomer}
        />
      ) : (
        <div className="card p-5">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">التليفون</dt>
              <dd className="text-ink" dir="ltr">
                {customer.phone ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-ink-muted">العنوان</dt>
              <dd className="text-left text-ink">
                {customer.address ?? "—"}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {/* العنوان بتقسيمة بوسطة — عشان الشحنة تبقى واضحة */}
      <CustomerAddress
        customerId={customer.id}
        canEdit={isAdmin}
        fields={{
          city: customer.city,
          zone: customer.zone,
          street: customer.street,
          building: customer.building,
          floor: customer.floor,
          apartment: customer.apartment,
          landmark: customer.landmark,
          address: customer.address,
        }}
        updateAction={updateCustomerAddress}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card p-5">
          <p className="text-sm text-ink-muted">عدد الأوردرات</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {validOrders.length}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-ink-muted">إجمالي المشتريات</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {formatMoney(total)}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-ink-muted">متوسط الأوردر</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {formatMoney(Math.round(avgOrder))}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-ink-muted">أوردرات اتسلمت</p>
          <p className="mt-1 text-2xl font-bold text-success">
            {deliveredCount}
          </p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="border-b border-line px-5 py-4 text-sm font-bold text-ink">
          أوردرات العميل
        </h2>
        {orders.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-faint">
            لسه مفيش أوردرات للعميل ده
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-right text-ink-muted">
                <th className="px-4 py-3 font-medium">رقم الأوردر</th>
                <th className="px-4 py-3 font-medium">التاريخ</th>
                <th className="px-4 py-3 font-medium">الإجمالي</th>
                <th className="px-4 py-3 font-medium">الحالة</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const badge = orderStatusBadge(order.order_status);
                return (
                  <tr
                    key={order.id}
                    className="border-b border-line last:border-0 hover:bg-sunken"
                  >
                    <td className="px-4 py-3 font-medium text-ink">
                      {order.order_number ?? "بدون رقم"}
                    </td>
                    <td className="px-4 py-3 text-ink-body">
                      {formatDate(order.order_date)}
                    </td>
                    <td className="px-4 py-3 text-ink-body">
                      {formatMoney(orderTotal(order))}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={orderStatusClass(order.order_status)}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/orders/${order.id}`}
                        className="rounded-control bg-sunken px-3 py-1 text-xs font-medium text-ink-body hover:bg-line"
                      >
                        فتح
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {isAdmin && (
        <div className="flex justify-end border-t border-line pt-6">
          <form action={deleteCustomer}>
            <input type="hidden" name="customer_id" value={customer.id} />
            <ConfirmButton
              message={`متأكد إنك عايز تمسح العميل "${customer.full_name ?? "بدون اسم"}"؟`}
              className="rounded-control bg-danger-soft px-4 py-1.5 text-sm font-medium text-danger hover:bg-danger-line"
            >
              مسح العميل
            </ConfirmButton>
          </form>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <p
        className={
          "text-lg font-bold tabular-nums " +
          (danger ? "text-danger" : "text-ink")
        }
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-ink-faint">{hint}</p>}
    </div>
  );
}
