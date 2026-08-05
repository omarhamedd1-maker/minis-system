"use client";

import { useActionState, useState } from "react";
import {
  ANNOUNCE_MAX_DETAILS,
  ANNOUNCE_MAX_TITLE,
  announceWarning,
  composeAnnouncement,
} from "@/lib/push/announce";
import type { AnnounceState } from "@/app/(dashboard)/notify/actions";

export type NotifyMember = {
  authUserId: string;
  name: string;
  /** عدد موبايلاته المفعّلة — صفر معناه الإشعار مش هيوصله */
  devices: number;
};

/**
 * كتابة إشعار وإرساله للتيم — **جوّه قايمة الإشعارات مش صفحة لوحدها**.
 *
 * كانت صفحة في القايمة الجنبية، وعمر قال تبقى زرار جوّه الجرس. وده أصح:
 * الجرس هو مكان الإشعارات في السيستم كله، فاللي بيبعت واحد يلاقيه في نفس
 * المكان اللي بيستقبل فيه — مش في بند تالت في القايمة.
 *
 * **والمعاينة بتتبني بنفس دالة الإرسال** (`composeAnnouncement`)، فاللي
 * على الشاشة هو اللي هيطلع على التليفون حرف بحرف — مش تقريب لشكله.
 */
export function SendAnnouncement({
  team,
  senderName,
  action,
  onDone,
}: {
  team: NotifyMember[];
  senderName: string;
  action: (prev: AnnounceState, fd: FormData) => Promise<AnnounceState>;
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState<AnnounceState, FormData>(
    action,
    null
  );
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [toAll, setToAll] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);

  const preview = composeAnnouncement({ title, details, sender: senderName });
  const warning = title.trim() ? announceWarning(preview) : null;

  // مين هيوصله فعلاً — اللي مفعّلش الإشعارات مش داخل في العدد
  const chosen = toAll ? team : team.filter((m) => picked.includes(m.authUserId));
  const reach = chosen.reduce((s, m) => s + m.devices, 0);
  const silent = chosen.filter((m) => m.devices === 0);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  // اتبعت خلاص؟ بنعرض النتيجة بس — الفورم اتقفل
  if (state?.ok) {
    return (
      <div className="space-y-3 p-3">
        <p className="rounded-lg bg-green-50 px-3 py-2.5 text-xs text-green-800">
          {state.message}
        </p>
        <button
          type="button"
          onClick={onDone}
          className="w-full rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white"
        >
          تمام
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3 p-3">
      <input
        name="title"
        required
        maxLength={ANNOUNCE_MAX_TITLE}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="العنوان — الشحن هيتأخر النهاردة"
        className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
      />

      <textarea
        name="details"
        rows={2}
        maxLength={ANNOUNCE_MAX_DETAILS}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder="الكلام (اختياري)"
        className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
      />

      {/* ===== يوصل لمين ===== */}
      <div className="flex gap-2">
        {[
          { all: true, label: `الكل (${team.length})` },
          { all: false, label: "ناس محددة" },
        ].map((o) => (
          <label
            key={o.label}
            className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1.5 hover:bg-gray-50 has-checked:border-gray-900 has-checked:bg-gray-50"
          >
            <input
              type="radio"
              name="audience"
              value={o.all ? "all" : "some"}
              checked={toAll === o.all}
              onChange={() => setToAll(o.all)}
              className="h-3.5 w-3.5"
            />
            <span className="text-[11px] font-medium text-gray-900">
              {o.label}
            </span>
          </label>
        ))}
      </div>

      {!toAll && (
        <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-1.5">
          {team.length === 0 ? (
            <p className="px-1 py-2 text-[11px] text-gray-400">
              مفيش حد في التيم غيرك.
            </p>
          ) : (
            team.map((m) => (
              <label
                key={m.authUserId}
                className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-gray-50 has-checked:bg-gray-100"
              >
                <input
                  type="checkbox"
                  name="user_id"
                  value={m.authUserId}
                  checked={picked.includes(m.authUserId)}
                  onChange={() => toggle(m.authUserId)}
                  className="h-3.5 w-3.5"
                />
                <span className="min-w-0 flex-1 truncate text-[11px] text-gray-900">
                  {m.name}
                </span>
                {m.devices === 0 && (
                  <span className="shrink-0 text-[10px] font-medium text-amber-700">
                    مش مفعّل
                  </span>
                )}
              </label>
            ))
          )}
        </div>
      )}

      {/* ===== المعاينة — نفس اللي هيطلع على التليفون ===== */}
      {title.trim() && (
        <div className="rounded-lg bg-gray-900 p-2">
          <div className="rounded-md bg-white/95 p-2">
            <div className="mb-0.5 text-[9px] font-medium text-gray-400">
              from MINIS
            </div>
            {preview
              .replace(/<[^>]+>/g, "")
              .split("\n")
              .map((line, i) => (
                <div
                  key={i}
                  className={
                    i === 0
                      ? "text-[11px] font-bold text-gray-900"
                      : "text-[11px] text-gray-700"
                  }
                >
                  {line}
                </div>
              ))}
          </div>
        </div>
      )}

      {warning && (
        <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] text-amber-900">
          {warning}
        </p>
      )}

      {state && !state.ok && (
        <p className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">
          {state.message}
        </p>
      )}

      {/* الحصيلة قبل الدوسة */}
      <p className="text-[10px] text-gray-500">
        {chosen.length === 0 ? (
          "لسه مااخترتش حد"
        ) : (
          <>
            هيوصل لـ<b className="text-gray-900">{reach}</b> جهاز
            {silent.length > 0 && (
              <span className="block pt-0.5 text-amber-700">
                {silent.map((m) => m.name).join("، ")} مفعّلش الإشعارات — مش
                هيوصله حاجة
              </span>
            )}
          </>
        )}
      </p>

      {/* **الإشعار مالوش تراجع** — طلع على التليفونات خلاص */}
      <button
        type="submit"
        disabled={pending || !title.trim() || chosen.length === 0}
        className="w-full rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-700 disabled:bg-gray-300"
      >
        {pending ? "بيتبعت…" : "ابعت"}
      </button>
      <p className="text-center text-[10px] text-gray-400">
        مفيش تراجع — أول ما تدوس بيطلع على تليفوناتهم
      </p>
    </form>
  );
}
