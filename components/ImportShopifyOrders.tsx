"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderImportResult } from "@/lib/shopify/orders";

/**
 * جلب الأوردرات والعملاء من شوبيفاي — بيعرض الأول وبعدين ينفّذ.
 *
 * ده أخطر استيراد في السيستم: بيعمل أوردرات وعملاء وبنود، والأرقام بتدخل
 * المبيعات والأرباح على طول. فالعرض مش رفاهية.
 */
export function ImportShopifyOrders({
  action,
}: {
  action: (dry: boolean) => Promise<OrderImportResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OrderImportResult | null>(null);

  async function run(dry: boolean) {
    setBusy(true);
    setOpen(true);
    const r = await action(dry);
    setBusy(false);
    setResult(r);
    if (!dry && r.ok) router.refresh();
  }

  const plan = result?.ok ? result.plan : null;
  const added = result?.ok ? result.added : undefined;

  const byStatus = plan
    ? {
        delivered: plan.toImport.filter((i) => i.status === "delivered").length,
        cancelled: plan.toImport.filter((i) => i.status === "cancelled").length,
        fresh: plan.toImport.filter((i) => i.status === "new").length,
      }
    : null;

  return (
    <>
      <button
        type="button"
        onClick={() => run(true)}
        disabled={busy}
        className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-100 disabled:opacity-50"
      >
        {busy && !plan ? "بنقرا…" : "جيب من شوبيفاي"}
      </button>

      {open && (
        <div className="fixed inset-x-0 bottom-0 z-40 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:inset-x-auto sm:left-4 sm:bottom-4 sm:w-[26rem] sm:rounded-2xl">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-gray-900">
              جلب الأوردرات من شوبيفاي
            </h2>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setResult(null);
              }}
              className="text-xs text-gray-500 hover:text-gray-800"
            >
              إغلاق
            </button>
          </div>

          {busy && <p className="text-sm text-gray-500">بنقرا من شوبيفاي…</p>}

          {result && !result.ok && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {result.error}
            </p>
          )}

          {plan && !busy && (
            <div className="space-y-3 text-sm">
              {added && (
                <p className="rounded-lg bg-green-50 px-3 py-2 font-medium text-green-800">
                  اتضاف {added.orders} أوردر و{added.customers} عميل.
                </p>
              )}

              {plan.toImport.length === 0 && !added && (
                <p className="text-gray-600">
                  مفيش أوردرات جديدة — كل اللي عند شوبيفاي موجود عندك.
                </p>
              )}

              {plan.toImport.length > 0 && !added && (
                <div className="space-y-1 rounded-lg bg-gray-50 p-3 text-xs">
                  <Line
                    label="أوردرات هتتضاف"
                    value={String(plan.toImport.length)}
                    strong
                  />
                  {byStatus && byStatus.delivered > 0 && (
                    <Line label="هتتسجّل متسلّمة" value={String(byStatus.delivered)} />
                  )}
                  {byStatus && byStatus.cancelled > 0 && (
                    <Line label="هتتسجّل ملغية" value={String(byStatus.cancelled)} />
                  )}
                  {byStatus && byStatus.fresh > 0 && (
                    <Line label="هتتسجّل جديدة" value={String(byStatus.fresh)} />
                  )}
                  {plan.newCustomers > 0 && (
                    <Line label="عملاء جداد" value={String(plan.newCustomers)} />
                  )}
                  {plan.alreadyHere > 0 && (
                    <Line label="موجودين عندك خلاص" value={String(plan.alreadyHere)} />
                  )}
                </div>
              )}

              {plan.missingProducts.length > 0 && (
                <div className="rounded-lg bg-amber-50 p-3">
                  <p className="text-xs font-bold text-amber-900">
                    {plan.missingProducts.length} أوردر مش هيتجلبوا — منتجاتهم
                    مش عندك
                  </p>
                  <p className="mt-0.5 text-[11px] text-amber-800">
                    جيب المنتجات الأول من شاشة المنتجات وبعدين ارجع هنا. أوردر
                    بإجمالي ناقص أسوأ من أوردر ماجاش.
                  </p>
                  <div className="mt-1.5 space-y-0.5">
                    {plan.missingProducts.slice(0, 5).map((m) => (
                      <p key={m.orderNumber} className="text-[11px] text-amber-900">
                        أوردر {m.orderNumber}: {m.missing.join("، ")}
                      </p>
                    ))}
                    {plan.missingProducts.length > 5 && (
                      <p className="text-[11px] text-amber-700">
                        و{plan.missingProducts.length - 5} غيرهم…
                      </p>
                    )}
                  </div>
                </div>
              )}

              {plan.noLines.length > 0 && (
                <p className="rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-600">
                  {plan.noLines.length} أوردر من غير بنود — اتعدّوا.
                </p>
              )}

              {!added && plan.toImport.length > 0 && (
                <>
                  <p className="text-[11px] text-gray-500">
                    المخزون مش هيتحرّك — دي أوردرات حصلت خلاص ومخزونها اتحرّك
                    في الواقع من زمان.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`تجيب ${plan.toImport.length} أوردر من شوبيفاي؟`))
                        run(false);
                    }}
                    disabled={busy}
                    className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                  >
                    {busy ? "بنجيب…" : `جيب الـ${plan.toImport.length} دول`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Line({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-600">{label}</span>
      <span className={strong ? "font-bold text-gray-900" : "font-medium text-gray-700"}>
        {value}
      </span>
    </div>
  );
}
