"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";

export function DayPicker({ selected }: { selected?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
    } else {
      input.click();
    }
  };

  return (
    <span className="relative inline-flex items-center gap-1">
      <button
        type="button"
        onClick={openPicker}
        title="اختار يوم معين"
        aria-label="اختار يوم معين من التقويم"
        className={`rounded-full p-1.5 shadow-sm ${
          selected
            ? "bg-gray-900 text-white"
            : "bg-white text-gray-600 hover:bg-gray-100"
        }`}
      >
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M6 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1zm10 6H4v8h12V8z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      <input
        ref={inputRef}
        type="date"
        value={selected ?? ""}
        onChange={(e) => {
          router.push(e.target.value ? `/?day=${e.target.value}` : "/");
        }}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute bottom-0 right-0 h-px w-px opacity-0"
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
