"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks: { href: string; label: string; perm: string }[] = [
  { href: "/", label: "الداشبورد", perm: "finance.dashboard" },
  { href: "/orders", label: "الأوردرات", perm: "orders.view" },
  { href: "/customers", label: "العملاء", perm: "customers.view" },
  { href: "/products", label: "المنتجات والمخزون", perm: "products.view" },
  { href: "/expenses", label: "المصاريف", perm: "expenses.view" },
  { href: "/cash", label: "الخزنة", perm: "cash.view" },
  { href: "/users", label: "المستخدمون", perm: "admin.users" },
];

export function NavLinks({
  isAdmin,
  permissions,
}: {
  isAdmin: boolean;
  permissions: string[];
}) {
  const pathname = usePathname();
  const allowed = navLinks.filter(
    (link) => isAdmin || permissions.includes(link.perm)
  );

  return (
    <nav className="flex flex-wrap items-center gap-1">
      {allowed.map((link) => {
        const active =
          link.href === "/"
            ? pathname === "/"
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              active
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
