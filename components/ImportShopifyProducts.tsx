"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ImportResult } from "@/lib/shopify/products";

/**
 * جلب المنتجات من شوبيفاي — بيعرض الأول وبعدين ينفّذ.
 *
 * وبيقول **الناقص** بعد الجلب: شوبيفاي مافيهاش تكلفة، فأي منتج بييجي منها
 * بيقع بتكلفة صفر والربح بيبان أكبر من الحقيقة. من غير ما نقول ده صراحةً،
 * العميل الجديد هيفتكر إنه خلّص وهو لسه مابدأش.
 */
export function ImportShopifyProducts({
  action,
}: {
  action: (dry: boolean) => Promise<ImportResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

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
  const toAdd = plan ? plan.newProducts.length + plan.newVariants.length : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => run(true)}
        disabled={busy}
        className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
      >
        {busy && !plan ? "بنجيب…" : "جيب من شوبيفاي"}
      </button>

      {open && (
        <div className="mt-3 w-full rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-gray-900">
              الجلب من شوبيفاي
            </h2>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setResult(null);
              }}
              className="text-xs text-gray-500 hover:text-gray-800"
            >
              إخفاء
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
                  اتضاف {added.products} منتج و{added.variants} شكل.
                </p>
              )}

              {toAdd === 0 && !added && (
                <p className="text-gray-600">
                  كل منتجات شوبيفاي موجودة عندك خلاص.
                </p>
              )}

              <Group title="منتجات جديدة" count={plan.newProducts.length}>
                {plan.newProducts.map((p) => (
                  <Row
                    key={p.productId}
                    right={p.title}
                    left={`${p.variants.length} شكل`}
                  />
                ))}
              </Group>

              <Group title="أشكال جديدة لمنتجات عندك" count={plan.newVariants.length}>
                {plan.newVariants.map((v) => (
                  <Row
                    key={v.variant.variantId}
                    right={v.productTitle}
                    left={v.variant.title ?? "—"}
                  />
                ))}
              </Group>

              <Group title="سعر البيع اتغيّر عند شوبيفاي" count={plan.priceChanged.length}>
                {plan.priceChanged.map((p) => (
                  <Row
                    key={p.ourVariantId}
                    right={p.name}
                    left={`${p.ours} ← ${p.shopify}`}
                    note="السعر عندنا مابيتغيّرش لوحده — عدّله بإيدك لو عايز"
                  />
                ))}
              </Group>

              <Group title="عندك ومش عند شوبيفاي" count={plan.onlyHere.length}>
                {plan.onlyHere.map((v) => (
                  <Row key={v.ourVariantId} right={v.name} left="—" />
                ))}
              </Group>

              {/* الناقص — ده أهم جزء في الشاشة */}
              {plan.needsCost.length > 0 && (
                <div className="rounded-lg bg-amber-50 p-3">
                  <p className="text-sm font-bold text-amber-900">
                    {plan.needsCost.length} شكل لسه محتاج تكلفة
                  </p>
                  <p className="mt-0.5 text-xs text-amber-800">
                    شوبيفاي مافيهاش تكلفة — فيها سعر البيع بس. ولحد ما تملا
                    التكلفة، الربح في الداشبورد بيطلع أكبر من الحقيقة.
                  </p>
                  <div className="mt-2 space-y-1">
                    {plan.needsCost.slice(0, 8).map((v) => (
                      <div
                        key={v.ourVariantId}
                        className="flex justify-between gap-3 text-xs text-amber-900"
                      >
                        <span>{v.name}</span>
                        <span className="font-medium">بيع {v.salePrice}</span>
                      </div>
                    ))}
                    {plan.needsCost.length > 8 && (
                      <p className="text-xs text-amber-700">
                        و{plan.needsCost.length - 8} غيرهم…
                      </p>
                    )}
                  </div>
                  <Link
                    href="/products?missing_cost=1"
                    className="mt-2 inline-block text-xs font-medium text-amber-900 underline"
                  >
                    اعرضهم كلهم
                  </Link>
                </div>
              )}

              {plan.newNeedingCost > 0 && !added && (
                <p className="text-xs text-gray-500">
                  و{plan.newNeedingCost} شكل هيتضاف بتكلفة صفر — هيحتاجوا تكلفة
                  برضه.
                </p>
              )}

              {toAdd > 0 && !added && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`تضيف ${toAdd} حاجة جديدة من شوبيفاي؟`)) run(false);
                  }}
                  disabled={busy}
                  className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                >
                  ضيف الـ{toAdd} دول
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Group({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
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
        <span className="font-medium text-gray-900">{left}</span>
      </div>
      {note && <span className="block text-[11px] text-gray-400">{note}</span>}
    </div>
  );
}
