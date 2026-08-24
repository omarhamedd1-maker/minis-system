"use client";

import { useState } from "react";
import { TaskSchedule } from "./TaskSchedule";

type Member = { id: string; name: string };

/**
 * إضافة تاسك — زرار واحد وأول ما تدوس بيفتح الفورم.
 * نفس أسلوب لوحة المرتجع: مانملاش الشاشة بحاجات مقفولة.
 */
export function AddTask({
  team,
  canAssign,
  action,
  orderId,
  compact,
}: {
  team: Member[];
  canAssign: boolean;
  action: (fd: FormData) => Promise<void>;
  /** لو الفورم جوّه أوردر، التاسك بيتربط بيه لوحده */
  orderId?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // بنتابع الاختيار عشان خانة التنبيه تعرف تحذّر: التنبيه بيروح للي التاسك
  // عليه، فمن غير مسؤول مافيش حد يتبعتله
  const [picked, setPicked] = useState<string[]>([]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? "flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white"
            : "rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white"
        }
      >
        + تاسك جديد
      </button>
    );
  }

  return (
    <form
      action={action}
      className="minis-in w-full space-y-2 rounded-xl bg-white p-4 shadow-sm sm:w-96"
    >
      {orderId && <input type="hidden" name="order_id" value={orderId} />}

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-gray-900">تاسك جديد</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-gray-400 hover:text-gray-700"
        >
          إلغاء
        </button>
      </div>

      <input
        name="title"
        required
        autoFocus
        placeholder="التاسك إيه؟"
        className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
      />

      <textarea
        name="body"
        rows={2}
        placeholder="تفاصيل (اختياري)"
        className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
      />

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-gray-500">
          الميعاد
          <input
            name="due_on"
            type="date"
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
          />
        </label>
        <label className="text-[11px] text-gray-500">
          الأولوية
          <select
            name="priority"
            defaultValue="normal"
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
          >
            <option value="normal">عادي</option>
            <option value="urgent">عاجل</option>
          </select>
        </label>
      </div>

      <TaskSchedule hasAssignee={!canAssign || picked.length > 0} />

      {canAssign && (
        <fieldset>
          <legend className="text-[11px] text-gray-500">
            مين عليه التاسك
            <span className="text-gray-400"> (تقدر تختار أكتر من واحد)</span>
          </legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {team.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs text-gray-800 has-checked:bg-primary has-checked:text-white"
              >
                <input
                  type="checkbox"
                  name="assignee_id"
                  value={m.id}
                  checked={picked.includes(m.id)}
                  onChange={() =>
                    setPicked((p) =>
                      p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]
                    )
                  }
                  className="h-3.5 w-3.5"
                />
                {m.name}
              </label>
            ))}
          </div>
          <span className="mt-1 block text-[10px] text-gray-400">
            هيوصلهم إشعار على الموبايل
          </span>
        </fieldset>
      )}

      <button
        type="submit"
        className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white"
      >
        أضف التاسك
      </button>
    </form>
  );
}
