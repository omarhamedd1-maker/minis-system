"use client";

import { useState } from "react";

/**
 * اختيار نوع المصروف من قايمة.
 *
 * كان `datalist` — يعني خانة كتابة مع اقتراحات. والمشكلة إن الموبايل
 * مابيعرضش الاقتراحات دي كويس، فعمر كان بيكتب النوع بإيده كل مرة وبيحصل
 * اختلاف في الكتابة ("اعلانات" و"إعلانات") فيبقى نوعين مختلفين.
 *
 * بقت قايمة حقيقية، وآخر خيار فيها **"+ نوع جديد"** بيفتح خانة كتابة —
 * فالاختيار سهل والإضافة لسه ممكنة.
 */
export function CategoryPicker({
  categories,
  defaultValue,
  id,
  className,
  required,
}: {
  categories: string[];
  defaultValue?: string | null;
  id?: string;
  className?: string;
  required?: boolean;
}) {
  const current = (defaultValue ?? "").trim();
  // نوع محفوظ ومش في القايمة؟ نضيفه عشان مايضيعش وقت التعديل
  const options = current && !categories.includes(current)
    ? [current, ...categories]
    : categories;

  const [isNew, setIsNew] = useState(false);

  if (isNew) {
    return (
      <div className="flex items-center gap-1">
        <input
          id={id}
          name="category"
          required={required}
          autoFocus
          autoComplete="off"
          placeholder="اكتب النوع الجديد"
          className={className}
        />
        <button
          type="button"
          onClick={() => setIsNew(false)}
          className="shrink-0 rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
          aria-label="رجوع للقايمة"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <select
      id={id}
      name="category"
      required={required}
      defaultValue={current || ""}
      onChange={(e) => {
        if (e.target.value === "__new__") setIsNew(true);
      }}
      className={className}
    >
      {!current && <option value="">اختار النوع</option>}
      {options.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      <option value="__new__">+ نوع جديد</option>
    </select>
  );
}
