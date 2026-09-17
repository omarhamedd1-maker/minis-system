import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  can,
  requirePagePermission,
  type PermissionKey,
} from "@/lib/permissions";
import {
  boardIsClear,
  dailyBoard,
  sortByAge,
  visibleRows,
  type BoardRow,
} from "@/lib/daily-board";
import { formatMoney } from "@/lib/format";
import { allRows } from "@/lib/fetch-all-pages";
import { refundDue } from "@/lib/refund";
import {
  extraQueues,
  groupOfRow,
  QUEUE_GROUPS,
  QUEUE_LINKS,
} from "@/lib/work-queues";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * كام كارت يبانوا في المجموعة قبل «الباقي».
 *
 * ⚠️ **«مستني إيدك» فيها ٩** — تسع كروت جنب بعض بيرجّعوا نفس المشكلة اللي
 * التقسيم اتعمل عشانها. الستة الأقدم بيبانوا، والباقي مطوي.
 */
const VISIBLE_IN_GROUP = 6;

/**
 * ==========================================================================
 * الشغل — أبدأ منين النهاردة
 * --------------------------------------------------------------------------
 * الداشبورد بيقول «كسبت كام» والأوردرات بتقول «مين اشترى إيه». الصفحة دي
 * بتقول **إيه اللي مستني إيدك دلوقتي** — من غير رسوم بيانية ولا أرقام
 * للفرجة.
 *
 * ⚠️ **العدّ كله من `lib/daily-board.ts`** — مافيش لوجيك عدّ هنا. لو رقم
 * هنا اختلف عن اللوحة اللي في صفحة الأوردرات يبقى فيه مصدرين للحقيقة.
 * ==========================================================================
 */

export default async function WorkPage() {
  const user = await requirePagePermission("orders.view");
  const supabase = await createClient();

  type WorkRow = {
    id: string;
    order_status: string | null;
    order_date: string | null;
    bosta_tracking: string | null;
    bosta_created_at: string | null;
    bosta_cod: number | null;
    bosta_collected: boolean | null;
    refunded_at: string | null;
    return_skip_reason?: string | null;
    order_items: {
      returned_quantity: number | null;
      sale_price_at_order: number;
      cost_price_at_order: number | null;
    }[];
  };
  const BASE =
    "id, order_status, order_date, bosta_tracking, bosta_created_at, bosta_cod, bosta_collected, refunded_at, order_items(returned_quantity, sale_price_at_order, cost_price_at_order)";
  const read = (cols: string) =>
    allRows(supabase.from("orders").select(cols).eq("archived", false).overrideTypes<WorkRow[]>());
  // ⚠️ **العدّ على كل الصفوف مش المعروض** (`allRows`) — عدّادات ناقصة بالصمت أسوأ.
  // `return_skip_reason` من `sql/return-skip.sql` — لحد ما يتشغّل بنقرا من غيره
  // (التمانية القدام هيبانوا في الطابور لحد ساعتها).
  let result = await read(`${BASE}, return_skip_reason`);
  if (result.error?.code === "42703") result = await read(BASE);
  const data = result.data;

  const board = dailyBoard(
    (data ?? []).map((o) => ({
      id: o.id,
      orderStatus: o.order_status,
      orderDate: o.order_date,
      bostaTracking: o.bosta_tracking,
      bostaCreatedAt: o.bosta_created_at,
      bostaCod: o.bosta_cod,
      bostaCollected: o.bosta_collected,
      refundedAt: o.refunded_at,
      returnSkip: o.return_skip_reason ?? null,
      returnedQty: (o.order_items ?? []).reduce((s, i) => s + Number(i.returned_quantity ?? 0), 0),
      refundDue: refundDue(
        (o.order_items ?? []).map((i) => ({
          returnedQuantity: i.returned_quantity,
          salePriceAtOrder: i.sale_price_at_order,
        }))
      ),
    })),
    new Date()
  );

  // الطوابير اللي مصدرها مش الأوردرات (`lib/work-queues.ts`).
  // ⚠️ جدول التقييمات وطلبات الحذف مقفولين في الـRLS، فبيتقروا بمفتاح
  // الأدمن **بفلتر البيزنس** — من غيره بيرجّعوا كل البيزنسات.
  const admin = createAdminClient();
  const [deletions, ratings] = await Promise.all([
    allRows(admin
      .from("deletion_requests")
      .select("order_id, created_at")
      .eq("tenant_id", user.tenantId)
      .eq("status", "pending")
      .overrideTypes<{ order_id: string | null; created_at: string }[]>()),
    allRows(admin
      .from("order_ratings")
      .select("id, stars, created_at")
      .eq("tenant_id", user.tenantId)
      .lte("stars", 3)
      .overrideTypes<{ id: string; stars: number; created_at: string }[]>()),
  ]);
  /** أقدم تاريخ في القايمة بالأيام — `null` لو فاضية */
  const oldestOf = (dates: (string | null | undefined)[]): number | null => {
    const days = dates
      .map((d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000) : NaN))
      .filter((n) => Number.isFinite(n));
    return days.length > 0 ? Math.max(...days) : null;
  };
  const zeroCostOrders = (data ?? []).filter((o) =>
    (o.order_items ?? []).some((i) => !Number(i.cost_price_at_order))
  );
  const extra = extraQueues({
    deletionOrderIds: (deletions.data ?? []).map((d) => d.order_id).filter((v): v is string => Boolean(v)),
    deletionOldestDays: oldestOf((deletions.data ?? []).map((d) => d.created_at)),
    badRatings: (ratings.data ?? []).length,
    ratingOldestDays: oldestOf((ratings.data ?? []).map((r) => r.created_at)),
    zeroCostOldestDays: oldestOf(zeroCostOrders.map((o) => o.order_date)),
    // بند بتكلفة صفر = الربح على الأوردر ده غلط (`lib/zero-cost.ts`)
    zeroCostOrderIds: zeroCostOrders.map((o) => o.id),
  });

  // الصلاحية والترتيب جايين من `lib/daily-board` — مافيش قرار متكرر هنا
  const rows = visibleRows([...board, ...extra], (perm) => can(user, perm));
  const ordered = sortByAge(rows);
  const waiting = rows
    .filter((r) => r.urgent)
    .reduce((sum, r) => sum + r.count, 0);
  const clear = boardIsClear(rows);
  const more = QUEUE_LINKS.filter((m) => can(user, m.perm as PermissionKey));
  // المجموعة الفاضية (كل سطورها متشالة بالصلاحية) مابتظهرش أصلًا
  const groups = QUEUE_GROUPS.map((g) => ({
    ...g,
    rows: ordered.filter((r) => groupOfRow(r.key) === g.key),
    links: more.filter((m) => m.group === g.key),
  })).filter((g) => g.rows.length > 0 || g.links.length > 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-sm font-medium text-ink-muted">الشغل</h1>
        {clear ? (
          <p className="mt-1 text-2xl font-bold text-success sm:text-3xl">
            مفيش حاجة مستنياك
          </p>
        ) : (
          <p className="mt-1 text-3xl font-bold text-ink sm:text-4xl">
            <span className="tabular-nums">{waiting}</span>{" "}
            <span className="text-xl font-bold text-ink-body sm:text-2xl">
              حاجة مستنياك
            </span>
          </p>
        )}
        <p className="mt-1 text-xs text-ink-faint">
          كل رقم بيفتح نفس الأوردرات دي بالظبط — مش فلتر قريب منها.
        </p>
      </div>

      {/*
        التقسيم بيقول **مين مستني مين** — ١١ كارت جنب بعض كانوا قايمة أرقام.
        الترتيب جوّه المجموعة زي ما هو (`sortByUrgent`).
      */}
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className="mb-2 flex items-baseline gap-2">
            <span className="text-sm font-bold text-ink">{g.label}</span>
            <span className="text-[11px] text-ink-faint">{g.note}</span>
          </h2>
          {g.rows.length > 0 && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {g.rows.slice(0, VISIBLE_IN_GROUP).map((row) => (
                <QueueCard key={row.key} row={row} />
              ))}
            </div>
          )}
          {g.rows.length > VISIBLE_IN_GROUP && (
            <details className="group mt-2">
              <summary className="flex min-h-11 cursor-pointer list-none items-center text-xs text-ink-muted [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">
                  + {g.rows.length - VISIBLE_IN_GROUP} كمان
                </span>
                <span className="hidden group-open:inline">− اطوي</span>
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-3">
                {g.rows.slice(VISIBLE_IN_GROUP).map((row) => (
                  <QueueCard key={row.key} row={row} />
                ))}
              </div>
            </details>
          )}
          {g.links.length > 0 && (
            <div
              className={`grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 ${
                g.rows.length > 0 ? "mt-2" : ""
              }`}
            >
              {g.links.map((m) => (
                <Link
                  key={m.href}
                  href={m.href}
                  className="card block p-3 transition-colors hover:bg-sunken"
                >
                  <div className="text-sm font-medium text-ink">{m.label}</div>
                  <div className="mt-0.5 text-[11px] text-ink-faint">{m.note}</div>
                </Link>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

/**
 * كارت الطابور — الكارت كله ضغطة واحدة.
 * الصفر بيفضل مكانه باهت: الثبات أهم من توفير المساحة.
 */
function QueueCard({ row }: { row: BoardRow }) {
  const empty = row.count === 0;
  return (
    <Link
      href={row.href}
      className={`card block p-4 transition-colors hover:bg-sunken ${
        empty ? "opacity-50" : ""
      }`}
    >
      <div
        className={`text-2xl font-bold tabular-nums sm:text-3xl ${
          row.urgent ? "text-ink" : "text-ink-body"
        }`}
      >
        {row.money === undefined ? row.count : formatMoney(row.money)}
      </div>
      <div className="mt-1 text-xs text-ink-muted sm:text-sm">{row.label}</div>
      {row.money !== undefined && (
        <div className="mt-0.5 text-[11px] text-ink-faint">
          {row.count} أوردر
        </div>
      )}
    </Link>
  );
}
