"use client";

import { usePathname } from "next/navigation";
import { pageTitle } from "@/lib/page-title";

/**
 * التحية على الرئيسية بس، وباقي الصفحات اسمها مكانها (ORDER §١).
 *
 * ⚠️ **مكوّن عميل عشان المسار** — الـlayout سيرفر ومابيعرفش انت فين.
 * والتحية بتتحسب على السيرفر وبتتبعت جاهزة، فمفيش فرق بين أول رسم
 * والرسم اللي بعده.
 */
export function HeaderTitle({ greeting }: { greeting: string }) {
  const pathname = usePathname();
  const title = pageTitle(pathname);
  if (!title) return <span className="truncate">{greeting}</span>;
  return <span className="truncate font-medium text-ink-body">{title}</span>;
}
