"use client";

import { useRouter } from "next/navigation";

export function DayPicker({ selected }: { selected?: string }) {
  const router = useRouter();

  return (
    <span className="flex items-center gap-1">
      <input
        type="date"
        value={selected ?? ""}
        onChange={(e) => {
          router.push(e.target.value ? `/?day=${e.target.value}` : "/");
        }}
        aria-label="اختار يوم معين"
        className={`rounded-full px-3 py-1 text-xs font-medium shadow-sm focus:outline-none ${
          selected
            ? "bg-gray-900 text-white"
            : "bg-white text-gray-600 hover:bg-gray-100"
        }`}
      />
      {selected && (
        <button
          type="button"
          onClick={() => router.push("/")}
          title="إلغاء اليوم المختار"
          className="rounded-full bg-white px-2 py-1 text-xs text-gray-500 shadow-sm hover:bg-gray-100"
        >
          ✕
        </button>
      )}
    </span>
  );
}
