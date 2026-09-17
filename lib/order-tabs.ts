/**
 * ==========================================================================
 * تبويبات قايمة الأوردرات (ORDERS-PAGE-REDESIGN §١ · الخطوة ٤)
 * --------------------------------------------------------------------------
 * ٤ تبويبات بدل ١٢ شريحة. والحالة بعينها في منسدلة جنبهم — بتتقصر على
 * حالات التبويب المفتوح، والأرشيف جوّاها مش تبويب خامس.
 *
 * ⚠️ **كل حالة في تبويب واحد بالظبط** — عليه اختبار. حالة جديدة من غير
 * تبويب كانت هتختفي من كل التبويبات ماعدا «الكل».
 * ==========================================================================
 */

export type OrderTabKey = "all" | "work" | "transit" | "done";

export type OrderTab = { key: OrderTabKey; label: string; statuses: string[] };

export const ORDER_TABS: OrderTab[] = [
  { key: "all", label: "الكل", statuses: [] },
  {
    key: "work",
    label: "محتاج شغل",
    statuses: ["new", "confirmed", "packed", "ready", "awaiting_action"],
  },
  {
    key: "transit",
    label: "في الطريق",
    statuses: ["shipped", "out_for_delivery", "returning"],
  },
  {
    key: "done",
    label: "خلصت",
    statuses: ["delivered", "returned", "returned_after_delivery", "cancelled"],
  },
];

export function tabOfStatus(status: string | null | undefined): OrderTab | null {
  return ORDER_TABS.find((t) => t.statuses.includes(String(status ?? ""))) ?? null;
}

/**
 * التبويب المفتوح: لو فيه حالة بعينها → تبويبها (عشان التبويب يبان
 * متعلّم صح)، وإلا اللي في اللينك، وإلا «الكل».
 */
export function resolveOrderTab(
  rawTab: string | null | undefined,
  status: string | null | undefined
): OrderTab {
  if (status) {
    const own = tabOfStatus(status);
    if (own) return own;
  }
  return ORDER_TABS.find((t) => t.key === rawTab) ?? ORDER_TABS[0];
}
