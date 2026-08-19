import { BackLink } from "@/components/BackLink";
import { formatMoney } from "@/lib/format";
import { requirePagePermission } from "@/lib/permissions";
import { loadHealth } from "./actions";

export const dynamic = "force-dynamic";

/**
 * صحة التشغيل — «إيه اللي بيضيع».
 *
 * الداشبورد بتجاوب «كسبت كام». الصفحة دي بتجاوب السؤال التاني: نسبة
 * الرجوع، وفلوس واقفة عند بوسطة، وزمن التوصيل، وأسباب الرجوع.
 *
 * **مفيش زرار جلب** — الداتا كلها عندنا، فالحساب بيحصل مع فتح الصفحة.
 */
export default async function HealthPage() {
  await requirePagePermission("finance.dashboard");
  const r = await loadHealth();

  if (!r.ok) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        {r.error}
      </div>
    );
  }

  const { rates, lead, aging, reasons, drift, productReturns, customerReturns, prices, timing } = r;

  return (
    <div className="space-y-4">
      <BackLink href="/orders" label="الأوردرات" />
      <h1 className="text-2xl font-bold text-gray-900">صحة التشغيل</h1>

      {/* نِسَب الشحن — المقام هو اللي اتشحن فعلاً مش كل الأوردرات */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Box label="نسبة التسليم" hint={`${rates.delivered} من ${rates.shipped} اتشحنوا`}>
          <span className="text-emerald-600">{rates.deliveryRate}%</span>
        </Box>
        <Box
          label="نسبة الرجوع"
          hint={`رجع ${rates.returned} · مرتجع بعد التسليم ${rates.returnedAfter}`}
        >
          <span className="text-red-600">{rates.rtoRate}%</span>
        </Box>
        <Box label="بضاعة راجعة" hint="قيمة اللي رجع لك">
          <span className="text-red-600">{formatMoney(rates.returnedValue)}</span>
        </Box>
        <Box
          label="زمن التوصيل"
          hint={
            lead.median === null
              ? "مفيش تسليمات بتواريخ موثوقة"
              : `الوسيط · أبطأ ${lead.slowest} يوم · من ${lead.count} تسليم` +
                (lead.skipped ? ` (${lead.skipped} تواريخهم منقولة فاتشالوا)` : "")
          }
        >
          <span className="text-gray-900">
            {lead.median === null ? "—" : `${lead.median} يوم`}
          </span>
        </Box>
      </div>

      {/* فلوس واقفة عند بوسطة بعمرها */}
      <div className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-900">
            فلوس واقفة عند بوسطة
          </h2>
          <span className="text-xs text-gray-500">
            مسلَّم ولسه مااتحصّلش
          </span>
        </div>
        {aging.count === 0 ? (
          <p className="mt-3 text-sm text-emerald-600">
            مفيش — بوسطة مصفّية كل حاجة.
          </p>
        ) : (
          <>
            <p className="mt-2 text-2xl font-bold tabular-nums text-red-600">
              {formatMoney(aging.total)}
            </p>
            <p className="text-xs text-gray-500">
              في {aging.count} أوردر · أقدم واحد من {aging.oldestDays} يوم
            </p>
            <div className="mt-3 space-y-1.5">
              {aging.buckets
                .filter((b) => b.count > 0)
                .map((b) => (
                  <div
                    key={b.label}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-500">{b.label}</span>
                    <span className="tabular-nums text-gray-900">
                      {formatMoney(b.amount)}{" "}
                      <span className="text-xs text-gray-400">
                        ({b.count})
                      </span>
                    </span>
                  </div>
                ))}
            </div>
          </>
        )}
      </div>

      {/*
        أوردرات إجماليها مختلف عن شوبيفاي.

        ⚠️ **مابنزامنهاش تلقائي بقصد.** اتفحصت ٤ أوردرات حقيقية والحكم كان
        اللي بوسطة حصّلته: في تلاتة شوبيفاي كانت الصح، وفي واحد **إحنا**
        الصح وشوبيفاي هي القديمة. فالنسخ منها أوتوماتيك كان هيبوّظ أوردر
        سليم. القسم ده بيوري الفرق وبس.
      */}
      {drift !== null && drift.length > 0 && (
        <div className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-gray-900">
              إجمالي مختلف عن شوبيفاي
            </h2>
            <span className="text-xs text-gray-500">{drift.length} أوردر</span>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            الأوردر اللي اتعدّل عند شوبيفاي بعد ما دخل هنا — التعديل
            مابيوصلش. واللي بوسطة حصّلته هو اللي بيقول مين الصح.
          </p>

          <div className="mt-3 space-y-2">
            {drift.slice(0, 15).map((d) => (
              <div
                key={d.orderNumber}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-gray-50 pb-2 last:border-0"
              >
                <span className="text-sm text-gray-900">#{d.orderNumber}</span>
                <span className="text-xs tabular-nums text-gray-500">
                  عندنا {formatMoney(d.ours)} · شوبيفاي{" "}
                  {formatMoney(d.shopify)}
                  {d.collected !== null && (
                    <> · اتحصّل {formatMoney(d.collected)}</>
                  )}
                </span>
                <span className="w-full text-[11px] text-gray-400">
                  {d.matches === "ours"
                    ? "الفلوس اللي اتحصّلت مطابقة لرقمنا — شوبيفاي هي القديمة"
                    : d.matches === "shopify"
                      ? "الفلوس اللي اتحصّلت مطابقة لشوبيفاي — رقمنا هو الغلط"
                      : d.matches === "neither"
                        ? "الفلوس اللي اتحصّلت مش مطابقة لا لرقمنا ولا لشوبيفاي"
                        : "الشحنة لسه مااتحصّلتش، فمفيش حكم"}
                </span>
              </div>
            ))}
          </div>
          {drift.length > 15 && (
            <p className="mt-2 text-xs text-gray-400">
              وفيه {drift.length - 15} كمان — دول أكبرهم فرقًا.
            </p>
          )}
        </div>
      )}

      {/*
        اللي بيرجع كتير — منتجات وعملاء.

        ⚠️ **الحساب على الأوردر مش على البند بقصد**: خانة «الكمية الراجعة»
        صفر في كل الداتا، لأن بوسطة بترجّع الطرد كله. الحساب بيها كان
        هيطلّع كل النسب أصفار ويبان إن مفيش مشكلة.

        **والمقام هو اللي اتشحن فعلًا** — الملغي واللي لسه جديد بره الحسبة.
      */}
      {(productReturns.rows.length > 0 || customerReturns.rows.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {productReturns.rows.length > 0 && (
            <div className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-bold text-gray-900">منتجات بترجع كتير</h2>
                <span className="text-xs text-gray-500">
                  المتوسط عندك {productReturns.overall}%
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-gray-400">
                كل مرتجع بيدفع شحن رايح وجاي ورسوم. اللي فوق المتوسط بيستاهل
                نظرة على وصفه وصوره.
              </p>
              <div className="mt-3 space-y-1.5">
                {productReturns.rows.slice(0, 8).map((p) => (
                  <div key={p.key} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate text-gray-900">{p.name}</span>
                    <span className="shrink-0 tabular-nums">
                      <span className={p.rate > productReturns.overall ? "text-red-600" : "text-gray-500"}>
                        {p.rate}%
                      </span>{" "}
                      <span className="text-xs text-gray-400">({p.returned} من {p.shipped})</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {customerReturns.rows.length > 0 && (
            <div className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-bold text-gray-900">عملاء بيرجّعوا كتير</h2>
                <span className="text-xs text-gray-500">{customerReturns.rows.length} عميل</span>
              </div>
              <p className="mt-0.5 text-[11px] text-gray-400">
                دي مش قايمة سودا — بس قبل ما تشحن لواحد فيهم، تأكيد المكالمة
                بيوفّر شحنة رايحة جاية.
              </p>
              <div className="mt-3 space-y-1.5">
                {customerReturns.rows.slice(0, 8).map((c) => (
                  <div key={c.key} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate text-gray-900">{c.name}</span>
                    <span className="shrink-0 tabular-nums text-red-600">
                      {c.rate}%{" "}
                      <span className="text-xs text-gray-400">({c.returned} من {c.shipped})</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}


      {/*
        يوم الشحن.

        ⚠️ **ارتباط مش سبب** — اليوم اللي بتشحن فيه أكتر هيبان عليه كل
        الحلو وكل الوحش. عشان كده عدد الشحنات مكتوب جنب كل يوم، واليوم
        اللي شحناته قليلة بره المقارنة أصلًا.
      */}
      {timing.shipped > 0 && (
        <div className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-gray-900">الشحن حسب يوم الأسبوع</h2>
            <span className="text-xs text-gray-500">
              {timing.shipped} شحنة خلصت مشوارها
            </span>
          </div>

          {timing.best && timing.worst && timing.best.day !== timing.worst.day ? (
            <p className="mt-0.5 text-[11px] text-gray-400">
              اللي بتشحنه {timing.best.name} بيوصل {Math.round(timing.best.deliveryRate)}%
              واللي بتشحنه {timing.worst.name} بيوصل {Math.round(timing.worst.deliveryRate)}%.
              الفرق ده ممكن يكون بسببك وممكن يكون صدفة — بصّ على عدد الشحنات جنب كل يوم.
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-gray-400">
              لسه مافيش يومين شحناتهم تكفي للمقارنة. الأرقام تحت بتتملى لوحدها.
            </p>
          )}

          <div className="mt-3 space-y-1.5">
            {timing.rows
              .filter((d) => d.shipped > 0)
              .map((d) => (
                <div key={d.day} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="w-16 shrink-0 text-gray-900">{d.name}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block h-1.5 rounded-full bg-gray-100">
                      <span
                        className="block h-1.5 rounded-full bg-emerald-400"
                        style={{ width: `${Math.round(d.deliveryRate)}%` }}
                      />
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-xs text-gray-500">
                    {Math.round(d.deliveryRate)}%{" "}
                    <span className="text-gray-400">
                      ({d.shipped} شحنة
                      {d.leadDays !== null && ` · ${d.leadDays.toFixed(1)} يوم`})
                    </span>
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/*
        السعر اللي بيبيع.

        ⚠️ **المقارنة بالفلوس في اليوم مش بالإجمالي** — السعر القديم عايش
        شهور والجديد أسبوع، فالإجمالي بيكسب للقديم دايمًا وهو مش بيقول حاجة.
      */}
      {prices.length > 0 && (
        <div className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-gray-900">السعر اللي بيبيع</h2>
            <span className="text-xs text-gray-500">{prices.length} منتج اتباع بسعرين</span>
          </div>
          <p className="mt-0.5 text-[11px] text-gray-400">
            المقارنة بالجنيه **في اليوم**، عشان الفترة الأطول ماتكسبش لوحدها.
            ودي مقارنة مش تجربة: لو غيّرت السعر مع إعلان أو موسم، الفرق مش بتاع السعر.
          </p>

          <div className="mt-3 space-y-3">
            {prices.slice(0, 6).map((t) => (
              <div key={t.variantId} className="border-t border-gray-100 pt-2 first:border-0 first:pt-0">
                <p className="truncate text-sm text-gray-900">{t.name}</p>
                <div className="mt-1 grid gap-1 sm:grid-cols-2">
                  <PricePointLine point={t.low} won={t.winner === "low"} />
                  <PricePointLine point={t.high} won={t.winner === "high"} />
                </div>
                {t.overlapped ? (
                  <p className="mt-1 text-[11px] text-amber-700">
                    ⚠️ السعرين كانوا شغالين في نفس الوقت — ده خصم مش تغيير سعر،
                    والمقارنة هنا مالهاش معنى.
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-gray-500">
                    {t.winner === "high" ? "الأغلى" : "الأرخص"} بيجيب فلوس أكتر في اليوم بـ
                    {" "}{Math.abs(t.gainPercent)}%
                    {t.high.returnRate > t.low.returnRate + 5 &&
                      " — بس الرجوع بيزيد مع السعر الأعلى"}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* أسباب الرجوع — واللي مااتسجّلش بيتعرض لوحده */}
      <div className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-900">رجعوا ليه؟</h2>
          <span className="text-xs text-gray-500">
            {reasons.total} شحنة راجعة
          </span>
        </div>

        {reasons.rows.length === 0 ? (
          // ⚠️ **القسم الفاضي مش نقص ولا شغل متأخّر.**
          //
          // خانة السبب اتعملت ١٢ أغسطس ٢٠٢٦، والشحنات اللي رجعت قبلها
          // مالهاش سبب **مش لأن حد نسي** — الخانة نفسها ماكانتش موجودة.
          // النسخة الأولى كانت بتقول «و٤٦ شحنة مستنية»، وده بيقرا كأنه
          // دَين على صاحب المتجر في حاجة مافيش طريقة يعملها أصلًا.
          <p className="mt-3 text-sm text-gray-500">
            مفيش سبب متسجّل على أي شحنة راجعة لسه، فالقسم فاضي. بيتملى
            لوحده مع أول شحنة يتكتب سببها.
          </p>
        ) : (
          <>
            <div className="mt-3 space-y-2">
              {reasons.rows.map((row) => (
                <div key={row.value}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-900">{row.label}</span>
                    <span className="tabular-nums text-gray-500">
                      {row.share}%{" "}
                      <span className="text-xs text-gray-400">
                        ({row.count} · {formatMoney(row.amount)})
                      </span>
                    </span>
                  </div>
                  {/* العلاج جنب السبب — السبب من غير علاج مالوش لازمة */}
                  <p className="text-xs text-gray-400">{row.fix}</p>
                </div>
              ))}
            </div>
            {reasons.unknown > 0 && (
              // بيان عن النِّسَب نفسها، مش طلب من حد. الرقم موجود عشان
              // اللي بيقرا يعرف النِّسَب دي مبنية على كام شحنة.
              <p className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-400">
                النِّسَب دي على {reasons.total - reasons.unknown} شحنة
                سببها متسجّل. الباقي ({reasons.unknown}) بره الحسبة عشان
                الأرقام ماتبانش أدق مما هي.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** سطر سعر واحد — والكسبان فيهم بيتعلّم */
function PricePointLine({
  point,
  won,
}: {
  point: {
    price: number;
    unitsPerDay: number;
    revenuePerDay: number;
    days: number;
    orders: number;
    returnRate: number;
  };
  won: boolean;
}) {
  return (
    <p
      className={`text-xs tabular-nums ${
        won ? "font-bold text-emerald-700" : "text-gray-500"
      }`}
    >
      بـ{formatMoney(point.price)}: {formatMoney(Math.round(point.revenuePerDay))} في اليوم
      <span className="font-normal text-gray-400">
        {" "}({point.orders} أوردر على {point.days} يوم · رجوع{" "}
        {Math.round(point.returnRate)}%)
      </span>
    </p>
  );
}

function Box({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs text-gray-500 sm:text-sm">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">
        {children}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}
