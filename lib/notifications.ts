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

/**
 * الإشعار اللي عمره يوم بيمشي من الجرس.
 *
 * "رجع ومتسلمش" حالة **نهائية** — الأوردر رجع وخلاص، والإشعار وظيفته يقولك
 * إنه حصل مش إنه فاضل. فكان بيتجمّع: ٣٩ أوردر قاعدين في الجرس من شهور،
 * والرقم الكبير ده بيخلّي الجرس نفسه يتتشاف كضوضاء فتضيع الحاجة المهمة.
 * الإشعار على الموبايل بيوصل مرة واحدة زي ما هو — ده بيخص الجرس بس.
 */
const RETURNED_LIVES_HOURS = 24;

/** الحالات اللي معناها "قف واعمل حاجة" */
const ATTENTION_STATUSES = [
  {
    status: "awaiting_action",
    title: "أوردرات مستنية قرار منك",
    level: "danger" as NoticeLevel,
    /** لسه محتاج قرار مهما طال — فبيفضل في الجرس */
    freshOnly: false,
  },
  {
    status: "returned",
    title: "أوردرات رجعت ومتسلمتش",
    level: "warn" as NoticeLevel,
    freshOnly: true,
  },
  // "في الطريق ليك" مالهاش إشعار بقصد — عمر مش محتاج ينبّه على حاجة
  // ماشية في السكة، هو محتاج ينبّه على اللي واقف ومحتاج قرار.
];

const ORDER = { danger: 0, warn: 1, info: 2 };

/**
 * أنهي أوردر اتغيّرت حالته من ساعات قريبة.
 *
 * **مافيش عمود بيسجّل وقت تغيير الحالة** في `orders`، بس سجل النشاط بيسجّل
 * كل تغيير بسطر `order.status`. والأوردر اللي حالته دلوقتي "رجع ومتسلمش"
 * وآخر سطر تغيير ليه من ساعة، يبقى بقى كده من ساعة — لأن السطر بيتكتب
 * وقت التغيير نفسه.
 *
 * دالة صافية عشان تتختبر من غير قاعدة بيانات.
 */
export function changedWithin(
  log: { order_id?: string | null; created_at?: string | null }[],
  hours: number,
  now: Date = new Date()
): Set<string> {
  const cutoff = now.getTime() - hours * 60 * 60 * 1000;
  const ids = new Set<string>();
  for (const row of log) {
    if (!row.order_id || !row.created_at) continue;
    const t = new Date(row.created_at).getTime();
    if (Number.isFinite(t) && t >= cutoff) ids.add(row.order_id);
  }
  return ids;
}

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
    .select("id, order_number, order_status")
    .eq("tenant_id", tenantId)
    .eq("archived", false)
    .in(
      "order_status",
      ATTENTION_STATUSES.map((s) => s.status)
    )
    .limit(500);

  const orders = (rows ?? []) as unknown as {
    id: string;
    order_number: string | null;
    order_status: string | null;
  }[];

  // مين فيهم اتغيّرت حالته من يوم أو أقل؟ محتاجينها للإشعارات اللي بتمشي
  // بعد يوم. ولو السجل نفسه وقع، بنعرض الكل — إشعار زيادة أهون من إشعار
  // ضايع.
  let fresh: Set<string> | null = null;
  if (orders.some((o) => ATTENTION_STATUSES.some((g) => g.freshOnly && g.status === o.order_status))) {
    const since = new Date(
      Date.now() - RETURNED_LIVES_HOURS * 60 * 60 * 1000
    ).toISOString();
    const { data: log, error } = await db
      .from("activity_log")
      .select("order_id, created_at")
      .eq("action", "order.status")
      .gte("created_at", since)
      .limit(2000);
    if (!error) {
      fresh = changedWithin(
        (log ?? []) as { order_id?: string | null; created_at?: string | null }[],
        RETURNED_LIVES_HOURS
      );
    }
  }

  for (const group of ATTENTION_STATUSES) {
    const items = orders.filter(
      (r) =>
        r.order_status === group.status &&
        (!group.freshOnly || !fresh || fresh.has(r.id))
    );
    if (items.length === 0) continue;
    const numbers = items
      .slice(0, 4)
      .map((r) => r.order_number)
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
