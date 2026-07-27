import Link from "next/link";

// زرار الرجوع الموحّد: سهم لبرة فوق على الشمال (بدل كلمة "الرجوع لـ...")
// variant="exit" بيستخدم شكل باب الخروج (جوّه صفحة الأوردر)
export function BackLink({
  href,
  label,
  variant = "arrow",
}: {
  href: string;
  label?: string;
  variant?: "arrow" | "exit";
}) {
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
        {variant === "exit" ? (
          // باب وسهم خارج منه
          <path d="M15 12H4m0 0 3.5-3.5M4 12l3.5 3.5M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
        ) : (
          <path d="M19 12H5M12 19l-7-7 7-7" />
        )}
      </svg>
    </Link>
  );
}
