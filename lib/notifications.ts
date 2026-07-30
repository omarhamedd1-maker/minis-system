// ==========================================================================
// الإشعارات — الحاجات الواقفة اللي محتاجة تتحرك
// --------------------------------------------------------------------------
// الفكرة: بدل بانرات كبيرة بتاخد نص الشاشة، أيقونة صغيرة فوق بعدد، وجوّاها
// القايمة. والترتيب بالخطورة — الأخطر فوق.
//
// **مفيش تخمين**: كل إشعار بيقول العدد الحقيقي ويوديك على الفلتر بتاعه.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { readSyncHealth, syncHealthMessage } from "./bosta/sync-runs";
import { refundDue } from "./refund";

export type NoticeLevel = "danger" | "warn" | "info";

export type Notice = {
  id: string;
  level: NoticeLevel;
  title: string;
  detail?: string;
  href?: string;
  count?: number;
};

/** الحالات اللي معناها "قف واعمل حاجة" */
const ATTENTION_STATUSES = [
  {
    status: "awaiting_action",
    title: "أوردرات مستنية قرار منك",
    level: "danger" as NoticeLevel,
  },
  {
    status: "returned",
    title: "أوردرات رجعت ومتسلمتش",
    level: "warn" as NoticeLevel,
  },
  // "في الطريق ليك" مالهاش إشعار بقصد — عمر مش محتاج ينبّه على حاجة
  // ماشية في السكة، هو محتاج ينبّه على اللي واقف ومحتاج قرار.
];

const ORDER = { danger: 0, warn: 1, info: 2 };

/**
 * بيجمع كل الإشعارات.
 * `db` لازم يكون مفتاح الأدمن — جدول `sync_runs` مقفول.
 */
export async function collectNotices(
  db: SupabaseClient,
  tenantId: string
): Promise<Notice[]> {
  const notices: Notice[] = [];

  // ١) المزامنة — ده أخطر إشعار، لأن لو واقفة كل الأرقام تحته قديمة
  const health = await readSyncHealth(db, tenantId);
  const msg = syncHealthMessage(health);
  if (msg) {
    notices.push({
      id: "sync",
      level: "danger",
      title: "المزامنة مع بوسطة فيها مشكلة",
      detail: msg,
    });
  }

  // ٢) الأوردرات الواقفة
  const { data: rows } = await db
    .from("orders")
    .select("order_number, order_status")
    .eq("tenant_id", tenantId)
    .eq("archived", false)
    .in(
      "order_status",
      ATTENTION_STATUSES.map((s) => s.status)
    )
    .limit(500);

  for (const group of ATTENTION_STATUSES) {
    const items = (rows ?? []).filter(
      (r) => (r as { order_status: string }).order_status === group.status
    );
    if (items.length === 0) continue;
    const numbers = items
      .slice(0, 4)
      .map((r) => (r as { order_number: string }).order_number)
      .join("، ");
    notices.push({
      id: group.status,
      level: group.level,
      title: group.title,
      count: items.length,
      detail: numbers + (items.length > 4 ? " وغيرهم" : ""),
      href: `/orders?status=${group.status}`,
    });
  }

  // ٣) فلوس مرتجع لسه مارجعتش للعميل — دي فلوس عليك، فبتبقى في الأحمر
  try {
    const { data: owing } = await db
      .from("orders")
      .select("order_number, order_items(returned_quantity, sale_price_at_order)")
      .eq("tenant_id", tenantId)
      .eq("order_status", "returned_after_delivery")
      .is("refunded_at", null)
      .limit(100);

    const pending = (
      (owing ?? []) as unknown as {
        order_number: string | null;
        order_items: {
          returned_quantity: number | null;
          sale_price_at_order: number;
        }[] | null;
      }[]
    )
      .map((o) => ({
        number: o.order_number,
        amount: refundDue(
          (o.order_items ?? []).map((i) => ({
            returnedQuantity: i.returned_quantity,
            salePriceAtOrder: i.sale_price_at_order,
          }))
        ),
      }))
      .filter((o) => o.amount > 0);

    if (pending.length > 0) {
      const total = Math.round(pending.reduce((s, p) => s + p.amount, 0));
      notices.push({
        id: "refunds",
        level: "danger",
        title: "فلوس مرتجع لسه مارجعتش للعميل",
        count: pending.length,
        detail: `إجمالي ${total} جنيه — ${pending
          .slice(0, 3)
          .map((p) => p.number)
          .join("، ")}${pending.length > 3 ? " وغيرهم" : ""}`,
        href: "/orders?status=returned_after_delivery",
      });
    }
  } catch {
    // الخانة لسه مااتعملتش؟ الإشعار بس هو اللي مايبانش
  }

  return notices.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}
