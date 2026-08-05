"use client";

import { useState } from "react";
import { REPEAT_KINDS, REPEAT_UNITS } from "@/lib/tasks";
import { REMINDER_UNITS } from "@/lib/task-remind";

const BOX =
  "rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-gray-900 focus:outline-none";

/**
 * خانات التكرار والتنبيه — **مكوّن واحد للفورمين** (إضافة تاسك جديد
 * وتعديل تاسك موجود). كانت الخانات متكتوبة مرتين، وأي تغيير كان لازم
 * يتعمل في مكانين — والتاني بيتنسى.
 *
 * وكل خانة مالهاش لازمة مابتظهرش: خانات «كل كام» بتبان لما تختار كاستم
 * بس، وخانة تكرار التنبيه بتبان لما يكون فيه تنبيه أصلاً.
 */
export function TaskSchedule({
  repeatKind,
  repeatEvery,
  repeatUnit,
  remindAt,
  remindEvery,
  remindUnit,
  hasAssignee,
}: {
  repeatKind?: string | null;
  repeatEvery?: number | null;
  repeatUnit?: string | null;
  /** بصيغة خانة المتصفح: 2026-08-10T14:30 */
  remindAt?: string;
  remindEvery?: number | null;
  remindUnit?: string | null;
  /** التنبيه بيروح للي التاسك عليه — من غير مسؤول مافيش تنبيه */
  hasAssignee?: boolean;
}) {
  const [kind, setKind] = useState(repeatKind ?? "");
  const [when, setWhen] = useState(remindAt ?? "");
  const [repeats, setRepeats] = useState(Boolean(remindEvery));

  return (
    <div className="space-y-3">
      {/* ===== تكرار التاسك ===== */}
      <div>
        <label className="block text-[11px] text-gray-500">
          بيتكرر؟
          <select
            name="repeat_kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className={`mt-1 w-full ${BOX}`}
          >
            <option value="">مرة واحدة</option>
            {REPEAT_KINDS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        {kind === "custom" && (
          <div className="minis-in mt-1.5 flex items-center gap-2">
            <span className="text-[11px] text-gray-500">كل</span>
            <input
              name="repeat_every"
              type="number"
              min={1}
              max={365}
              defaultValue={repeatEvery ?? 2}
              className={`w-16 ${BOX}`}
            />
            <select
              name="repeat_unit"
              defaultValue={repeatUnit ?? "day"}
              className={`flex-1 ${BOX}`}
            >
              {REPEAT_UNITS.map((u) => (
                <option key={u.key} value={u.key}>
                  {u.plural}
                </option>
              ))}
            </select>
          </div>
        )}

        {kind && (
          <span className="mt-1 block text-[10px] text-gray-400">
            المتكرر لازم يبقى ليه ميعاد، والنسخة الجاية مابتتعملش غير لما
            اللي قبلها تخلص
          </span>
        )}
      </div>

      {/* ===== التنبيه ===== */}
      <div>
        <label className="block text-[11px] text-gray-500">
          تنبيه على الموبايل
          <input
            name="remind_at"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className={`mt-1 w-full ${BOX}`}
          />
        </label>

        {when && (
          <div className="minis-in mt-1.5 space-y-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-gray-600">
              <input
                type="checkbox"
                checked={repeats}
                onChange={(e) => setRepeats(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              وفكّرني تاني كل شوية لحد ما يخلص
            </label>

            {repeats && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-500">كل</span>
                <input
                  name="remind_every"
                  type="number"
                  min={1}
                  max={365}
                  defaultValue={remindEvery ?? 1}
                  className={`w-16 ${BOX}`}
                />
                <select
                  name="remind_unit"
                  defaultValue={remindUnit ?? "day"}
                  className={`flex-1 ${BOX}`}
                >
                  {REMINDER_UNITS.map((u) => (
                    <option key={u.key} value={u.key}>
                      {u.plural}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* **التنبيه بيروح للي التاسك عليه** — من غير مسؤول مافيش
                حد يتبعتله، وأحسن نقولها قبل ما يستنى تنبيه ماجاش */}
            {hasAssignee === false && (
              <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] text-amber-900">
                التنبيه بيروح للي التاسك عليه — اسنده لحد وإلا مش هيوصل حد.
              </p>
            )}
            {repeats && (
              <p className="text-[10px] text-gray-400">
                بيقف لوحده أول ما التاسك يخلص، وبعد ٣٠ تنبيه بيسكت.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
