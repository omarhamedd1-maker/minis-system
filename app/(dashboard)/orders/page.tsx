import Link from "next/link";
import { PeriodFilter } from "@/components/PeriodFilter";
import { FilterBar } from "@/components/FilterBar";
import { FilterSelect } from "@/components/FilterSelect";
import { ShowMore } from "@/components/ShowMore";
import { resolvePeriod } from "@/lib/periods";
import { createClient } from "@/lib/supabase/server";
import {
  COMMENT_DOT_STATUSES,
  MANUAL_ONLY_BY_FLOW,
  ORDER_STATUS_OPTIONS,
  SHIPMENT_STATUSES,
  cairoToday,
  formatDate,
  formatMoney,
  lastMove,
  orderStatusBadge,
  orderStatusClass,
} from "@/lib/format";
import { dailyBoard, boardIsClear } from "@/lib/daily-board";

// حالات الشحن بتتحدّث من بوسطة — بنقفل تغييرها من القايمة برة
// الحالات اللي القايمة **مش** بتعرضها. لازم اللي مش في القايمة يتعرض كشارة
// ثابتة، لأن الـ`select` لما مايلاقيش قيمته بيقع على أول خيار — فأوردر
// "مرتجع بعد التسليم" كان بيبان "جديد". القايمة الواحدة دي تمنع اللخبطة.
const NOT_IN_LIST = [...SHIPMENT_STATUSES, ...MANUAL_ONLY_BY_FLOW];
const LIST_STATUS_OPTIONS = ORDER_STATUS_OPTIONS.filter(
  (o) => !NOT_IN_LIST.includes(o.value)
);
// الأوردر الملغي بيتقفل تعديله من برة بعد 30 ثانية
const CANCEL_LOCK_MS = 30 * 1000;

// وقت النداء — بره الرندر عشان الرندر يبقى نقي
function currentMs() {
  return Date.now();
}

// لينك واتساب العميل بصيغة مصر الدولية (20)
//
// ⚠️ **والرسالة بتتبعت معاه.** الزرار ده كان بيفتح واتساب **فاضي** — يعني
// صاحب المتجر بيكتب من أول السطر كل مرة، والنص بيطلع مختلف في كل مكالمة.
function waLink(phone: string | null, message?: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const intl = digits.startsWith("20") ? digits : "20" + digits.replace(/^0+/, "");
  const text = String(message ?? "").trim();
  return text
    ? `https://wa.me/${intl}?text=${encodeURIComponent(text)}`
    : `https://wa.me/${intl}`;
}
import {
  addOrderComment,
  deleteOrderComment,
  updateOrderStatusInline,
} from "./[id]/actions";
import { OrderComments } from "@/components/OrderComments";
import { OrderStatusSelect } from "@/components/OrderStatusSelect";
import { BulkStatusBar, SelectAllCheckbox } from "@/components/BulkStatusBar";
import { SendBostaRowButton } from "@/components/SendBostaRowButton";
import { SelectableOrderCard } from "@/components/SelectableOrderCard";
import { bulkUpdateStatus, bulkSendToBosta } from "./[id]/actions";
import { ImportShopifyOrders } from "@/components/ImportShopifyOrders";
import { importShopifyOrders } from "./actions";
import { can, requirePagePermission } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderTemplate } from "@/lib/message-template";
import { templateFor } from "@/lib/message-kinds";
import { loadStoredTemplates } from "@/lib/message-templates-db";
import { ConfirmButton } from "@/components/ConfirmButton";
import { approveDeletion, rejectDeletion } from "./[id]/actions";
import { allRows } from "@/lib/fetch-all-pages";

type OrderRow = {
  id: string;
  order_number: string | null;
  order_status: string | null;
  order_date: string | null;
  created_at: string | null;
  delivered_at: string | null;
  bosta_created_at: string | null;
  cancelled_at: string | null;
  shipping_price: number;
  discount: number;
  bosta_state: string | null;
  bosta_collected: boolean;
  bosta_tracking: string | null;
  cash_received_at: string | null;
  customers: { full_name: string | null; phone: string | null } | null;
  order_items: {
    quantity: number;
    sale_price_at_order: number;
  }[];
  order_comments: {
    id: string;
    author_name: string;
    body: string;
    created_at: string;
  }[];
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    deleted?: string;
    archived?: string;
    saved?: string;
    q?: string;
    bulk?: string;
    show?: string;
    period?: string;
    from?: string;
    to?: string;
    /** أرقام أوردرات محددة بالظبط — بييجي من الإشعارات */
    only?: string;
  }>;
}) {
  const {
    status,
    deleted,
    archived,
    saved,
    q,
    bulk,
    show,
    period: rawPeriod,
    from: rawFrom,
    to: rawTo,
    only,
  } = await searchParams;

  // **الإشعار بيوديك على أوردراته هو بس.** قبل كده كان بيوديك على القايمة
  // كلها بالحالة، فإشعار بيقول "أوردر واحد رجع" يفتحلك ٧ أوردرات وإنت
  // تدوّر على اللي هو قصده.
  const onlyIds = (only ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const showArchived = archived === "1";
  const searchTerm = (q ?? "").trim();
  // ⚠️ **الفترة من `lib/periods`** — مصدر واحد لكل الصفحات (المرحلة ٢).
  // الافتراضي هنا «كل الوقت» زي ما كان: تغييره بيخفي الأوردرات الأقدم من العرض
  // الافتراضي — ومستني قرار (docs/PHASE2-RESTRUCTURE.md).
  const range = resolvePeriod(
    { period: rawPeriod, from: rawFrom, to: rawTo },
    { today: cairoToday(), defaultKey: "all" }
  );
  const periodStart = range.start;
  // الأوردرات مالهاش تاريخ في المستقبل، فالنهاية بتفرق في المدة المخصصة بس
  const periodEnd = range.key === "custom" ? range.end : null;
  // الفترة في اللينكات — عشان التنقل بين الفلاتر مايضيّعهاش
  const periodParams: Record<string, string> =
    range.key === "custom"
      ? { from: range.from!, to: range.to! }
      : range.key !== "all"
        ? { period: range.key }
        : {};
  // بنحافظ على الفلاتر في لينك الرجوع
  const returnParams = new URLSearchParams();
  if (showArchived) returnParams.set("archived", "1");
  else if (status) returnParams.set("status", status);
  for (const [k, v] of Object.entries(periodParams)) returnParams.set(k, v);
  const returnTo = `/orders${returnParams.toString() ? `?${returnParams}` : ""}`;
  // بيبني لينك للأوردرات مع الحفاظ على فلتر الوقت
  const nowMs = currentMs();
  // بيبني رابط الفلتر وهو **شايل البحث والفترة معاه**.
  // قبل كده كان بيشيل كلمة البحث، فأول ما تدوس على أي شريحة حالة بعد ما
  // تدوّر، البحث يضيع وتبدأ من الأول.
  const periodQS = (extra: string) => {
    const p = new URLSearchParams(extra);
    for (const [k, v] of Object.entries(periodParams)) if (!p.has(k)) p.set(k, v);
    if (searchTerm && !p.has("q")) p.set("q", searchTerm);
    return `/orders${p.toString() ? `?${p}` : ""}`;
  };
  // شرايح الفلاتر المفعّلة — قاعدة ٨ في DESIGN.md
  const filterChips: { label: string; removeHref: string }[] = [];
  if (status) {
    filterChips.push({ label: orderStatusBadge(status).label, removeHref: periodQS("") });
  }
  if (showArchived) filterChips.push({ label: "الأرشيف", removeHref: periodQS("") });
  if (searchTerm) {
    const p = new URLSearchParams();
    if (showArchived) p.set("archived", "1");
    else if (status) p.set("status", status);
    for (const [k, v] of Object.entries(periodParams)) p.set(k, v);
    filterChips.push({
      label: `بحث: ${searchTerm}`,
      removeHref: `/orders${p.toString() ? `?${p}` : ""}`,
    });
  }
  const hasFilters = Boolean(status || showArchived || searchTerm) || range.key !== "all";

  // عدد المعروض: 50 افتراضي، وبيزيد بزرار "عرض المزيد". في البحث بنجيب أكتر
  const showCount = Math.min(
    Math.max(Number(show) || 50, 50),
    5000
  );
  const fetchLimit = searchTerm ? 3000 : showCount;
  const user = await requirePagePermission("orders.view");
  const canCreate = can(user, "orders.create");
  const canStatus = can(user, "orders.status");
  const canPrint = can(user, "ship.print");
  const canSend = can(user, "ship.send");
  const canComments = can(user, "orders.comments");

  // ⚠️ **القالب بمفتاح الأدمن** — الجدول مقفول في الـRLS، والفشل هنا
  // معناه النص الافتراضي مش شاشة واقعة.
  const messageTemplate = templateFor(
    "general",
    await loadStoredTemplates(createAdminClient(), user.tenantId)
  );
  const supabase = await createClient();

  // طلبات الحذف المستنية موافقة الأدمن (مبدأ الشخصين)
  const pendingDeletions = user.isAdmin
    ? (
        await createAdminClient()
          .from("deletion_requests")
          .select("id, order_number, requested_by_name, created_at")
          // ⚠️ **بمفتاح الأدمن، فالفلتر على البيزنس لازم بإيدنا** — من غيره
          // أدمن بيزنس بيشوف طلبات حذف بيزنس تاني (بأرقام أوردراتهم
          // وأسماء موظفيهم)
          .eq("tenant_id", user.tenantId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .overrideTypes<
            {
              id: string;
              order_number: string | null;
              requested_by_name: string | null;
              created_at: string;
            }[]
          >()
      ).data ?? []
    : [];

  // ⚠️ **اللوحة ليها استعلامها لوحدها بقصد.** الاستعلام اللي تحت مفلتر
  // بالحالة والفترة، واللوحة لازم تشوف كل حاجة — يعني لو فتحت «الملغي»
  // تفضل تقول لك إن فيه ٣ محتاجين تأكيد.
  const boardRows =
    (
      await allRows(supabase
        .from("orders")
        .select(
          "id, order_status, bosta_tracking, bosta_created_at, bosta_cod, bosta_collected"
        )
        .eq("archived", false)
        .overrideTypes<
          {
            id: string;
            order_status: string | null;
            bosta_tracking: string | null;
            bosta_created_at: string | null;
            bosta_cod: number | null;
            bosta_collected: boolean | null;
          }[]
        >())
    ).data ?? [];

  const board = dailyBoard(
    boardRows.map((o) => ({
      id: o.id,
      orderStatus: o.order_status,
      bostaTracking: o.bosta_tracking,
      bostaCreatedAt: o.bosta_created_at,
      bostaCod: o.bosta_cod,
      bostaCollected: o.bosta_collected,
    })),
    new Date()
  );

  let query = supabase
    .from("orders")
    .select(
      "id, order_number, order_status, order_date, created_at, delivered_at, bosta_created_at, cancelled_at, shipping_price, discount, bosta_state, bosta_collected, bosta_tracking, cash_received_at, customers(full_name, phone), order_items(quantity, sale_price_at_order), order_comments(id, author_name, body, created_at)"
    )
    .eq("archived", showArchived)
    .order("created_at", { referencedTable: "order_comments", ascending: true });

  // جاي من إشعار؟ الأوردرات دي بالظبط ومفيش فلاتر تانية تشيل واحد منهم
  if (onlyIds.length > 0) {
    query = query.in("id", onlyIds);
  } else {
    if (status) {
      query = query.eq("order_status", status);
    }
    if (periodStart) {
      query = query.gte("order_date", periodStart);
    }
    if (periodEnd) {
      query = query.lte("order_date", periodEnd);
    }
  }

  const { data: fetchedOrders, error } = await query
    .order("order_date", { ascending: false })
    .limit(fetchLimit)
    .overrideTypes<OrderRow[]>();

  if (error) {
    return (
      <div className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
        حصل خطأ أثناء تحميل الأوردرات: {error.message}
      </div>
    );
  }

  // فلترة البحث: رقم الأوردر أو اسم العميل أو تليفونه
  const normalized = searchTerm.toLowerCase().replace(/\s+/g, "");
  const orders = searchTerm
    ? fetchedOrders.filter((order) => {
        const number = (order.order_number ?? "").toLowerCase();
        const name = (order.customers?.full_name ?? "")
          .toLowerCase()
          .replace(/\s+/g, "");
        const phone = (order.customers?.phone ?? "").replace(/\s+/g, "");
        return (
          number.includes(searchTerm.toLowerCase()) ||
          name.includes(normalized) ||
          phone.includes(normalized)
        );
      })
    : fetchedOrders;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">الأوردرات</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-muted">{orders.length} أوردر</span>
          {/* زرار "مطابقة" اتشال — الصفحة نفسها لسه موجودة على
              /orders/reconcile لو احتجتها، بس مش بتاخد مكان في الشاشة */}
          {/* السلات المتروكة وصحة التشغيل بقوا في القايمة الجانبية —
              اللينك الباهت هنا كان بيتوه جنب الأزرار */}
          {canCreate && <ImportShopifyOrders action={importShopifyOrders} />}
          {canCreate && (
            <Link
              href="/orders/new"
              className="rounded-control bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
            >
              إضافة أوردر
            </Link>
          )}
        </div>
      </div>

      {/*
        مستنيك النهاردة.

        كل رقم بيفتح **نفس الأوردرات دي بالظبط** مش فلتر قريب منها —
        السطر اللي بيقول «٣ واقفين» لازم يفتح التلاتة، مش كل اللي عند بوسطة.
        ولو مفيش حاجة عاجلة، الشريط بيختفي خالص بدل ما ياخد مكان بأصفار.
      */}
      {!boardIsClear(board) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {board
            .filter((row) => row.count > 0)
            .map((row) => (
              <Link
                key={row.key}
                href={row.href}
                className={"flex items-baseline gap-2 rounded-control px-3 py-1.5 text-sm hover:brightness-95 " +
                  (row.urgent
                    ? "bg-warning-soft text-warning"
                    : "bg-surface text-ink-muted shadow-card")}
              >
                <span className="font-bold tabular-nums">
                  {row.money === undefined
                    ? row.count
                    : formatMoney(row.money)}
                </span>
                <span>{row.label}</span>
              </Link>
            ))}
        </div>
      )}

      {deleted && (
        <div className="mb-4 rounded-control bg-success-soft px-4 py-3 text-sm text-success">
          تم مسح الأوردر ورجّعنا مخزونه
        </div>
      )}
      {saved && (
        <div className="mb-4 rounded-control bg-success-soft px-4 py-3 text-sm text-success">
          {saved === "1" ? "تم حفظ الحالة الجديدة" : saved}
        </div>
      )}
      {bulk && (
        <div className="mb-4 rounded-control bg-success-soft px-4 py-3 text-sm text-success">
          تم تغيير حالة {bulk} أوردر
        </div>
      )}

      {/* التنبيهات كلها بقت في أيقونة الإشعارات فوق — عمر مش عايز بانرات
          بتاخد نص الشاشة */}

      {/* جاي من إشعار: بنقول له إنه شايف جزء بس، وإزاي يرجع للكل */}
      {onlyIds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-control bg-info-soft px-4 py-3 text-sm text-info">
          <span>
            بتشوف {orders.length === 1 ? "أوردر واحد" : `${orders.length} أوردر`} جايين من إشعار
          </span>
          <Link href="/orders" className="font-medium underline">
            اعرض كل الأوردرات
          </Link>
        </div>
      )}

      {pendingDeletions.length > 0 && (
        <div className="mb-4 rounded-card border border-warning-line bg-warning-soft p-4">
          <div className="mb-2 text-sm font-bold text-warning">
            طلبات حذف مستنية موافقتك ({pendingDeletions.length})
          </div>
          <ul className="space-y-2">
            {pendingDeletions.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-surface px-3 py-2 text-sm"
              >
                <span className="text-ink-body">
                  أوردر <span className="font-medium">{r.order_number ?? "—"}</span>{" "}
                  <span className="text-ink-muted">
                    (طلبه {r.requested_by_name ?? "غير معروف"})
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <form action={approveDeletion}>
                    <input type="hidden" name="request_id" value={r.id} />
                    <ConfirmButton
                      message={`متأكد إنك عايز تمسح أوردر ${r.order_number ?? ""} نهائياً؟`}
                      className="rounded-control bg-danger px-3 py-1 text-xs font-medium text-white hover:brightness-[0.92]"
                    >
                      وافق وامسح
                    </ConfirmButton>
                  </form>
                  <form action={rejectDeletion}>
                    <input type="hidden" name="request_id" value={r.id} />
                    <button
                      type="submit"
                      className="rounded-control bg-sunken px-3 py-1 text-xs font-medium text-ink-body hover:bg-line"
                    >
                      ارفض
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* شريط الفلاتر الموحّد: بحث · فترة · حالة · مسح — وتحته شرايح المفعّل */}
      <FilterBar
        basePath="/orders"
        query={{
          status: showArchived ? undefined : status,
          archived: showArchived ? "1" : undefined,
          ...periodParams,
        }}
        search={{
          name: "q",
          value: searchTerm,
          placeholder: "دور برقم الأوردر أو اسم العميل أو تليفونه",
        }}
        chips={filterChips}
        clearHref={hasFilters ? "/orders" : undefined}
      >
        <PeriodFilter
          basePath="/orders"
          query={{
            status: showArchived ? undefined : status,
            archived: showArchived ? "1" : undefined,
            q: searchTerm || undefined,
          }}
          current={range}
          defaultKey="all"
          resetKeys={["show"]}
        />
        <FilterSelect
          name="status"
          value={showArchived ? "__archived__" : status}
          options={[
            ...ORDER_STATUS_OPTIONS,
            { value: "__archived__", label: "الأرشيف", params: { archived: "1" } },
          ]}
          allLabel="كل الحالات"
          basePath="/orders"
          query={{ q: searchTerm || undefined, ...periodParams }}
          resetKeys={["show"]}
          label="حالة الأوردر"
        />
      </FilterBar>

      {orders.length === 0 ? (
        <div className="rounded-card bg-surface p-12 text-center text-ink-muted shadow-card">
          {searchTerm
            ? `مفيش أوردرات فيها "${searchTerm}".`
            : showArchived
              ? "الأرشيف فاضي."
              : status
                ? "مفيش أوردرات بالحالة دي."
                : "لسه مفيش أوردرات. أول ما ييجي أوردر من شوبيفاي هيظهر هنا تلقائياً."}
        </div>
      ) : (
        <>
          <BulkStatusBar
            returnTo={returnTo}
            options={LIST_STATUS_OPTIONS}
            updateAction={bulkUpdateStatus}
            canStatus={canStatus}
            canPrint={canPrint}
            canSend={canSend}
            sendAction={bulkSendToBosta}
          />

          {/* ===== موبايل: كروت (بدل الجدول عشان مفيش سحب جانبي) ===== */}
          <div className="space-y-3 md:hidden">
            {orders.map((order) => {
              const total =
                order.order_items.reduce(
                  (sum, item) => sum + item.quantity * item.sale_price_at_order,
                  0
                ) -
                order.discount +
                order.shipping_price;
              const pieces = order.order_items.reduce(
                (sum, item) => sum + item.quantity,
                0
              );
              const st = order.order_status ?? "new";
              const cancelLocked =
                st === "cancelled" &&
                (!order.cancelled_at ||
                  nowMs - new Date(order.cancelled_at).getTime() >
                    CANCEL_LOCK_MS);
              const wa = waLink(
                order.customers?.phone ?? null,
                renderTemplate(messageTemplate, {
                  "الاسم": order.customers?.full_name?.split(" ")[0] ?? null,
                  "رقم الأوردر": order.order_number,
                })
              );
              return (
                <SelectableOrderCard
                  key={order.id}
                  orderId={order.id}
                  hasAwb={Boolean(order.bosta_tracking)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-base font-bold text-ink">
                      {order.customers?.full_name ?? "بدون اسم"}
                    </div>
                    {!canStatus || NOT_IN_LIST.includes(st) || cancelLocked ? (
                      <span
                        className={`shrink-0 ${orderStatusClass(st)}`}
                      >
                        {orderStatusBadge(st).label}
                      </span>
                    ) : (
                      <div className="relative z-10 shrink-0">
                        <OrderStatusSelect
                          orderId={order.id}
                          currentStatus={st}
                          returnTo={returnTo}
                          options={LIST_STATUS_OPTIONS}
                          updateAction={updateOrderStatusInline}
                        />
                      </div>
                    )}
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink-muted">
                    <span>التاريخ: {formatDate(order.order_date)}</span>
                    <span>
                      الإجمالي:{" "}
                      <span className="text-sm font-bold text-ink">
                        {formatMoney(total)}
                      </span>
                    </span>
                    <span>القطع: {pieces}</span>
                    <span className="flex items-center gap-1">
                      آخر حركة:
                      <span className={lastMove(order).className}>
                        {lastMove(order).label}
                      </span>
                    </span>
                  </div>

                  <div className="mt-2 flex items-center gap-3 border-t border-line pt-2">
                  <div className="relative z-10 flex w-fit items-center gap-3">
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="واتساب العميل"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success-soft text-success"
                      >
                        <svg
                          viewBox="0 0 448 512"
                          fill="currentColor"
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        >
                          <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
                        </svg>
                      </a>
                    )}
                    {order.bosta_tracking && canPrint && (
                      <a
                        href={`/orders/${order.id}/awb`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="اطبع البوليصة"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sunken text-ink-muted"
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
                      </a>
                    )}
                    {!order.bosta_tracking && canSend && (
                      <SendBostaRowButton
                        orderId={order.id}
                        orderNumber={order.order_number ?? ""}
                        sendAction={bulkSendToBosta}
                      />
                    )}
                    <OrderComments
                      orderId={order.id}
                      orderNumber={order.order_number ?? ""}
                      comments={order.order_comments}
                      isAdmin={canComments}
                      hideDot={!COMMENT_DOT_STATUSES.includes(order.order_status ?? "")}
                      addAction={addOrderComment}
                      deleteAction={deleteOrderComment}
                    />
                  </div>
                  {/* رقم الأوردر في نفس سطر الأيقونات على الشمال */}
                  <span className="ms-auto shrink-0 text-xs text-ink-muted">
                    {order.order_number ?? "بدون رقم"}
                  </span>
                  </div>
                </SelectableOrderCard>
              );
            })}
          </div>

          {/* ===== كمبيوتر: جدول ===== */}
          <div className="hidden overflow-x-auto rounded-card bg-surface shadow-card md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-right text-ink-muted">
                <th className="px-4 py-3 font-medium">
                  <SelectAllCheckbox />
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  رقم الأوردر
                </th>
                <th className="w-full px-4 py-3 font-medium">العميل</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  التاريخ
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  الإجمالي
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  آخر حركة
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  عدد القطع
                </th>
                <th className="px-4 py-3 font-medium">الحالة</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const total =
                  order.order_items.reduce(
                    (sum, item) =>
                      sum + item.quantity * item.sale_price_at_order,
                    0
                  ) -
                  order.discount +
                  order.shipping_price;
                const pieces = order.order_items.reduce(
                  (sum, item) => sum + item.quantity,
                  0
                );
                return (
                  <tr
                    key={order.id}
                    className="border-b border-line last:border-0 hover:bg-sunken"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        data-order-checkbox
                        data-has-awb={order.bosta_tracking ? "1" : "0"}
                        value={order.id}
                        aria-label="تحديد الأوردر"
                        className="h-4 w-4 rounded border-line-strong"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/orders/${order.id}`}
                        className="font-medium text-ink hover:underline"
                      >
                        {order.order_number ?? "بدون رقم"}
                      </Link>
                    </td>
                    <td className="w-full px-4 py-3 text-ink-body">
                      {order.customers?.full_name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-body">
                      {formatDate(order.order_date)}
                    </td>
                    <td className="px-4 py-3 text-ink-body">
                      {formatMoney(total)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`text-xs ${lastMove(order).className}`}>
                        {lastMove(order).label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-body">
                      {pieces} قطعة
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const st = order.order_status ?? "new";
                        // ملغي من أكتر من دقيقتين: التعديل من جوه الأوردر بس
                        const cancelLocked =
                          st === "cancelled" &&
                          (!order.cancelled_at ||
                            nowMs - new Date(order.cancelled_at).getTime() >
                              CANCEL_LOCK_MS);
                        if (
                          !canStatus ||
                          NOT_IN_LIST.includes(st) ||
                          cancelLocked
                        ) {
                          return (
                            <span
                              className={orderStatusClass(st)}
                              title="التعديل من جوّه الأوردر بس"
                            >
                              {orderStatusBadge(st).label}
                            </span>
                          );
                        }
                        return (
                          <OrderStatusSelect
                            orderId={order.id}
                            currentStatus={st}
                            returnTo={returnTo}
                            options={LIST_STATUS_OPTIONS}
                            updateAction={updateOrderStatusInline}
                          />
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/orders/${order.id}`}
                          className="rounded-control bg-sunken px-3 py-1 text-xs font-medium text-ink-body hover:bg-line"
                        >
                          فتح
                        </Link>
                        {waLink(order.customers?.phone ?? null) && (
                          <a
                            href={
                              waLink(
                                order.customers?.phone ?? null,
                                renderTemplate(messageTemplate, {
                                  "الاسم":
                                    order.customers?.full_name?.split(" ")[0] ??
                                    null,
                                  "رقم الأوردر": order.order_number,
                                })
                              )!
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            title="واتساب العميل"
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success-soft text-success hover:bg-success-line"
                          >
                            <svg
                              viewBox="0 0 448 512"
                              fill="currentColor"
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            >
                              <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
                            </svg>
                          </a>
                        )}
                        {order.bosta_tracking && canPrint && (
                          <a
                            href={`/orders/${order.id}/awb`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="اطبع البوليصة"
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sunken text-ink-muted hover:bg-line"
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
                          </a>
                        )}
                        {!order.bosta_tracking && canSend && (
                          <SendBostaRowButton
                            orderId={order.id}
                            orderNumber={order.order_number ?? ""}
                            sendAction={bulkSendToBosta}
                          />
                        )}
                        <OrderComments
                          orderId={order.id}
                          orderNumber={order.order_number ?? ""}
                          comments={order.order_comments}
                          isAdmin={canComments}
                          hideDot={!COMMENT_DOT_STATUSES.includes(order.order_status ?? "")}
                          addAction={addOrderComment}
                          deleteAction={deleteOrderComment}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          {/* الإجمالي مش معروف هنا — بنجيب بقد المعروض بالظبط */}
          {!searchTerm && orders.length >= showCount && (
            <ShowMore
              basePath="/orders"
              query={{
                status: showArchived ? undefined : status,
                archived: showArchived ? "1" : undefined,
                ...periodParams,
              }}
              shown={showCount}
            />
          )}
        </>
      )}
    </div>
  );
}
