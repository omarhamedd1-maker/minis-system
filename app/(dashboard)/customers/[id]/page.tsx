import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EXCLUDED_STATUSES, formatDate, formatMoney, orderStatusBadge } from "@/lib/format";
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
    order_items: {
      quantity: number;
      sale_price_at_order: number;
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
       orders(id, order_number, order_status, order_date, shipping_price, discount,
         order_items(quantity, sale_price_at_order,
           product_variants(variant_name, products(name_ar, name))))`
    )
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<CustomerDetail>();

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
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
  const orderTotal = (o: CustomerDetail["orders"][number]) =>
    o.order_items.reduce((s, i) => s + i.quantity * i.sale_price_at_order, 0) -
    o.discount +
    o.shipping_price;
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
        <h1 className="text-xl font-bold text-gray-900">
          {customer.full_name ?? "بدون اسم"}
        </h1>
        <BackLink href="/customers" label="الرجوع للعملاء" />
      </div>

      {/*
        الملف الشخصي.

        ⚠️ **الملغي بره كل الأرقام، والراجع مادفعش** — الأوردر اللي اتلغى
        مش شرا، واللي رجع مش فلوس دخلت.
      */}
      <div className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
        {line ? (
          <p className="text-sm text-gray-900">{line}</p>
        ) : (
          <p className="text-sm text-gray-500">
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
          <p className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-500">
            بيشتري:{" "}
            {profile.favourites
              .slice(0, 3)
              .map((f) => f.name + " ×" + f.quantity)
              .join(" · ")}
          </p>
        )}
      </div>

      {actionError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}
      {saved && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
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
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">التليفون</dt>
              <dd className="text-gray-900" dir="ltr">
                {customer.phone ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-gray-500">العنوان</dt>
              <dd className="text-left text-gray-900">
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
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">عدد الأوردرات</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {validOrders.length}
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">إجمالي المشتريات</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {formatMoney(total)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">متوسط الأوردر</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {formatMoney(Math.round(avgOrder))}
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">أوردرات اتسلمت</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">
            {deliveredCount}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <h2 className="border-b border-gray-200 px-5 py-4 text-sm font-bold text-gray-900">
          أوردرات العميل
        </h2>
        {orders.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">
            لسه مفيش أوردرات للعميل ده
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-right text-gray-500">
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
                    className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {order.order_number ?? "بدون رقم"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatDate(order.order_date)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatMoney(orderTotal(order))}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/orders/${order.id}`}
                        className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
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
        <div className="flex justify-end border-t border-gray-200 pt-6">
          <form action={deleteCustomer}>
            <input type="hidden" name="customer_id" value={customer.id} />
            <ConfirmButton
              message={`متأكد إنك عايز تمسح العميل "${customer.full_name ?? "بدون اسم"}"؟`}
              className="rounded-lg bg-red-50 px-4 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
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
      <p className="text-xs text-gray-500">{label}</p>
      <p
        className={
          "text-lg font-bold tabular-nums " +
          (danger ? "text-red-600" : "text-gray-900")
        }
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}
