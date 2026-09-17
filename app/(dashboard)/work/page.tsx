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
  sortByUrgent,
  visibleRows,
  type BoardRow,
} from "@/lib/daily-board";
import { formatMoney } from "@/lib/format";
import { allRows } from "@/lib/fetch-all-pages";
import { refundDue } from "@/lib/refund";

export const dynamic = "force-dynamic";

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

/** الطوابير التانية — كروت أصغر تحت، كل واحد بصلاحيته */
const MORE: { href: string; label: string; note: string; perm: PermissionKey }[] = [
  {
    href: "/orders/rescue",
    label: "اتصل قبل ما ترجع",
    note: "شحنات على وش رجوع",
    perm: "orders.view",
  },
  {
    href: "/orders/risky",
    label: "محتاجة نظرة",
    note: "أوردرات فيها ريبة",
    perm: "orders.view",
  },
  {
    href: "/orders/carts",
    label: "سلات متروكة",
    note: "دخل وساب العربية",
    perm: "orders.view",
  },
  {
    href: "/orders/followup",
    label: "اسأل بعد التسليم",
    note: "عميل استلم من كام يوم",
    perm: "orders.view",
  },
  {
    href: "/orders/reconcile",
    label: "مراجعة الشحنات",
    note: "أرقام بوسطة مقابل عندنا",
    perm: "finance.dashboard",
  },
  { href: "/tasks", label: "التاسكات", note: "اللي عليك وعلى الفريق", perm: "tasks.view" },
  { href: "/inbox", label: "الرسايل", note: "رد على العملاء", perm: "inbox.view" },
];

export default async function WorkPage() {
  const user = await requirePagePermission("orders.view");
  const supabase = await createClient();

  type WorkRow = {
    id: string;
    order_status: string | null;
    bosta_tracking: string | null;
    bosta_created_at: string | null;
    bosta_cod: number | null;
    bosta_collected: boolean | null;
    refunded_at: string | null;
    return_skip_reason?: string | null;
    order_items: { returned_quantity: number | null; sale_price_at_order: number }[];
  };
  const BASE =
    "id, order_status, bosta_tracking, bosta_created_at, bosta_cod, bosta_collected, refunded_at, order_items(returned_quantity, sale_price_at_order)";
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

  // الصلاحية والترتيب جايين من `lib/daily-board` — مافيش قرار متكرر هنا
  const rows = visibleRows(board, (perm) => can(user, perm));
  const ordered = sortByUrgent(rows);
  const waiting = rows
    .filter((r) => r.urgent)
    .reduce((sum, r) => sum + r.count, 0);
  const clear = boardIsClear(rows);
  const more = MORE.filter((m) => can(user, m.perm));

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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {ordered.map((row) => (
          <QueueCard key={row.key} row={row} />
        ))}
      </div>

      {more.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-medium text-ink-muted">
            طوابير تانية
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {more.map((m) => (
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
        </div>
      )}
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
