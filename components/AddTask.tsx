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
  secondary = false,
}: {
  team: Member[];
  canAssign: boolean;
  action: (fd: FormData) => Promise<void>;
  /** لو الفورم جوّه أوردر، التاسك بيتربط بيه لوحده */
  orderId?: string;
  compact?: boolean;
  /** ثانوي — لما الشاشة يكون ليها فعل رئيسي تاني (ORDER §١٠) */
  secondary?: boolean;
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
        /*
          ⚠️ **رئيسي واحد لكل شاشة** (ORDER §١٠). في صفحة التاسكات ده
          الفعل الأساسي، وفي صفحة الأوردر لأ — الأساسي هناك «ابعت لبوسطة».
          فالمستوى بيتحدد من اللي بينده، مش من المكوّن.
        */
        className={`rounded-control px-3 py-2 text-sm font-medium ${
          compact ? "flex w-full items-center justify-center gap-2" : ""
        } ${
          secondary
            ? "border border-line-strong bg-surface text-ink-body hover:bg-sunken"
            : "bg-primary text-white"
        }`}
      >
        + تاسك جديد
      </button>
    );
  }

  return (
    <form
      action={action}
      className="minis-in w-full space-y-2 rounded-card bg-surface p-4 shadow-card sm:w-96"
    >
      {orderId && <input type="hidden" name="order_id" value={orderId} />}

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">تاسك جديد</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-ink-faint hover:text-ink-body"
        >
          إلغاء
        </button>
      </div>

      <input
        name="title"
        required
        autoFocus
        placeholder="التاسك إيه؟"
        className="w-full rounded-control border border-line-strong px-2.5 py-2 text-sm text-ink focus:border-primary focus:outline-none"
      />

      <textarea
        name="body"
        rows={2}
        placeholder="تفاصيل (اختياري)"
        className="w-full rounded-control border border-line-strong px-2.5 py-2 text-xs text-ink focus:border-primary focus:outline-none"
      />

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-ink-muted">
          الميعاد
          <input
            name="due_on"
            type="date"
            className="mt-1 w-full rounded-control border border-line-strong px-2 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
          />
        </label>
        <label className="text-[11px] text-ink-muted">
          الأولوية
          <select
            name="priority"
            defaultValue="normal"
            className="mt-1 w-full rounded-control border border-line-strong bg-surface px-2 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
          >
            <option value="normal">عادي</option>
            <option value="urgent">عاجل</option>
          </select>
        </label>
      </div>

      <TaskSchedule hasAssignee={!canAssign || picked.length > 0} />

      {canAssign && (
        <fieldset>
          <legend className="text-[11px] text-ink-muted">
            مين عليه التاسك
            <span className="text-ink-faint"> (تقدر تختار أكتر من واحد)</span>
          </legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {team.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-1.5 rounded-control bg-sunken px-2.5 py-1.5 text-xs text-ink-body has-checked:bg-primary has-checked:text-white"
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
          <span className="mt-1 block text-[10px] text-ink-faint">
            هيوصلهم إشعار على الموبايل
          </span>
        </fieldset>
      )}

      <button
        type="submit"
        className="w-full rounded-control bg-primary px-3 py-2 text-sm font-medium text-white"
      >
        أضف التاسك
      </button>
    </form>
  );
}
