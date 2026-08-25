"use client";

import { useState } from "react";
import type { CoverageReport } from "@/app/(dashboard)/orders/reconcile/actions";

/**
 * «فحص التغطية» — بيقارن كل شحنات بوسطة بكل أوردراتنا.
 *
 * **قراية بالكامل، مابيكتبش حاجة.** بيقول لك فين الفرق بس، والتصليح
 * بيتعمل بإيدك — عشان ربط شحنة غلط بأوردر معناه رسوم وتحصيل يتحسبوا
 * على حد مالهوش دعوة.
 */
export function BostaCoverage({
  action,
}: {
  action: () => Promise<CoverageReport>;
}) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<CoverageReport | null>(null);

  const run = async () => {
    setBusy(true);
    try {
      setReport(await action());
    } catch (e) {
      setReport({
        ok: false,
        error: e instanceof Error ? e.message : "الفحص وقع",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-gray-900">
            فحص التغطية مع بوسطة
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            بيقارن كل شحنة عند بوسطة بكل أوردر عندنا — قراية بس، مابيغيّرش
            حاجة.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark disabled:bg-gray-300"
        >
          {busy ? "بيقارن…" : "افحص"}
        </button>
      </div>

      {report && !report.ok && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {report.error}
        </p>
      )}

      {report?.ok && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-lg bg-green-50 px-2.5 py-1 text-green-800">
              متطابقة {report.matched}
            </span>
            <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-gray-700">
              شحنات بوسطة {report.bostaTotal}
            </span>
          </div>

          {/* **دي الخطيرة** — شحنة ماشية وفلوسها بتتحصّل ومفيش أوردر عندنا */}
          <Section
            title="في بوسطة ومفيش أوردر عندنا"
            hint="شحنة ماشية من غير سجل — اتبعتت بإيد ومحدش ربطها، أو الأوردر اتمسح"
            count={report.onlyInBosta.length}
            tone="bad"
          >
            <ul className="divide-y divide-gray-100">
              {report.onlyInBosta.map((s) => (
                <li key={s.tracking} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-xs">
                  <span dir="ltr" className="font-medium text-gray-900">
                    {s.tracking ?? "—"}
                  </span>
                  {s.name && <span className="text-gray-600">{s.name}</span>}
                  {s.phone && (
                    <span dir="ltr" className="text-gray-500">
                      {s.phone}
                    </span>
                  )}
                  {s.state && <span className="text-gray-400">{s.state}</span>}
                  {s.cod !== null && (
                    <span className="text-gray-500">تحصيل {s.cod}</span>
                  )}
                </li>
              ))}
            </ul>
          </Section>

          <Section
            title="عندنا ومفيش شحنة عند بوسطة"
            hint="حالته بتقول إنه اتشحن — يا إما الشحنة ماتعملتش، يا إما اتعملت من حساب تاني"
            count={report.onlyInSystem.length}
            tone="warn"
          >
            <ul className="divide-y divide-gray-100">
              {report.onlyInSystem.map((o) => (
                <li key={o.id} className="px-3 py-2 text-xs">
                  <a
                    href={`/orders/${o.id}`}
                    className="font-medium text-sky-700 underline"
                  >
                    أوردر {o.orderNumber ?? "—"}
                  </a>
                  <span className="ms-2 text-gray-500">{o.status}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  hint,
  count,
  tone,
  children,
}: {
  title: string;
  hint: string;
  count: number;
  tone: "bad" | "warn";
  children: React.ReactNode;
}) {
  if (count === 0) {
    return (
      <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
        {title}: مفيش ✅
      </p>
    );
  }

  return (
    <details className="overflow-hidden rounded-lg border border-gray-200">
      <summary
        className={`cursor-pointer px-3 py-2 text-xs font-bold ${
          tone === "bad" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"
        }`}
      >
        {title} ({count})
        <span className="mt-0.5 block text-[10px] font-normal opacity-80">
          {hint}
        </span>
      </summary>
      {children}
    </details>
  );
}
