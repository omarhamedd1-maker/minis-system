/** أيقونات صفوف الحركات والمصاريف — قلم للتعديل وسلة للمسح */

export function PencilIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function TrashIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  );
}

/** زرار أيقونة في صف الجدول (ديسكتوب) */
export const rowIconButton = (tone: "neutral" | "danger") =>
  `flex h-8 w-8 items-center justify-center rounded-control ${
    tone === "danger"
      ? "bg-danger-soft text-danger hover:bg-danger-line"
      : "bg-sunken text-ink-muted hover:bg-line hover:text-ink"
  }`;
