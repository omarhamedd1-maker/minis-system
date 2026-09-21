"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * ==========================================================================
 * البحث — أيقونة واحدة ذكية (ORDERS-PAGE-REDESIGN · قرار عمر ١٧ سبتمبر)
 * --------------------------------------------------------------------------
 * ⚠️ **ممنوع أيقونة أو خانة بحث تانية جوّه الصفحات.** الأيقونة دي بتبحث في
 * الصفحة اللي انت فيها: في الأوردرات ← الأوردرات · في العملاء ← العملاء.
 * في أي صفحة تانية ← البحث العام (`/search`).
 *
 * الضغط بيفتح مستطيل بعرض الشريط فوق — مفيش مربع صغير جنب الأيقونة.
 * ==========================================================================
 */

type Scope = {
  path: string;
  placeholder: string;
  /** فلاتر الصفحة اللي بتفضل مع البحث */
  keep: string[];
};

const SCOPES: Scope[] = [
  {
    path: "/orders",
    placeholder: "دور في الأوردرات — رقم · اسم · تليفون",
    // ⚠️ `tab` معاهم — من غيره البحث من تبويب «شغل» كان بيرجّعك «الكل»
    keep: ["status", "tab", "archived", "period", "from", "to"],
  },
  { path: "/customers", placeholder: "دور في العملاء — اسم · تليفون", keep: ["sort"] },
  { path: "/products", placeholder: "دور في المنتجات — اسم · كود", keep: [] },
];

const GLOBAL = "دور على أوردر · عميل · تليفون · رقم تتبع";

export function searchTarget(
  pathname: string,
  currentSearch: string,
  q: string
): string {
  const scope = SCOPES.find((s) => s.path === pathname);
  const term = q.trim();
  if (!scope) {
    return term ? `/search?q=${encodeURIComponent(term)}` : "/search";
  }
  const now = new URLSearchParams(currentSearch);
  const next = new URLSearchParams();
  for (const k of scope.keep) {
    const v = now.get(k);
    if (v) next.set(k, v);
  }
  if (term) next.set("q", term);
  const qs = next.toString();
  return qs ? `${scope.path}?${qs}` : scope.path;
}

export function HeaderSearch({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const scope = SCOPES.find((s) => s.path === pathname);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => input.current?.focus());
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // البحث الحالي في الصفحة بيظهر في الخانة — عشان تعدّله مش تكتبه من الأول
          setValue(scope ? (new URLSearchParams(window.location.search).get("q") ?? "") : "");
          setOpen(true);
        }}
        aria-label={scope ? scope.placeholder : "بحث"}
        title="بحث"
        className={`shrink-0 rounded-full p-2 text-ink-muted hover:bg-sunken hover:text-ink ${className}`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" />
        </svg>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-ink/20"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <form
            role="search"
            className="fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-2 border-b border-line bg-surface px-4 shadow-pop"
            onSubmit={(e) => {
              e.preventDefault();
              setOpen(false);
              router.push(searchTarget(pathname, window.location.search, value));
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              className="h-5 w-5 shrink-0 text-ink-faint"
              aria-hidden="true"
            >
              <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" />
            </svg>
            <input
              ref={input}
              type="search"
              enterKeyHint="search"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={scope ? scope.placeholder : GLOBAL}
              aria-label={scope ? scope.placeholder : GLOBAL}
              className="h-full min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink-faint focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="قفل البحث"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-sunken"
            >
              ✕
            </button>
          </form>
        </>
      )}
    </>
  );
}
