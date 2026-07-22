import Link from "next/link";

// زرار الرجوع الموحّد: سهم لبرة فوق على الشمال (بدل كلمة "الرجوع لـ...")
export function BackLink({ href, label }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      title={label ?? "رجوع"}
      aria-label={label ?? "رجوع"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 active:scale-95 active:bg-gray-200"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    </Link>
  );
}
