"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";
import type { CartsReport } from "@/app/(dashboard)/orders/carts/actions";

/** واتساب بصيغة مصر الدولية */
function waLink(phone: string | null) {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (!d) return null;
  const intl = d.startsWith("20") ? d : "20" + d.replace(/^0+/, "");
  return `https://wa.me/${intl}`;
}

function daysAgo(iso: string | null): string {
  if (!iso) return "—";
  const n = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  if (n <= 0) return "النهاردة";
  if (n === 1) return "امبارح";
  return `من ${n} يوم`;
}

/**
 * السلات المتروكة.
 *
 * **بتتجاب بضغطة مش مع فتح الصفحة** — دي مكالمة لشوبيفاي بتاخد وقت،
 * ومحدش عايز الصفحة تقعد تحمّل كل مرة يفتحها.
 *
 * والترتيب بالأغلى: لو هتتصل بواحد النهاردة، يبقى ده.
 */
export function AbandonedCarts({
  action,
}: {
  action: () => Promise<CartsReport>;
}) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<CartsReport | null>(null);

  const run = async () => {
    setBusy(true);
    try {
      setReport(await action());
    } catch (e) {
      setReport({
        ok: false,
        error: e instanceof Error ? e.message : "الجلب وقع",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-gray-900">السلات المتروكة</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            عملاء وصلوا للدفع وسابوا. بيتجابوا من شوبيفاي — قراية بس،
            مابيتحطوش في الأوردرات.
          </p>
        </div>
        <button
          onClick={run}
          disabled={busy}
          className="shrink-0 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {busy ? "بيجيب…" : "جيب السلات"}
        </button>
      </div>

      {report && !report.ok && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {report.error}
        </div>
      )}

      {report?.ok && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-gray-900">
              <b className="text-emerald-600">
                {formatMoney(report.callableValue)}
              </b>{" "}
              في {report.callable.length} سلة تستاهل مكالمة
            </span>
            <span className="text-gray-400">
              {report.recovered} اشتروا بعدها · {report.unreachable} من غير
              تليفون · {report.total} إجمالي
            </span>
          </div>

          {report.callable.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">
              مفيش سلة فيها تليفون وصاحبها مااشترىش بعدها.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-xs text-gray-500">
                    <th className="p-2 font-normal">العميل</th>
                    <th className="p-2 font-normal">المدينة</th>
                    <th className="p-2 font-normal">القيمة</th>
                    <th className="p-2 font-normal">من إمتى</th>
                    <th className="p-2 font-normal"></th>
                  </tr>
                </thead>
                <tbody>
                  {report.callable.map((c) => {
                    const wa = waLink(c.phone);
                    return (
                      <tr key={c.id} className="border-t border-gray-100">
                        <td className="p-2 text-gray-900">
                          {c.customerName ?? "بدون اسم"}
                          <span className="block text-xs text-gray-400">
                            {c.items.map((i) => i.title).join("، ")}
                          </span>
                        </td>
                        <td className="p-2 text-gray-500">{c.city ?? "—"}</td>
                        <td className="p-2 font-medium tabular-nums text-gray-900">
                          {formatMoney(c.total)}
                        </td>
                        <td className="p-2 text-gray-500">
                          {daysAgo(c.createdAt)}
                        </td>
                        <td className="p-2">
                          {wa && (
                            <a
                              href={wa}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"
                            >
                              واتساب
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
