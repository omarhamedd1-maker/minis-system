"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CostUploadResult } from "@/app/(dashboard)/products/actions";

/**
 * ملف التكاليف: نزّل ← اكتب في إكسيل ← ارفع.
 *
 * شوبيفاي مافيهاش تكلفة، فتعبئة ٨٥ منتج واحد واحد من الشاشة شغل يوم.
 * الملف بيخلّيها ربع ساعة.
 *
 * **بيعرض الأول وبعدين ينفّذ** — والقراءة بتحصل في المتصفح عشان الملف
 * مايترفعش على السيرفر قبل ما تشوف هيعمل إيه.
 */
export function CostFile({
  action,
  missingCount,
}: {
  action: (formData: FormData) => Promise<CostUploadResult>;
  missingCount: number;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [result, setResult] = useState<CostUploadResult | null>(null);

  async function send(content: string, dry: boolean) {
    const fd = new FormData();
    fd.append("content", content);
    fd.append("dry", dry ? "1" : "0");
    setBusy(true);
    const r = await action(fd);
    setBusy(false);
    setResult(r);
    if (!dry && r.ok) {
      setText(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setText(content);
    setResult(null);
    await send(content, true);
  }

  const plan = result?.ok ? result.plan : null;
  const applied = result?.ok ? result.applied : undefined;

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold text-gray-900">ملف التكاليف</h2>
      <p className="mt-0.5 text-xs text-gray-500">
        نزّل الملف، اكتب التكلفة في إكسيل، وارفعه تاني. الخانة اللي تسيبها
        فاضية بتفضل زي ما هي.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href="/api/costs?missing=1"
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-700"
        >
          نزّل الناقص{missingCount > 0 ? ` (${missingCount})` : ""}
        </a>
        <a
          href="/api/costs"
          className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-100"
        >
          نزّل الكل
        </a>
        <label className="cursor-pointer rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700">
          {busy ? "بنقرا…" : "ارفع الملف"}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onPick}
            className="hidden"
          />
        </label>
      </div>

      {result && !result.ok && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {result.error}
        </p>
      )}

      {plan && (
        <div className="mt-3 space-y-3 text-sm">
          {applied !== undefined && (
            <p className="rounded-lg bg-green-50 px-3 py-2 font-medium text-green-800">
              اتحدّثت تكلفة {applied} شكل.
            </p>
          )}

          <div className="flex flex-wrap gap-2 text-xs">
            <Chip n={plan.updates.length} label="هيتغيّر" tone="green" />
            <Chip n={plan.unchanged} label="زي ما هو" tone="gray" />
            <Chip n={plan.blank} label="سايبها فاضية" tone="gray" />
            <Chip n={plan.invalid.length} label="رقم مش مظبوط" tone="red" />
            <Chip n={plan.unknown.length} label="معرف مش موجود" tone="red" />
          </div>

          {plan.updates.length > 0 && (
            <div className="space-y-1">
              {plan.updates.slice(0, 10).map((u) => (
                <div
                  key={u.variantId}
                  className="flex justify-between gap-3 rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs"
                >
                  <span className="text-gray-700">{u.name}</span>
                  <span className="font-medium text-gray-900">
                    {u.from > 0 ? `${u.from} ← ${u.to}` : u.to}
                  </span>
                </div>
              ))}
              {plan.updates.length > 10 && (
                <p className="text-xs text-gray-400">
                  و{plan.updates.length - 10} غيرهم…
                </p>
              )}
            </div>
          )}

          {plan.invalid.length > 0 && (
            <div className="rounded-lg bg-red-50 p-3 text-xs text-red-800">
              {plan.invalid.slice(0, 5).map((i) => (
                <p key={i.line}>
                  سطر {i.line}: {i.reason}
                </p>
              ))}
              <p className="mt-1 font-medium">
                السطور دي هتتعدّى — صلّحها وارفع تاني لو مهمة.
              </p>
            </div>
          )}

          {plan.unknown.length > 0 && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
              {plan.unknown.length} سطر فيهم معرف مش موجود عندنا — يا إما
              المنتج اتمسح، يا إما عمود المعرف اتغيّر في إكسيل.
            </p>
          )}

          {applied === undefined && plan.updates.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (
                  text &&
                  confirm(`تحدّث تكلفة ${plan.updates.length} شكل؟`)
                )
                  send(text, false);
              }}
              disabled={busy}
              className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
            >
              {busy ? "بنحفظ…" : `حدّث الـ${plan.updates.length} دول`}
            </button>
          )}

          {applied === undefined && plan.updates.length === 0 && (
            <p className="text-gray-600">مفيش تكلفة اتغيّرت في الملف ده.</p>
          )}
        </div>
      )}
    </div>
  );
}

const TONES = {
  green: "bg-green-50 text-green-700",
  gray: "bg-gray-100 text-gray-600",
  red: "bg-red-50 text-red-700",
} as const;

function Chip({
  n,
  label,
  tone,
}: {
  n: number;
  label: string;
  tone: keyof typeof TONES;
}) {
  if (n === 0) return null;
  return (
    <span className={`rounded-full px-2 py-0.5 font-medium ${TONES[tone]}`}>
      {n} {label}
    </span>
  );
}
