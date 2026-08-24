"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LinkMissingResult } from "@/app/(dashboard)/orders/reconcile/actions";

/**
 * ربط الشحنات الضايعة — **بيعرض الأول وبعدين ينفّذ**.
 *
 * القاعدة في المشروع إن أي عملية بتلمس داتا بتتعرض قبل ما تتنفّذ، ودي بتلمس
 * فلوس: أول ما الشحنة تترّبط، المزامنة هتجيب رسومها وتحصيلها وتحطهم في
 * حسبة الربح.
 */
export function LinkMissingShipments({
  action,
}: {
  action: (dry: boolean) => Promise<LinkMissingResult>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LinkMissingResult | null>(null);

  async function run(dry: boolean) {
    setBusy(true);
    const r = await action(dry);
    setBusy(false);
    setResult(r);
    if (!dry && r.ok) router.refresh();
  }

  const plan = result?.ok ? result.plan : null;
  const done = result?.ok && !result.dry;

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-gray-900">
          الشحنات اللي ضاع رقم تتبعها
        </h2>
        <button
          type="button"
          onClick={() => run(true)}
          disabled={busy}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
        >
          {busy && !plan ? "بندوّر…" : "دوّر في بوسطة"}
        </button>
      </div>
      <p className="mb-3 text-xs text-gray-500">
        أوردرات حالتها بتقول إنها عدّت على بوسطة ومالهاش رقم تتبع — يعني رسوم
        شحنها مش داخلة الحسبة والربح بيبان أكبر من الحقيقة.
      </p>

      {result && !result.ok && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {result.error}
        </p>
      )}

      {plan && (
        <div className="space-y-3 text-sm">
          {done && (
            <p className="rounded-lg bg-green-50 px-3 py-2 font-medium text-green-800">
              اتربط {result.ok && result.linked} شحنة. المزامنة هتجيب رسومها
              وتحصيلها خلال ربع ساعة.
            </p>
          )}

          <Group
            title="لقيناها وجاهزة للربط"
            tone="green"
            count={plan.links.length}
          >
            {plan.links.map((l) => (
              <Row
                key={l.tracking}
                right={`أوردر ${l.orderNumber}`}
                left={l.tracking}
                note={`${l.receiverName}${l.state ? ` — ${l.state}` : ""}`}
              />
            ))}
          </Group>

          <Group
            title="الاسم مختلف — راجعها بنفسك"
            tone="amber"
            count={plan.nameMismatch.length}
          >
            {plan.nameMismatch.map((m) => (
              <Row
                key={m.tracking}
                right={`أوردر ${m.orderNumber}`}
                left={m.tracking}
                note={`عندنا: ${m.ourName} — بوسطة: ${m.bostaName}`}
              />
            ))}
          </Group>

          <Group
            title="أكتر من شحنة على نفس الرقم"
            tone="amber"
            count={plan.ambiguous.length}
          >
            {plan.ambiguous.map((a) => (
              <Row
                key={a.orderNumber}
                right={`أوردر ${a.orderNumber}`}
                left={a.trackings.join(" · ")}
                note="اختار الصح بإيدك من جوّه الأوردر"
              />
            ))}
          </Group>

          <Group
            title="مالقيناش لها شحنة عند بوسطة"
            tone="gray"
            count={plan.notFound.length}
          >
            {plan.notFound.map((n) => (
              <Row key={n.orderId} right={`أوردر ${n.orderNumber}`} left="—" />
            ))}
          </Group>

          {!done && plan.links.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    `تربط ${plan.links.length} شحنة بأوردراتها؟ ده هيغيّر حسبة الرسوم والأرباح.`
                  )
                )
                  run(false);
              }}
              disabled={busy}
              className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
            >
              {busy ? "بنربط…" : `اربط الـ${plan.links.length} شحنة دول`}
            </button>
          )}

          {plan.links.length === 0 &&
            plan.nameMismatch.length === 0 &&
            plan.ambiguous.length === 0 &&
            plan.notFound.length === 0 && (
              <p className="text-gray-500">مفيش أوردرات ناقصة رقم تتبع.</p>
            )}
        </div>
      )}
    </div>
  );
}

const TONES = {
  green: "bg-green-50 text-green-800",
  amber: "bg-amber-50 text-amber-800",
  gray: "bg-gray-100 text-gray-700",
} as const;

function Group({
  title,
  tone,
  count,
  children,
}: {
  title: string;
  tone: keyof typeof TONES;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>
          {count}
        </span>
        <span className="text-xs font-medium text-gray-700">{title}</span>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({
  right,
  left,
  note,
}: {
  right: string;
  left: string;
  note?: string;
}) {
  return (
    <div className="rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs">
      <div className="flex justify-between gap-3">
        <span className="text-gray-700">{right}</span>
        <span className="font-medium text-gray-900" dir="ltr">
          {left}
        </span>
      </div>
      {note && <span className="block text-[11px] text-gray-400">{note}</span>}
    </div>
  );
}
