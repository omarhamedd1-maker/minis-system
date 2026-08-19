"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/app/login/actions";
import {
  notifyStoredFlagChanged,
  useStoredFlag,
} from "@/lib/use-stored-flag";

type Leaf = { href: string; label: string; perm: string };
type Item = Leaf & {
  /** صفحات جوّه البند — بتظهر منسدلة تحته */
  children?: Leaf[];
};
/** بعد الفلترة الأبناء بيبقوا موجودين أو undefined — النوع ده بيعبّر عن ده */
type Allowed = Leaf & { children: Leaf[] | undefined };

const ITEMS: Item[] = [
  { href: "/", label: "الداشبورد", perm: "finance.dashboard" },
  {
    href: "/orders",
    label: "الأوردرات",
    perm: "orders.view",
    children: [
      { href: "/orders/carts", label: "سلات متروكة", perm: "orders.view" },
      { href: "/orders/followup", label: "اسأل بعد التسليم", perm: "orders.view" },
    ],
  },
  { href: "/tasks", label: "التاسكات", perm: "tasks.view" },
  {
    href: "/customers",
    label: "العملاء",
    perm: "customers.view",
    children: [
      { href: "/customers/segments", label: "الشرايح", perm: "customers.view" },
    ],
  },
  { href: "/products", label: "المنتجات", perm: "products.view" },
  { href: "/suppliers", label: "الموردين", perm: "suppliers.view" },
  { href: "/expenses", label: "المصاريف", perm: "expenses.view" },
  { href: "/cash", label: "الخزنة", perm: "cash.view" },
  { href: "/users", label: "المستخدمون", perm: "admin.users" },
  { href: "/settings", label: "الإعدادات", perm: "admin.settings" },
  { href: "/platform", label: "البيزنسات", perm: "platform" },
];

// أيقونة كل صفحة (خط بسيط)
function Icon({ href, className }: { href: string; className?: string }) {
  const paths: Record<string, string> = {
    "/": "M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5Z",
    "/orders": "M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5 12 12l8-4.5M12 12v9",
    "/tasks": "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 14l2 2 4-4",
    "/customers": "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
    "/orders/health": "M3 12h4l2-6 3 12 2.5-7 1.5 3h5",
    "/orders/followup":
      "M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.8-.9L3 20.5l1.5-4.5a8.4 8.4 0 0 1-.9-3.8 8.4 8.4 0 0 1 8.4-9 8.4 8.4 0 0 1 9 8.3z",
    "/orders/carts":
      "M3 4h2l2.4 10.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
    "/customers/segments":
      "M12 3a9 9 0 1 0 9 9h-9V3zM14.5 3.5A7.5 7.5 0 0 1 20.5 9.5h-6v-6z",
    "/products":
      "M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.1 18.1 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3zM6 6h.008v.008H6V6z",
    "/suppliers":
      "M3 9h13v8H3V9zM16 12h3.5L21 15v2h-5v-5zM7 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM18 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
    "/expenses": "M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6",
    "/cash":
      "M20 8H5a2 2 0 0 1 0-4h13v4zM3 6v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1M16.5 13h.01",
    "/users": "M12 3l8 3v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-3zM9 12l2 2 4-4",
    "/platform":
      "M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M9 11h.01M15 11h.01",
    "/settings":
      "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={paths[href] ?? ""} />
    </svg>
  );
}

export function AppNav({
  isAdmin,
  permissions,
  isPlatformAdmin,
}: {
  isAdmin: boolean;
  permissions: string[];
  isPlatformAdmin: boolean;
}) {
  const pathname = usePathname();
  const expanded = useStoredFlag("navExpanded");
  const [moreOpen, setMoreOpen] = useState(false);

  function toggle() {
    localStorage.setItem("navExpanded", expanded ? "0" : "1");
    notifyStoredFlagChanged();
  }

  const may = (perm: string) =>
    perm === "platform" ? isPlatformAdmin : isAdmin || permissions.includes(perm);
  const allowed = ITEMS.filter((i) => may(i.perm)).map((i) => ({
    ...i,
    children: i.children?.filter((c) => may(c.perm)),
  }));
  /**
   * **الأطول بيكسب.** `/orders` و`/orders/health` الاتنين بيطابقوا وإنت في
   * صحة التشغيل، فمن غير الشرط ده الاتنين بيتلوّنوا مع بعض والقايمة بتكدب
   * عليك إنت فين.
   */
  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (!pathname.startsWith(href)) return false;
    return !allowed.some(
      (o) =>
        o.href !== href &&
        o.href.length > href.length &&
        pathname.startsWith(o.href)
    );
  };

  // التليفون: الثابتة في البار السفلي، والباقي في "المزيد".
  // التاسكات بعد الخزنة وقبل "المزيد" — عمر طلبها كده بالنص.
  const PRIMARY_HREFS = ["/", "/orders", "/expenses", "/cash", "/tasks"];
  const primary = PRIMARY_HREFS.map((h) =>
    allowed.find((i) => i.href === h)
  ).filter((i): i is Allowed => Boolean(i));
  const overflow = allowed.filter((i) => !PRIMARY_HREFS.includes(i.href));

  return (
    <>
      {/* ===== شريط جانبي (كمبيوتر) — على اليمين ===== */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-e border-gray-200 bg-white transition-[width] duration-200 md:flex ${
          expanded ? "w-56" : "w-16"
        }`}
      >
        <div className="flex h-14 items-center gap-2 border-b border-gray-100 px-3">
          {expanded && (
            <span className="text-lg font-bold tracking-wide text-gray-900">
              Gridpoint
            </span>
          )}
          <button
            type="button"
            onClick={toggle}
            title={expanded ? "تصغير القائمة" : "توسيع القائمة"}
            className="ms-auto flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-5 w-5 transition-transform ${expanded ? "" : "rotate-180"}`}
            >
              <path d="M13 6l-6 6 6 6M18 6v12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
          {allowed.map((i) => {
            const active = isActive(i.href);
            // **الأبناء بيبانوا لما تكون جوّه المجموعة بس.** القايمة اللي
            // كل حاجة فيها مفتوحة على طول بتبقى طويلة ومالهاش معنى.
            const inGroup = i.href !== "/" && pathname.startsWith(i.href);
            const kids = expanded && inGroup ? (i.children ?? []) : [];
            return (
              <div key={i.href}>
                <Link
                  href={i.href}
                  title={i.label}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                    active
                      ? "bg-gray-900 text-white"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  } ${expanded ? "" : "justify-center"}`}
                >
                  <Icon href={i.href} className="h-5 w-5 shrink-0" />
                  {expanded && (
                    <span className="whitespace-nowrap text-sm font-medium">
                      {i.label}
                    </span>
                  )}
                </Link>

                {kids.map((c) => {
                  const on = pathname.startsWith(c.href);
                  return (
                    <Link
                      key={c.href}
                      href={c.href}
                      className={`mt-1 flex items-center gap-2 rounded-lg py-1.5 pe-3 ps-9 text-sm ${
                        on
                          ? "bg-gray-100 font-medium text-gray-900"
                          : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          on ? "bg-gray-900" : "bg-gray-300"
                        }`}
                      />
                      <span className="whitespace-nowrap">{c.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <form action={logout} className="border-t border-gray-100 p-2">
          <button
            type="submit"
            title="تسجيل الخروج"
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 ${
              expanded ? "" : "justify-center"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5 shrink-0"
            >
              <path d="M15 12H4m0 0 3.5-3.5M4 12l3.5 3.5M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
            </svg>
            {expanded && <span className="text-sm font-medium">تسجيل الخروج</span>}
          </button>
        </form>
      </aside>

      {/* ===== قائمة عائمة (تليفون) — على شكل Pill زي شوبيفاي ===== */}
      <nav className="fixed inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-3 md:hidden">
        <div className="flex items-center gap-1 rounded-full bg-white p-1.5 shadow-[0_6px_24px_rgba(0,0,0,0.14)] ring-1 ring-black/5">
          {primary.map((i) => {
            const active = isActive(i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                title={i.label}
                aria-label={i.label}
                className={`flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-[0.88] ${
                  active
                    ? "bg-gray-900 text-white active:bg-black"
                    : "text-gray-500 active:bg-gray-200"
                }`}
              >
                <Icon href={i.href} className="h-5 w-5" />
              </Link>
            );
          })}
          {overflow.length > 0 && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              title="المزيد"
              aria-label="المزيد"
              className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 transition-transform active:scale-[0.88] active:bg-gray-200"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                className="h-5 w-5"
              >
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          )}
        </div>
      </nav>

      {/* قائمة "المزيد" على التليفون */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-300" />
            <div className="grid grid-cols-3 gap-2">
              {overflow.map((i) => {
                const active = isActive(i.href);
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    onClick={() => setMoreOpen(false)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl p-3 text-xs font-medium ${
                      active
                        ? "bg-gray-900 text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <Icon href={i.href} className="h-6 w-6" />
                    <span>{i.label}</span>
                  </Link>
                );
              })}
            </div>
            <form action={logout} className="mt-3">
              <button
                type="submit"
                className="w-full rounded-xl bg-gray-100 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                تسجيل الخروج
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
