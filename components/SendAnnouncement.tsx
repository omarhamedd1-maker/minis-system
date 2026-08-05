"use client";

import { useState } from "react";
import {
  ANNOUNCE_MAX_DETAILS,
  ANNOUNCE_MAX_TITLE,
  announceWarning,
  composeAnnouncement,
} from "@/lib/push/announce";

export type NotifyMember = {
  authUserId: string;
  name: string;
  /** عدد موبايلاته المفعّلة — صفر معناه الإشعار مش هيوصله */
  devices: number;
};

/**
 * كتابة إشعار وإرساله للتيم.
 *
 * **المعاينة بتتبني بنفس دالة الإرسال** (`composeAnnouncement`)، فاللي عمر
 * شايفه هو اللي هيطلع على التليفون حرف بحرف — مش تقريب لشكله.
 */
export function SendAnnouncement({
  team,
  senderName,
  action,
}: {
  team: NotifyMember[];
  senderName: string;
  action: (fd: FormData) => Promise<void>;
}) {
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

  return (
    <form action={action} className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">
          العنوان — ده اللي بيبان عريض على الشاشة
        </label>
        <input
          name="title"
          required
          maxLength={ANNOUNCE_MAX_TITLE}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="الشحن هيتأخر النهاردة"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
        />
        <span className="text-[11px] text-gray-400">
          {title.length}/{ANNOUNCE_MAX_TITLE}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">الكلام (اختياري)</label>
        <textarea
          name="details"
          rows={3}
          maxLength={ANNOUNCE_MAX_DETAILS}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="بوسطة قالت الساعة ٤ بدل ٢"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
        />
        <span className="text-[11px] text-gray-400">
          {details.length}/{ANNOUNCE_MAX_DETAILS}
        </span>
      </div>

      {/* ===== يوصل لمين ===== */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-gray-500">يوصل لمين:</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 p-3 hover:bg-gray-50 has-checked:border-gray-900 has-checked:bg-gray-50">
            <input
              type="radio"
              name="audience"
              value="all"
              checked={toAll}
              onChange={() => setToAll(true)}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium text-gray-900">الكل</span>
            <span className="text-[11px] text-gray-500">{team.length} في التيم</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 p-3 hover:bg-gray-50 has-checked:border-gray-900 has-checked:bg-gray-50">
            <input
              type="radio"
              name="audience"
              value="some"
              checked={!toAll}
              onChange={() => setToAll(false)}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium text-gray-900">ناس محددة</span>
          </label>
        </div>

        {!toAll && (
          <div className="minis-in grid gap-2 sm:grid-cols-2">
            {team.length === 0 ? (
              <p className="text-sm text-gray-400">مفيش حد في التيم غيرك.</p>
            ) : (
              team.map((m) => (
                <label
                  key={m.authUserId}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 p-2.5 hover:bg-gray-50 has-checked:border-gray-900 has-checked:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    name="user_id"
                    value={m.authUserId}
                    checked={picked.includes(m.authUserId)}
                    onChange={() => toggle(m.authUserId)}
                    className="h-4 w-4"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
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
      </div>

      {/* ===== المعاينة — نفس اللي هيطلع على التليفون ===== */}
      {title.trim() && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-500">
            شكله على التليفون:
          </div>
          <div className="rounded-xl bg-gray-900 p-3">
            <div className="rounded-lg bg-white/95 p-3">
              <div className="mb-1 text-[10px] font-medium text-gray-400">
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
                        ? "text-sm font-bold text-gray-900"
                        : "text-sm text-gray-700"
                    }
                  >
                    {line}
                  </div>
                ))}
            </div>
          </div>
          {warning && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {warning}
            </p>
          )}
        </div>
      )}

      {/* ===== الحصيلة قبل الدوسة ===== */}
      <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
        {chosen.length === 0 ? (
          "لسه مااخترتش حد"
        ) : (
          <>
            هيوصل لـ<b className="text-gray-900">{reach}</b> جهاز
            {silent.length > 0 && (
              <span className="block pt-1 text-amber-700">
                {silent.map((m) => m.name).join("، ")} مفعّلش الإشعارات على
                موبايله — مش هيوصله حاجة
              </span>
            )}
          </>
        )}
      </div>

      {/* **الإشعار مالوش تراجع** — طلع على التليفونات خلاص */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!title.trim() || chosen.length === 0}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:bg-gray-300"
        >
          ابعت
        </button>
        <span className="text-[11px] text-gray-400">
          مفيش تراجع — أول ما تدوس بيطلع على تليفوناتهم
        </span>
      </div>
    </form>
  );
}
