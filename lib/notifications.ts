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
  {
    status: "returning",
    title: "أوردرات في الطريق ليك",
    level: "info" as NoticeLevel,
  },
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

  return notices.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}
