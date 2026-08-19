import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  CUSTOMER_PAID_STATUSES,
  ORDER_STATUS_OPTIONS,
  PAYMENT_METHODS,
  formatDate,
  formatMoney,
  lastMove,
  orderStatusBadge,
  paymentMethodLabel,
} from "@/lib/format";
import { shippingSettlement } from "@/lib/dashboard-stats";
import { shortLogText } from "@/lib/log-text";
import { orderFlags } from "@/lib/order-flags";
import { trackingLink } from "@/lib/tracking-view";
import { CopyLink } from "@/components/CopyLink";
import { headers } from "next/headers";
import { ConfirmButton } from "@/components/ConfirmButton";
import { AutoRefresh } from "@/components/AutoRefresh";
import { StatusBox } from "@/components/StatusBox";
import { DiscountBox } from "@/components/DiscountBox";
import { AddOrderItem } from "@/components/AddOrderItem";
import { BackLink } from "@/components/BackLink";
import { OrderItemRow } from "@/components/OrderItemRow";
import { OrderItemCard } from "@/components/OrderItemCard";
import { ReturnPanel } from "@/components/ReturnPanel";
import { ExchangePanel } from "@/components/ExchangePanel";
import { AddTask } from "@/components/AddTask";
import { taskStatusBadge } from "@/lib/tasks";
import { createTask } from "../../tasks/actions";
import { BostaMark } from "@/components/BostaMark";
import { isDeadShipment } from "@/lib/bosta/order-status";
import { exceptionAdvice } from "@/lib/bosta/exception";
import { bundleCovered } from "@/lib/bosta/real-fees";
import { refundDue } from "@/lib/refund";
import { RETURNED_STATUSES, RETURN_REASONS } from "@/lib/return-reasons";
import {
  historySegments,
  orderCountWord,
  riskBadge,
  summarizeCustomerHistory,
} from "@/lib/customer-history";
import { can, requirePagePermission } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  addOrderItem,
  deleteOrder,
  deleteOrderItem,
  linkBostaShipment,
  sendOrderToBosta,
  toggleOrderArchive,
  saveReturnedItems,
  createExchangeShipment,
  createReturnShipment,
  updatePayment,
  updateDiscount,
  updateOrderItem,
  updateOrderStatus,
  updateShippingPrice,
  updateReturnReason,
  confirmRefund,
  undoRefund,
} from "./actions";

// وقت النداء — بره الرندر عشان الرندر يبقى نقي
function currentMs() {
  return Date.now();
}

type OrderDetails = {
  id: string;
  order_number: string | null;
  order_status: string | null;
  order_date: string | null;
  archived: boolean;
  shipping_price: number;
  discount: number;
  bosta_state: string | null;
  bosta_exception: string | null;
  bosta_cod: number;
  bosta_collected: boolean;
  bosta_tracking: string | null;
  bosta_created_at: string | null;
  refunded_at: string | null;
  refunded_amount: number | null;
  cash_received_at: string | null;
  bosta_shipping_cost: number;
  delivered_at: string | null;
  return_note: string | null;
  return_reason: string | null;
  return_tracking: string | null;
  payment_method: string | null;
  amount_paid: number | null;
  customers: {
    id: string;
    full_name: string | null;
    phone: string | null;
    address: string | null;
  } | null;
  order_items: {
    id: string;
    quantity: number;
    sale_price_at_order: number;
    cost_price_at_order: number;
    returned_quantity: number | null;
    product_variants: {
      variant_name: string | null;
      products: { name: string | null } | null;
    } | null;
  }[];
};

export default async function OrderDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error: actionError, saved } = await searchParams;
  const user = await requirePagePermission("orders.view");
  const canItems = can(user, "orders.items");
  const canStatus = can(user, "orders.status");
  const canArchive = can(user, "orders.archive");
  const canDelete = can(user, "orders.delete");
  const canLink = can(user, "ship.link");
  const canSend = can(user, "ship.send");
  const canPrint = can(user, "ship.print");
  const isAdmin = user.isAdmin;
  // بعد التسليم أو المرتجع مفيش لزمة نطبع بوليصة
  // البوليصة بتتلزق على الكرتونة **قبل** ما المندوب ياخدها. أول ما بوسطة
  // تستلم الشحنة خلاص مالهاش لازمة — والزرار كان بيفضل ظاهر ويلخبط.
  // (وبوسطة نفسها بترفض تديك بوليصة بعد التسليم.)
  const PRINT_DONE_STATUSES = [
    "shipped",
    "out_for_delivery",
    "delivered",
    "returning",
    "returned",
    "returned_after_delivery",
    "cancelled",
  ];
  const supabase = await createClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      `id, order_number, order_status, order_date, archived, shipping_price, discount,
       bosta_state, bosta_exception, bosta_cod, bosta_collected, bosta_tracking, bosta_shipping_cost,
       bosta_created_at, refunded_at, refunded_amount, cash_received_at,
       delivered_at, return_note, return_reason, return_tracking, payment_method, amount_paid,
       customers(id, full_name, phone, address),
       order_items(id, quantity, sale_price_at_order, cost_price_at_order, returned_quantity,
         product_variants(variant_name, products(name)))`
    )
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<OrderDetails>();

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        حصل خطأ أثناء تحميل الأوردر: {error.message}
      </div>
    );
  }

  // تاريخ العميل — بيرجّع كتير ولا لأ. اللي بيأكّد الأوردر لازم يشوفه قبل
  // ما يمسك التليفون، لأن الشحنة اللي بتروح وترجع بتتحسب رسومها الاتجاهين.
  //
  // **الأوردر ده نفسه بيتشال** — إحنا بنتكلم عن اللي قبله. لو دخل في العد
  // هيبقى الكلام ملخبط ("طلب أوردرين" وهو قدامك واحد منهم).
  const { data: historyRows } = order?.customers?.id
    ? await supabase
        .from("orders")
        .select("order_status")
        .eq("customer_id", order.customers.id)
        .neq("id", id)
        .overrideTypes<{ order_status: string | null }[]>()
    : { data: [] };
  const history = summarizeCustomerHistory(
    (historyRows ?? []).map((r) => r.order_status)
  );
  const historyBadge = riskBadge(history.risk);
  const historyParts = historySegments(history);


  // قايمة المنتجات لفورم إضافة منتج (لمن يقدر يعدّل البنود)
  const { data: variantsData } = canItems
    ? await supabase
        .from("product_variants")
        .select("id, variant_name, sku, sale_price, products(name, name_ar)")
        .overrideTypes<
          {
            id: string;
            variant_name: string | null;
            sku: string | null;
            sale_price: number;
            products: { name: string | null; name_ar: string | null } | null;
          }[]
        >()
    : { data: [] };
  const variants = (variantsData ?? [])
    .map((v) => ({
      id: v.id,
      sku: v.sku,
      name_en: v.products?.name ?? null,
      name_ar: v.products?.name_ar ?? null,
      variant_name: v.variant_name,
      sale_price: v.sale_price,
    }))
    .sort((a, b) =>
      (a.name_ar ?? a.name_en ?? "").localeCompare(
        b.name_ar ?? b.name_en ?? "",
        "ar"
      )
    );

  if (!order) {
    notFound();
  }

  const badge = orderStatusBadge(order.order_status);

  // الشحنة ميتة (مؤرشفة/ملغية عند بوسطة)؟ وقاعدة كام يوم؟
  const shipmentDead =
    Boolean(order.bosta_tracking) && isDeadShipment(order.bosta_state);
  const shipmentAge =
    order.bosta_created_at &&
    ["ready", "new", "confirmed", "packed"].includes(order.order_status ?? "")
      ? Math.floor((currentMs() - new Date(order.bosta_created_at).getTime()) / 86400000)
      : null;
  // المبلغ اللي المفروض يرجع للعميل — من البنود اللي رجعت فعلًا
  const refundAmount = refundDue(
    order.order_items.map((i) => ({
      returnedQuantity: i.returned_quantity,
      salePriceAtOrder: i.sale_price_at_order,
    }))
  );
  const isCancelled = order.order_status === "cancelled";
  const itemsTotal = order.order_items.reduce(
    (sum, item) => sum + item.quantity * item.sale_price_at_order,
    0
  );
  // ⚠️ **تنبيهات مش موانع** — الأوردر بيتشحن عادي، والعلامة بتقول «بصّ
  // على دي الأول». وبتختفي لوحدها أول ما الأوردر يروح لبوسطة.
  // ⚠️ **العنوان بيتاخد من الطلب نفسه** — الرابط لازم يبقى بدومين الموقع
  // اللي فاتح دلوقتي، مش رقم ثابت في الكود يبوظ لما الدومين يتغيّر.
  const origin = (await headers()).get("origin") ?? null;
  const trackLink = trackingLink(order.id, origin);

  const flags = orderFlags({
    orderStatus: order.order_status,
    total: itemsTotal - (order.discount ?? 0) + (order.shipping_price ?? 0),
    address: order.customers?.address ?? null,
    previousOrders: history.total,
    previousReturns: history.returned,
  });
  // الملغي: مفيش شحن يتحسب
  const grandTotal =
    itemsTotal - order.discount + (isCancelled ? 0 : order.shipping_price);

  // الأوردر السابق (الأحدث) والتالي (الأقدم) بترتيب التاريخ زي القايمة
  const [{ data: prevOrder }, { data: nextOrder }] = order.order_date
    ? await Promise.all([
        supabase
          .from("orders")
          .select("id")
          .gt("order_date", order.order_date)
          .order("order_date", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("orders")
          .select("id")
          .lt("order_date", order.order_date)
          .order("order_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
    : [{ data: null }, { data: null }];

  // ===== سجل الأوردر: بنجمّع الأحداث الثابتة + سجل النشاط + التعليقات =====
  const fmtWhen = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("ar-EG", {
          timeZone: "Africa/Cairo",
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
        })
      : "—";

  // السجل بيتجمّع بـ `order_id` — التجميع بتشابه النص كان بيلقّط حركات
  // مالهاش علاقة (أوردر ١١٣٥٩ بيطلع في سجل ١٣٥٩، ومصروف بمبلغ ١٣٥٩ كمان).
  // الصفوف القديمة مالهاش order_id فبنضمّها بالنص، ولو الخانة لسه مااتعملتش
  // بنرجع للنص لوحده بدل ما السجل يفضى.
  type LogRow = {
    actor_name: string | null;
    action: string;
    summary: string | null;
    created_at: string;
  };
  const logDb = createAdminClient();
  const byText = `summary.like.%${order.order_number}%`;
  let orderLog: LogRow[] = [];
  {
    // ⚠️ **الفلتر لازم هنا بالذات.** المطابقة بتتم بنص رقم الأوردر، وأرقام
    // الأوردرات مش فريدة بين البيزنسات — أوردر ١٤١٦ عند بيزنس تاني كان
    // هيطلّع سطور سجله في صفحة أوردرنا.
    const both = await logDb
      .from("activity_log")
      .select("actor_name, action, summary, created_at")
      .eq("tenant_id", user.tenantId)
      .or(order.order_number ? `order_id.eq.${id},${byText}` : `order_id.eq.${id}`)
      .order("created_at", { ascending: true })
      .limit(60)
      .overrideTypes<LogRow[]>();

    if (both.error && order.order_number) {
      const textOnly = await logDb
        .from("activity_log")
        .select("actor_name, action, summary, created_at")
        .eq("tenant_id", user.tenantId)
        .like("summary", `%${order.order_number}%`)
        .order("created_at", { ascending: true })
        .limit(60)
        .overrideTypes<LogRow[]>();
      orderLog = textOnly.data ?? [];
    } else {
      orderLog = both.data ?? [];
    }
  }

  type Ev = { at: string; text: string; when: string; who?: string; dot: string };
  const timeline: Ev[] = [];
  if (order.order_date) {
    timeline.push({
      at: order.order_date,
      text: "اتعمل الأوردر",
      when: fmtWhen(order.order_date),
      dot: "bg-blue-500",
    });
  }
  for (const l of orderLog ?? []) {
    timeline.push({
      at: l.created_at,
      // ⚠️ **القص وقت العرض بس** — الجدول فيه النص الكامل، والسجل العام
      // محتاجه كامل عشان يقول أنهي أوردر.
      text: shortLogText(l.summary, order.order_number) || l.action,
      when: fmtWhen(l.created_at),
      who: l.actor_name ?? undefined,
      dot: l.action.startsWith("bosta")
        ? "bg-[#E30613]"
        : l.action.includes("delete")
          ? "bg-red-500"
          : "bg-gray-400",
    });
  }
  if (order.delivered_at) {
    timeline.push({
      at: order.delivered_at,
      text: "اتسلّم للعميل",
      when: fmtWhen(order.delivered_at),
      dot: "bg-green-600",
    });
  }
  timeline.sort((a, b) => a.at.localeCompare(b.at));

  // لينك واتساب العميل: نحوّل الرقم لصيغة دولية (مصر 20)
  const rawPhone = (order.customers?.phone ?? "").replace(/\D/g, "");
  const intlPhone = rawPhone
    ? rawPhone.startsWith("20")
      ? rawPhone
      : "20" + rawPhone.replace(/^0+/, "")
    : null;
  const whatsappLink = intlPhone ? `https://wa.me/${intlPhone}` : null;

  // نعمل إيه في الأوردر الواقف — بتتحدد من سبب بوسطة نفسه
  const advice = exceptionAdvice(order.bosta_exception);

  // رسوم بوسطة الحقيقية — **استعلام لوحده بقصد**: الأعمدة دي بتتضاف بملف
  // SQL عمر بيشغّله بإيده، ولو حطيناها في الاستعلام الأساسي وهي لسه
  // مااتعملتش الصفحة كلها هتقع. كده أسوأ حاجة إن الرقم الحقيقي مايبانش.
  const realFee = await (async () => {
    try {
      const { data } = await supabase
        .from("orders")
        .select("bosta_fees_real, bosta_ship_fee_real")
        .eq("id", id)
        .maybeSingle();
      const f = data as { bosta_fees_real: number | null; bosta_ship_fee_real: number | null } | null;
      return f?.bosta_fees_real ? f : null;
    } catch {
      return null;
    }
  })();

  // تاسكات الأوردر — استعلام لوحده عشان لو جدول التاسكات لسه ماتعملش
  // الصفحة تفضل شغالة عادي
  const orderTasks = await (async () => {
    if (!can(user, "tasks.view")) return null;
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, status, task_assignees(user_name)")
        .eq("order_id", id)
        .order("created_at", { ascending: true });
      if (error) return null;

      const { data: team } = await supabase
        .from("app_users")
        .select("id, full_name")
        .eq("tenant_id", user.tenantId)
        .eq("active", true)
        .order("full_name");

      return {
        list: (data ?? []) as {
          id: string;
          title: string;
          status: string | null;
          task_assignees: { user_name: string | null }[];
        }[],
        team: ((team ?? []) as { id: string; full_name: string | null }[]).map((u) => ({
          id: u.id,
          name: u.full_name ?? "بدون اسم",
        })),
        canEdit: can(user, "tasks.edit"),
        canAssign: can(user, "tasks.assign"),
      };
    } catch {
      return null;
    }
  })();

  // شحنة التبديل — استعلام لوحده لنفس السبب: الأعمدة بتتضاف بملف SQL
  const exchange = await (async () => {
    try {
      const { data } = await supabase
        .from("orders")
        .select("exchange_tracking, exchange_note")
        .eq("id", id)
        .maybeSingle();
      return data as {
        exchange_tracking: string | null;
        exchange_note: string | null;
      } | null;
    } catch {
      return null;
    }
  })();

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={30} />
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-lg font-bold text-gray-900 sm:text-xl">
            أوردر {order.order_number ?? "بدون رقم"}
          </h1>
          <span
            className={`inline-block shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
          {order.archived && (
            <span className="inline-block shrink-0 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              مؤرشف
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* السابق = الأقدم */}
          {nextOrder ? (
            <Link
              href={`/orders/${nextOrder.id}`}
              title="السابق (الأقدم)"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 active:scale-95"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          ) : (
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gray-50 text-gray-300">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </span>
          )}
          {/* التالي = الأجدد */}
          {prevOrder ? (
            <Link
              href={`/orders/${prevOrder.id}`}
              title="التالي (الأجدد)"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 active:scale-95"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </Link>
          ) : (
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gray-50 text-gray-300">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </span>
          )}
          <BackLink href="/orders" label="الرجوع للأوردرات" variant="exit" />
        </div>
      </div>

      {/*
        علامات قبل الشحن.

        ⚠️ **مش مانع** — مافيش زرار بيتقفل ومافيش خطوة بتتفرض. ده كلام
        بيتقال مرة قبل ما البوليصة تتطبع، وبيختفي بعدها لوحده.
      */}
      {flags.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="space-y-1.5">
            {flags.map((f) => (
              <div key={f.key} className="flex items-start gap-2">
                <span className="mt-0.5 text-xs leading-none">⚠️</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-amber-900">{f.text}</div>
                  <div className="text-[11px] text-amber-700/80">{f.why}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/*
        بوسطة واقفة ومحتاجة تصرّف.

        **الشرط بقى الحالة بس.** كان كمان `|| order.bosta_exception`، وسبب
        الوقوف بيفضل مكتوب في الأوردر بعد ما يتحل — فالتحذير كان بيفضل فوق
        الأوردر وهو متسلّم أو راجع خلاص. دلوقتي بيمشي أول ما الحالة تتغيّر،
        والسبب بيفضل مكتوب تحت في تفاصيل الشحنة.

        **والكلام والأزرار بيتكتبوا من السبب الحقيقي** — العميل اللي مش
        بيرد عنوانه مظبوط، فمالوش لازمة يشوف زرار "عدّل العنوان".
      */}
      {order.order_status === "awaiting_action" && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-lg leading-none">⚠️</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-amber-900">
                {advice.title}
              </div>
              {order.bosta_exception && (
                <div className="mt-0.5 text-sm text-amber-800" dir="auto">
                  السبب: {order.bosta_exception}
                </div>
              )}
              <div className="mt-1 text-sm text-amber-800">{advice.hint}</div>
              {isAdmin && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {advice.actions.includes("whatsapp") && whatsappLink && (
                    <a
                      href={whatsappLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      كلّم العميل واتساب
                    </a>
                  )}
                  {advice.actions.includes("address") && order.customers?.id && (
                    <Link
                      href={`/customers/${order.customers.id}`}
                      className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm"
                    >
                      عدّل العنوان
                    </Link>
                  )}
                  {advice.actions.includes("phone") && order.customers?.id && (
                    <Link
                      href={`/customers/${order.customers.id}`}
                      className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm"
                    >
                      صحّح رقم التليفون
                    </Link>
                  )}
                  {advice.actions.includes("cancel") && (
                    <form action={updateOrderStatus}>
                      <input type="hidden" name="order_id" value={order.id} />
                      <input type="hidden" name="status" value="cancelled" />
                      <input
                        type="hidden"
                        name="return_to"
                        value={`/orders/${order.id}`}
                      />
                      <ConfirmButton
                        message="تلغي الأوردر ده؟ (بلّغ بوسطة كمان إنك عايز ترجّع الشحنة)"
                        className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700"
                      >
                        ألغِ الأوردر
                      </ConfirmButton>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {actionError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}
      {saved && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {saved === "1" ? "تم حفظ الحالة الجديدة" : saved}
        </div>
      )}

      {/* التغيير اليدوي للحالة من جوّه الأوردر: للأدمن بس */}
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
          <span className="text-sm font-medium text-gray-700">
            تغيير حالة الأوردر
          </span>
          <StatusBox
            orderId={order.id}
            currentStatus={order.order_status ?? "new"}
            badgeLabel={badge.label}
            badgeClass={badge.className}
            returnTo={`/orders/${order.id}`}
            // جوّه الأوردر القايمة كاملة — "مرتجع بعد التسليم" موجودة هنا
            // لأن ساعات المرتجع بيتعمل في بوسطة بالإيد ولازم تظبّطها بنفسك.
            // برّه في قايمة الأوردرات مش موجودة.
            options={ORDER_STATUS_OPTIONS}
            updateAction={updateOrderStatus}
          />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-900">بيانات العميل</h2>
              {/*
                **مابنحكمش على حد من غير أساس.** الشارة مابتظهرش غير لما يبقى
                عنده أوردرين خلصوا على الأقل — قبل كده الجملة تحت بتقول اللي
                نعرفه من غير ما نلزقله وصف.
              */}
              {history.total === 0 ? (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  أول أوردر ليه
                </span>
              ) : history.risk !== "new" ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${historyBadge.className}`}
                >
                  {historyBadge.label}
                </span>
              ) : null}
            </div>
            {order.customers?.id && (
              <Link
                href={`/customers/${order.customers.id}`}
                className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 active:scale-95"
              >
                صفحة العميل
              </Link>
            )}
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">الاسم</dt>
              <dd className="text-gray-900">
                {order.customers?.full_name ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">التليفون</dt>
              <dd className="flex items-center gap-2 text-gray-900" dir="ltr">
                {order.customers?.phone ?? "—"}
                {whatsappLink && (
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 hover:bg-green-100"
                  >
                    واتساب
                  </a>
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-gray-500">العنوان</dt>
              <dd className="text-left text-gray-900">
                {order.customers?.address ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">تاريخ الأوردر</dt>
              <dd className="text-gray-900">{formatDate(order.order_date)}</dd>
            </div>

            {/*
              تاريخه معانا — سطر في نفس الجدول، مش صندوق. الصندوق بيتعمل
              لما تكون فيه حسبة ليها نتيجة (زي مصاريف الشحن تحت)، وده عدّ
              مش حسبة.
            */}
            {history.total > 0 && (
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-gray-500">طلباته قبل كده</dt>
                <dd className="text-left">
                  <span className="text-gray-900">
                    {orderCountWord(history.total)}
                  </span>
                  {historyParts.length > 0 && (
                    <span className="block text-[11px] text-gray-400">
                      {historyParts.map((part, i) => (
                        <span key={part.text}>
                          {i > 0 && " · "}
                          <span
                            className={
                              part.highlight
                                ? history.risk === "bad"
                                  ? "font-medium text-red-600"
                                  : "font-medium text-amber-600"
                                : undefined
                            }
                          >
                            {part.text}
                          </span>
                        </span>
                      ))}
                    </span>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-gray-900">الشحن</h2>

          {order.bosta_state ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-gray-500">حالة بوسطة</dt>
                <dd className="text-gray-900" dir="ltr">
                  {order.bosta_state}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-gray-500">رقم التتبع (بوسطة)</dt>
                <dd className="text-gray-900" dir="ltr">
                  {order.bosta_tracking ?? "—"}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-4">
                <dt className="text-gray-500">الدفع عند الاستلام (COD)</dt>
                <dd className="text-gray-900">{formatMoney(order.bosta_cod)}</dd>
              </div>
              {/* تسوية الشحن: اللي بوسطة خدته − اللي العميل دفعه = الباقي */}
              {(realFee || order.bosta_shipping_cost > 0) &&
                (() => {
                  // **لو بوسطة قالت رقمها الحقيقي، هو اللي يتحاسب** — التقدير
                  // للشحنة اللي لسه شغالة بس، لأن بوسطة مابتقفلش الحساب غير
                  // بعد ما تخلص.
                  const real = realFee?.bosta_fees_real ?? null;
                  const shipPart = realFee?.bosta_ship_fee_real ?? null;
                  const covered = bundleCovered(real, shipPart);
                  const received = CUSTOMER_PAID_STATUSES.includes(
                    order.order_status ?? ""
                  );
                  const s = shippingSettlement({
                    feesReal: real,
                    feesEstimate: order.bosta_shipping_cost,
                    shipFeeReal: shipPart,
                    bundleCovered: covered,
                    shippingPrice: order.shipping_price,
                    customerReceived: received,
                  });

                  // **خصم الباقة متطرح جوّه الرقم الحقيقي أصلاً** — فبنقوله
                  // بس ومابنطرحوش تاني. الطرح التاني هو اللي كان بيطلّع
                  // «بترجع لك ١٤٣٫٨».
                  const detail = !real
                    ? "تقدير — الشحن نفسه محسوب على الباقة"
                    : covered
                      ? "رسوم بوسطة بعد ما الباقة دفعت الشحن"
                      : shipPart && shipPart > 0
                        ? `${formatMoney(shipPart)} شحن + ${formatMoney(
                            Math.round((real - shipPart) * 100) / 100
                          )} رسوم — الباقة ماغطّتش الشحنة دي`
                        : "رقم بوسطة الحقيقي";

                  const tone =
                    s.net === 0
                      ? { box: "bg-gray-100", label: "text-gray-700", value: "text-gray-800" }
                      : s.net < 0
                        ? { box: "bg-green-50", label: "text-green-800", value: "text-green-700" }
                        : { box: "bg-red-50", label: "text-red-800", value: "text-red-700" };

                  return (
                    /* **الخلاصة فوق والبنود تحتها** — اللي بيفتح الأوردر عايز
                       يعرف «الشحن عليّا ولا لأ» الأول، والتفصيل لمّا يسأل
                       «ليه». والبنود مفصولة بخطوط ومتباعدة عشان ماتتلخبطش
                       في بعضها. */
                    /* **مفيش جدول ولا خطوط** — عمر قال الشكل ده متداخل.
                       رجعت لسطور بسيطة زي أول مرة، بس متباعدة وكل سطر
                       شرحه تحته مش جنبه. */
                    <div className="mt-2 space-y-2.5 rounded-lg bg-gray-50 p-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-xs text-gray-600">
                          اللي بوسطة خدته
                        </span>
                        <span className="text-xs font-medium text-gray-900">
                          {formatMoney(s.cost)}
                        </span>
                      </div>
                      <p className="-mt-2 text-[10px] leading-relaxed text-gray-400">
                        {detail}
                      </p>

                      {/* **نصيب الشحنة من الباقة** — من غيره الشحنة اللي
                          الباقة غطّتها بتبان أرخص بمية جنيه من اللي
                          ماغطّتهاش، وهي نفس الخدمة */}
                      {s.bundleShare > 0 && (
                        <>
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="text-xs text-gray-600">
                              نصيبها من الباقة
                            </span>
                            <span className="text-xs font-medium text-gray-900">
                              {formatMoney(s.bundleShare)}
                            </span>
                          </div>
                          <p className="-mt-2 text-[10px] leading-relaxed text-gray-400">
                            الشحن اللي الباقة دفعته بدالك
                          </p>
                        </>
                      )}

                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-xs text-gray-600">دفعه العميل</span>
                        <span className="text-xs font-medium text-gray-700">
                          − {formatMoney(s.paidByCustomer)}
                        </span>
                      </div>
                      {!received && order.shipping_price > 0 && (
                        <p className="-mt-2 text-[10px] leading-relaxed text-gray-400">
                          ماستلمش، فشحن الأوردر ({formatMoney(order.shipping_price)})
                          ماتحصّلش
                        </p>
                      )}

                      <div
                        className={`flex items-baseline justify-between gap-3 rounded-lg px-2.5 py-2 ${tone.box}`}
                      >
                        <span className={`text-xs font-medium ${tone.label}`}>
                          {s.net === 0
                            ? "متعادل"
                            : s.net < 0
                              ? "زيادة معاك من الشحن"
                              : "الشحن عليك"}
                        </span>
                        <span className={`text-sm font-bold ${tone.value}`}>
                          {formatMoney(Math.abs(s.net))}
                        </span>
                      </div>

                      {/* **ملحوظة للي بيقرا الكود مش للشاشة**: الأرباح
                          بتحسب `s.cost` بس مش `s.full` — قسط الباقة متسجّل
                          مصروف شهري لوحده، فلو اتحسب هنا كمان يبقى مدفوع
                          مرتين. الشرح ده كان مكتوب تحت الجدول واتشال:
                          الشاشة تعرض أرقام، مش تشرح مسك الدفاتر. */}
                    </div>
                  );
                })()}
              <div className="flex items-center justify-between gap-4">
                <dt className="text-gray-500">آخر حركة</dt>
                <dd>
                  <span
                    className={`rounded-full bg-gray-50 px-2.5 py-0.5 text-xs font-medium ${lastMove(order).className}`}
                  >
                    {lastMove(order).label}
                  </span>
                </dd>
              </div>
              {/*
                سبب وقوف بوسطة بيفضل هنا بعد ما التحذير اللي فوق يمشي —
                المعلومة مش بتضيع، هي بس بطّلت تصرخ في وش الأوردر.
              */}
              {order.bosta_exception && order.order_status !== "awaiting_action" && (
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-gray-500">آخر ملاحظة من بوسطة</dt>
                  <dd className="text-end text-xs text-gray-600" dir="auto">
                    {order.bosta_exception}
                  </dd>
                </div>
              )}
              {order.bosta_tracking &&
                canPrint &&
                !PRINT_DONE_STATUSES.includes(order.order_status ?? "") && (
                <a
                  href={`/orders/${order.id}/awb`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  >
                    <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
                  </svg>
                  اطبع البوليصة
                </a>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">لسه مفيش شحنة للأوردر ده.</p>
          )}

          {/* مافيش زرار تأكيد مخصوص — تغيير الحالة العادي بيعمل نفس الحاجة،
              والتنبيه اليومي بيوقف لوحده أول ما الحالة تبقى غير "جديد" */}

          {/* الشحنة ماتت عند بوسطة؟ لازم نقولها بصريح العبارة — قبل كده كنت
              بتشوف رقم تتبع وتفتكره شغال، والأوردر يقعد مقفول عليك */}
          {shipmentDead && (
            <div className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3">
              <p className="text-xs font-bold text-red-800">
                ⚠️ الشحنة دي ماتت عند بوسطة ({order.bosta_state})
              </p>
              <p className="mt-1 text-[11px] leading-5 text-red-700">
                مفيش طريقة ترجّعها — بوسطة مابتديش مسار لإحياء شحنة مؤرشفة.
                اعمل شحنة جديدة من الزرار تحت، ورقم التتبع القديم يفضل في السجل.
                والبوليصة القديمة ارميها واطبع الجديدة.
              </p>
            </div>
          )}

          {/* الشحنة قاعدة والمندوب مجاش — تنبيه بدري قبل ما بوسطة تأرشفها */}
          {shipmentAge !== null && shipmentAge >= 3 && !shipmentDead && (
            <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="text-xs font-bold text-amber-900">
                🕗 الشحنة قاعدة {shipmentAge} يوم والمندوب مجاش
              </p>
              <p className="mt-1 text-[11px] leading-5 text-amber-800">
                كلّم بوسطة واطلب المندوب. لو وصلت أسبوعين بوسطة بتأرشف الشحنة
                وساعتها لازم تعمل واحدة جديدة.
              </p>
            </div>
          )}

          {/* إرسال الأوردر لبوسطة كشحنة (لو مفيش شحنة أو اللي فيها ماتت) */}
          {(!order.bosta_tracking || shipmentDead) && canSend && (
            <form
              action={sendOrderToBosta}
              className="mt-3 border-t border-gray-100 pt-3"
            >
              <input type="hidden" name="order_id" value={order.id} />
              <ConfirmButton
                message={`متأكد إنك عايز تبعت أوردر ${order.order_number ?? ""} لبوسطة كشحنة؟`}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white"
              >
                <BostaMark className="h-4 w-4" />
                ابعت لبوسطة كشحنة
              </ConfirmButton>
              <p className="mt-1 text-xs text-gray-400">
                هنعمل الشحنة في بوسطة تلقائياً ونجيب رقم التتبع. لو معرفناش نحدد
                المدينة من العنوان هنوقف ونقوللك تراجعه.
              </p>
            </form>
          )}

          {canLink && (
            <form
              action={linkBostaShipment}
              className="mt-3 border-t border-gray-100 pt-3"
            >
              <input type="hidden" name="order_id" value={order.id} />
              <label className="text-xs text-gray-500">
                ربط شحنة يدوي (لإعادة استخدام شحنة عميل لغى)
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  name="tracking"
                  placeholder="رقم التتبع بتاع بوسطة"
                  dir="ltr"
                  className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700"
                >
                  ربط
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                هيربط الشحنة دي بالأوردر، والمزامنة تجيب باقي التفاصيل تلقائياً
              </p>
            </form>
          )}
        </div>
      </div>

      {/* الدفع والمرتجع بعد التسليم */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-gray-900">الدفع</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">الطريقة</dt>
              <dd className="text-gray-900">
                {paymentMethodLabel(order.payment_method)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">مدفوع مقدماً</dt>
              <dd className="text-gray-900">
                {formatMoney(order.amount_paid ?? 0)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-gray-100 pt-2">
              <dt className="font-medium text-gray-700">المطلوب تحصيله</dt>
              <dd className="font-bold text-gray-900">
                {formatMoney(Math.max(0, grandTotal - (order.amount_paid ?? 0)))}
              </dd>
            </div>
          </dl>
          {canItems && (
            <form
              action={updatePayment}
              className="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3"
            >
              <input type="hidden" name="order_id" value={order.id} />
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">طريقة الدفع</label>
                <select
                  name="payment_method"
                  defaultValue={order.payment_method ?? "cod"}
                  className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">مدفوع مقدماً</label>
                <input
                  key={`paid-${order.amount_paid}`}
                  type="number"
                  name="amount_paid"
                  defaultValue={order.amount_paid ?? 0}
                  min={0}
                  step="0.01"
                  className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
              >
                حفظ
              </button>
            </form>
          )}
        </div>

        {/* المرتجع — بيظهر بس لو الأوردر اتسلّم فعلاً */}
        {(order.order_status === "delivered" ||
          order.order_status === "returned_after_delivery") &&
          isAdmin && (
            <ReturnPanel
              orderId={order.id}
              returnTracking={order.return_tracking}
              canSend={canSend}
              saveAction={saveReturnedItems}
              shipmentAction={createReturnShipment}
              items={order.order_items.map((i) => ({
                id: i.id,
                name: i.product_variants?.products?.name ?? "منتج",
                quantity: i.quantity,
                returnedQuantity: i.returned_quantity ?? 0,
              }))}
            />
          )}

        {/* سبب الرجوع — بيظهر بس لو الشحنة رجعت فعلاً.
            الرقم لوحده (نسبة رجوع ١٧٪) مابيقولش تعمل إيه، والسبب هو اللي
            بيقول: عنوان مش واضح غير عميل مش بيرد غير غيّر رأيه. */}
        {RETURNED_STATUSES.includes(order.order_status ?? "") && canStatus && (
          <div className="mt-4 rounded-xl bg-white p-4 shadow-sm sm:p-5">
            <p className="text-sm font-medium text-gray-900">رجع ليه؟</p>
            <p className="mt-1 text-xs text-gray-500">
              السبب بيخلّي سؤال «بنخسر ليه» له إجابة بالأرقام بدل تخمين.
            </p>
            <form action={updateReturnReason} className="mt-3 flex flex-wrap items-center gap-2">
              <input type="hidden" name="order_id" value={order.id} />
              <select
                name="return_reason"
                defaultValue={order.return_reason ?? ""}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
              >
                <option value="">— اختار السبب —</option>
                {RETURN_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
              >
                حفظ
              </button>
            </form>
          </div>
        )}
        {/* التبديل — نفس شرط المرتجع: الأوردر لازم يكون اتسلّم */}
        {order.order_status === "delivered" && isAdmin && canSend && (
          <div className="mt-4">
            <ExchangePanel
              orderId={order.id}
              exchangeTracking={exchange?.exchange_tracking ?? null}
              exchangeNote={exchange?.exchange_note ?? null}
              shipmentAction={createExchangeShipment}
              items={order.order_items.map((i) => ({
                id: i.id,
                name: i.product_variants?.products?.name ?? "منتج",
                quantity: i.quantity,
              }))}
            />
          </div>
        )}

        {/* تاسكات الأوردر ده — «كلّم العميل» وكده */}
        {orderTasks && (
          <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-gray-900">تاسكات الأوردر</h2>
              {orderTasks.canEdit && (
                <AddTask
                  team={orderTasks.team}
                  canAssign={orderTasks.canAssign}
                  action={createTask}
                  orderId={order.id}
                />
              )}
            </div>
            {orderTasks.list.length === 0 ? (
              <p className="text-xs text-gray-400">مفيش تاسكات على الأوردر ده</p>
            ) : (
              <ul className="space-y-1.5">
                {orderTasks.list.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/tasks/${t.id}`}
                      className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-2 hover:bg-gray-100"
                    >
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] ${taskStatusBadge(t.status).className}`}
                      >
                        {taskStatusBadge(t.status).label}
                      </span>
                      <span
                        className={`min-w-0 flex-1 truncate text-xs ${
                          t.status === "done" ? "text-gray-400 line-through" : "text-gray-800"
                        }`}
                      >
                        {t.title}
                      </span>
                      {(t.task_assignees ?? []).length > 0 && (
                        <span className="shrink-0 text-[10px] text-gray-500">
                          {(t.task_assignees ?? [])
                            .map((a) => a.user_name)
                            .filter(Boolean)
                            .join("، ")}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ===== فلوس المرتجع =====
            بوسطة مابتدفعش للعميل — إنت اللي بتحوّله. الكارت ده بيقولك المبلغ
            وبيسجّل إنك حوّلت، والتنبيهات بتوقف أول ما تأكّد. */}
        {order.order_status === "returned_after_delivery" && refundAmount > 0 && (
          <div
            className={`mt-4 rounded-xl border p-4 ${
              order.refunded_at
                ? "border-green-300 bg-green-50"
                : "border-rose-300 bg-rose-50"
            }`}
          >
            {order.refunded_at ? (
              <>
                <p className="text-sm font-bold text-green-900">
                  ✅ الفلوس رجعت للعميل
                </p>
                <p className="mt-1 text-xs text-green-800">
                  {formatMoney(order.refunded_amount ?? refundAmount)} —{" "}
                  {formatDate(order.refunded_at)}
                </p>
                <form action={undoRefund} className="mt-3">
                  <input type="hidden" name="order_id" value={order.id} />
                  <button
                    type="submit"
                    className="text-[11px] text-green-800 underline"
                  >
                    اتحطت بالغلط؟ ألغِ التأكيد
                  </button>
                </form>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-rose-900">
                  💸 لازم ترجّع فلوس العميل
                </p>
                <p className="mt-1 text-xs leading-6 text-rose-800">
                  المبلغ المحسوب من البنود الراجعة:{" "}
                  <b>{formatMoney(refundAmount)}</b>
                  <br />
                  حوّله للعميل (إنستا باي أو أونلاين) وبعدين أكّد من هنا —
                  والتنبيهات هتفضل توصلك لحد ما تأكّد.
                </p>
                <form action={confirmRefund} className="mt-3 flex items-end gap-2">
                  <input type="hidden" name="order_id" value={order.id} />
                  <div className="flex-1">
                    <label
                      htmlFor="refund_amount"
                      className="text-[11px] text-rose-700"
                    >
                      المبلغ اللي حوّلته
                    </label>
                    <input
                      id="refund_amount"
                      name="amount"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={refundAmount}
                      className="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-rose-500 focus:outline-none"
                    />
                  </div>
                  <ConfirmButton
                    message="متأكد إنك حوّلت الفلوس للعميل؟"
                    className="shrink-0 rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white"
                  >
                    أكّد إني حوّلت
                  </ConfirmButton>
                </form>
              </>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl bg-white shadow-sm">
        <h2 className="border-b border-gray-200 px-5 py-4 text-sm font-bold text-gray-900">
          بنود الأوردر
        </h2>

        {/* ===== موبايل: كروت واضحة ===== */}
        <div className="space-y-2 p-3 md:hidden">
          {order.order_items.map((item) => (
            <OrderItemCard
              key={item.id}
              orderId={order.id}
              itemId={item.id}
              productName={item.product_variants?.products?.name ?? "—"}
              variantName={item.product_variants?.variant_name ?? "—"}
              quantity={item.quantity}
              salePrice={item.sale_price_at_order}
              canEdit={canItems}
              updateAction={updateOrderItem}
              deleteAction={deleteOrderItem}
            />
          ))}

          {/* الملخص */}
          <div className="space-y-1 rounded-xl bg-white px-1 pt-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>إجمالي المنتجات</span>
              <span>{formatMoney(itemsTotal)}</span>
            </div>
            {!isCancelled && (
              <div className="flex justify-between text-gray-600">
                <span>الشحن</span>
                <span>{formatMoney(order.shipping_price)}</span>
              </div>
            )}
            {order.discount > 0 && (
              <div className="flex justify-between text-red-600">
                <span>الخصم</span>
                <span>− {formatMoney(order.discount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-100 pt-1 font-bold text-gray-900">
              <span>الإجمالي</span>
              <span>{formatMoney(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* ===== كمبيوتر: جدول ===== */}
        <table className="hidden w-full text-sm md:table">
          <thead>
            <tr className="border-b border-gray-200 text-right text-gray-500">
              <th className="px-2 py-3 font-medium sm:px-4">المنتج</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">الشكل</th>
              <th className="px-2 py-3 font-medium sm:px-4">الكمية</th>
              <th className="px-2 py-3 font-medium sm:px-4">السعر</th>
              <th className="px-4 py-3 font-medium">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {order.order_items.map((item) =>
              canItems ? (
                <OrderItemRow
                  key={item.id}
                  orderId={order.id}
                  itemId={item.id}
                  productName={item.product_variants?.products?.name ?? "—"}
                  variantName={item.product_variants?.variant_name ?? "—"}
                  quantity={item.quantity}
                  salePrice={item.sale_price_at_order}
                  updateAction={updateOrderItem}
                  deleteAction={deleteOrderItem}
                />
              ) : (
                <tr key={item.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-gray-900">
                    {item.product_variants?.products?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {item.product_variants?.variant_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{item.quantity}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {formatMoney(item.sale_price_at_order)}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {formatMoney(item.quantity * item.sale_price_at_order)}
                  </td>
                </tr>
              )
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 text-gray-700">
              <td className="px-4 py-2" colSpan={4}>
                إجمالي المنتجات
              </td>
              <td className="px-4 py-2">{formatMoney(itemsTotal)}</td>
            </tr>
            {/* الأوردر الملغي مفيهوش شحن خالص */}
            {!isCancelled && (
              <tr className="text-gray-700">
                <td className="px-4 py-2" colSpan={4}>
                  <div className="flex items-center gap-3">
                    <span>الشحن (مدفوع من العميل)</span>
                    {canItems && (
                      <form
                        action={updateShippingPrice}
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="order_id" value={order.id} />
                        <input
                          key={`ship-${order.shipping_price}`}
                          type="number"
                          name="shipping_price"
                          defaultValue={order.shipping_price}
                          min={0}
                          step="0.01"
                          className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
                          aria-label="سعر الشحن"
                        />
                        <button
                          type="submit"
                          className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                        >
                          حفظ
                        </button>
                      </form>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2">{formatMoney(order.shipping_price)}</td>
              </tr>
            )}
            <tr className="text-gray-700">
              <td className="px-4 py-2" colSpan={4}>
                <div className="flex flex-wrap items-center gap-3">
                  <span>الخصم</span>
                  {canItems && (
                    <DiscountBox
                      orderId={order.id}
                      itemsTotal={itemsTotal}
                      currentDiscount={order.discount}
                      updateAction={updateDiscount}
                    />
                  )}
                </div>
              </td>
              <td className="px-4 py-2 text-red-600">
                {order.discount > 0 ? `- ${formatMoney(order.discount)}` : "—"}
              </td>
            </tr>
            <tr className="border-t border-gray-200 font-bold text-gray-900">
              <td className="px-4 py-3" colSpan={4}>
                إجمالي الأوردر
              </td>
              <td className="px-4 py-3">{formatMoney(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>

        {canItems && (
          <AddOrderItem
            orderId={order.id}
            variants={variants}
            addAction={addOrderItem}
          />
        )}
      </div>

      {(canArchive || canDelete) && (
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-6">
          {canArchive && (
            <form action={toggleOrderArchive}>
              <input type="hidden" name="order_id" value={order.id} />
              <input
                type="hidden"
                name="archive"
                value={order.archived ? "0" : "1"}
              />
              <button
                type="submit"
                className="rounded-lg bg-amber-50 px-4 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100"
              >
                {order.archived ? "رجّع من الأرشيف" : "أرشفة الأوردر"}
              </button>
            </form>
          )}
          {canDelete && (
            <form action={deleteOrder}>
              <input type="hidden" name="order_id" value={order.id} />
              <ConfirmButton
                message={
                  isAdmin
                    ? `متأكد إنك عايز تمسح أوردر ${order.order_number ?? ""} نهائياً؟ هيتمسح ببنوده وشحناته، والمخزون هيرجع زي ما كان.`
                    : `هتبعت طلب حذف لأوردر ${order.order_number ?? ""} للأدمن يوافق عليه. تمام؟`
                }
                className="rounded-lg bg-red-50 px-4 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                {isAdmin ? "مسح الأوردر نهائياً" : "اطلب حذف الأوردر"}
              </ConfirmButton>
            </form>
          )}
        </div>
      )}

      {/*
        لينك التتبع اللي بيتبعت للعميل.

        ⚠️ **لوحده تحت الكروت مش جوّه كارت الشحنة** — ده لينك بيتنسخ
        ويتبعت، مش تفصيلة في جدول بيانات.
        ⚠️ **وموجود على كل أوردر من أول لحظة** — مبني على معرّف الأوردر
        مش رقم التتبع، فالعميل يقدر يطمن قبل ما الشحنة تتعمل.
      */}
      {trackLink && (
        <div className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-gray-900">
              لينك التتبع للعميل
            </h2>
            <span className="text-[11px] text-gray-400">
              بيفتح صفحة باسم متجرك
            </span>
          </div>
          <CopyLink url={trackLink} href={trackLink} />
        </div>
      )}

      {/* ===== سجل الأوردر: من أول ما اتعمل لحد آخر حركة ===== */}
      <div className="rounded-xl bg-white shadow-sm">
        <h2 className="border-b border-gray-200 px-5 py-4 text-sm font-bold text-gray-900">
          سجل الأوردر
        </h2>
        <ol className="space-y-0 px-5 py-4">
          {timeline.length === 0 ? (
            <li className="text-sm text-gray-400">مفيش حركات مسجّلة.</li>
          ) : (
            timeline.map((t, i) => (
              <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                {/* خط رأسي بين النقط */}
                {i < timeline.length - 1 && (
                  <span className="absolute start-[5px] top-3 h-full w-px bg-gray-200" />
                )}
                <span
                  className={`relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${t.dot}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-900">{t.text}</div>
                  <div className="text-xs text-gray-400">
                    {t.when}
                    {t.who ? ` · ${t.who}` : ""}
                  </div>
                </div>
              </li>
            ))
          )}
        </ol>
      </div>
    </div>
  );
}
