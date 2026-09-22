import { BackLink } from "@/components/BackLink";
import { formatMoney } from "@/lib/format";
import { requirePagePermission } from "@/lib/permissions";
import { loadHealth } from "./actions";
import { discountVerdict } from "@/lib/discount-impact";
import { FillReasons } from "@/components/FillReasons";
import { fillReasonsAction } from "./fill-actions";
import { IssuesSinceNote } from "@/components/IssuesSinceNote";

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
      <div className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
        {r.error}
      </div>
    );
  }

  const { rates, lead, aging, reasons, drift, productReturns, customerReturns, prices, timing, discounts, codGap, prepaid, issuesSince, hiddenOld, atCourier } = r;
  const verdict = discountVerdict(discounts);

  return (
    <div className="space-y-4">
      <BackLink href="/orders" label="الأوردرات" />
      <h1 className="text-2xl font-bold text-ink">صحة التشغيل</h1>

      {/*
        ⚠️ الفلتر على أقسام المشاكل بس — النِّسَب على التاريخ كله بقصد،
        لأن فلترة رقم علشان يهدي تنبيه أخطر من التنبيه (DESIGN قاعدة ٨).
      */}
      <IssuesSinceNote
        since={issuesSince}
        hidden={hiddenOld}
        scope="الفلوس الواقفة والفروق بس — النِّسَب على التاريخ كله"
      />

      {/* نِسَب الشحن — المقام هو اللي اتشحن فعلاً مش كل الأوردرات */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Box label="نسبة التسليم" hint={`${rates.delivered} من ${rates.shipped} اتشحنوا`}>
          <span className="text-success">{rates.deliveryRate}%</span>
        </Box>
        <Box
          label="نسبة الرجوع"
          hint={`رجع ${rates.returned} · مرتجع بعد التسليم ${rates.returnedAfter}`}
        >
          <span className="text-danger">{rates.rtoRate}%</span>
        </Box>
        <Box label="بضاعة راجعة" hint="قيمة اللي رجع لك">
          <span className="text-danger">{formatMoney(rates.returnedValue)}</span>
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
          <span className="text-ink">
            {lead.median === null ? "—" : `${lead.median} يوم`}
          </span>
        </Box>
      </div>

      {/* فلوس واقفة عند بوسطة بعمرها */}
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-ink">
            فلوس واقفة عند بوسطة
          </h2>
          {/*
            ⚠️⚠️ **التعريف اتغيّر** (٢٢ سبتمبر): كان «مسلَّم ولسه مااتحصّلش»
            فبيجمع تاريخ التسليم كله — ٤٥٥ ألف على مينيز، وفلوسها وصلت من
            زمان في ٩٤ تحويل. الصح: اللي اتسلّم **بعد آخر تحويل**.
          */}
          <span className="text-xs text-ink-muted">
            اتسلّم بعد آخر تحويل
          </span>
        </div>
        {/* ⚠️ الرقم ده معتمد على إن آخر تحويل متسجّل — لو التحويل وقف بيكبر كذب */}
        {atCourier.warning && (
          <p className="mt-2 rounded-control bg-warning-soft px-3 py-2 text-xs text-warning">
            {atCourier.warning}
          </p>
        )}
        {aging.count === 0 ? (
          <p className="mt-3 text-sm text-success">
            مفيش — بوسطة مصفّية كل حاجة.
          </p>
        ) : (
          <>
            <p className="mt-2 text-2xl font-bold tabular-nums text-danger">
              {formatMoney(aging.total)}
            </p>
            <p className="text-xs text-ink-muted">
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
                    <span className="text-ink-muted">{b.label}</span>
                    <span className="tabular-nums text-ink">
                      {formatMoney(b.amount)}{" "}
                      <span className="text-xs text-ink-faint">
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
        <div className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-ink">
              إجمالي مختلف عن شوبيفاي
            </h2>
            <span className="text-xs text-ink-muted">{drift.length} أوردر</span>
          </div>
          <p className="mt-1 text-xs text-ink-faint">
            الأوردر اللي اتعدّل عند شوبيفاي بعد ما دخل هنا — التعديل
            مابيوصلش. واللي بوسطة حصّلته هو اللي بيقول مين الصح.
          </p>

          <div className="mt-3 space-y-2">
            {drift.slice(0, 15).map((d) => (
              <div
                key={d.orderNumber}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line pb-2 last:border-0"
              >
                <span className="text-sm text-ink">#{d.orderNumber}</span>
                <span className="text-xs tabular-nums text-ink-muted">
                  عندنا {formatMoney(d.ours)} · شوبيفاي{" "}
                  {formatMoney(d.shopify)}
                  {d.collected !== null && (
                    <> · اتحصّل {formatMoney(d.collected)}</>
                  )}
                </span>
                <span className="w-full text-[11px] text-ink-faint">
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
            <p className="mt-2 text-xs text-ink-faint">
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
            <div className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-bold text-ink">منتجات بترجع كتير</h2>
                <span className="text-xs text-ink-muted">
                  المتوسط عندك {productReturns.overall}%
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-ink-faint">
                كل مرتجع بيدفع شحن رايح وجاي ورسوم. اللي فوق المتوسط بيستاهل
                نظرة على وصفه وصوره.
              </p>
              <div className="mt-3 space-y-1.5">
                {productReturns.rows.slice(0, 8).map((p) => (
                  <div key={p.key} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate text-ink">{p.name}</span>
                    <span className="shrink-0 tabular-nums">
                      <span className={p.rate > productReturns.overall ? "text-danger" : "text-ink-muted"}>
                        {p.rate}%
                      </span>{" "}
                      <span className="text-xs text-ink-faint">({p.returned} من {p.shipped})</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {customerReturns.rows.length > 0 && (
            <div className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-bold text-ink">عملاء بيرجّعوا كتير</h2>
                <span className="text-xs text-ink-muted">{customerReturns.rows.length} عميل</span>
              </div>
              <p className="mt-0.5 text-[11px] text-ink-faint">
                دي مش قايمة سودا — بس قبل ما تشحن لواحد فيهم، تأكيد المكالمة
                بيوفّر شحنة رايحة جاية.
              </p>
              <div className="mt-3 space-y-1.5">
                {customerReturns.rows.slice(0, 8).map((c) => (
                  <div key={c.key} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate text-ink">{c.name}</span>
                    <span className="shrink-0 tabular-nums text-danger">
                      {c.rate}%{" "}
                      <span className="text-xs text-ink-faint">({c.returned} من {c.shipped})</span>
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
        <div className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-ink">الشحن حسب يوم الأسبوع</h2>
            <span className="text-xs text-ink-muted">
              {timing.shipped} شحنة خلصت مشوارها
            </span>
          </div>

          {timing.best && timing.worst && timing.best.day !== timing.worst.day ? (
            <p className="mt-0.5 text-[11px] text-ink-faint">
              اللي بتشحنه {timing.best.name} بيوصل {Math.round(timing.best.deliveryRate)}%
              واللي بتشحنه {timing.worst.name} بيوصل {Math.round(timing.worst.deliveryRate)}%.
              الفرق ده ممكن يكون بسببك وممكن يكون صدفة — بصّ على عدد الشحنات جنب كل يوم.
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-ink-faint">
              لسه مافيش يومين شحناتهم تكفي للمقارنة. الأرقام تحت بتتملى لوحدها.
            </p>
          )}

          <div className="mt-3 space-y-1.5">
            {timing.rows
              .filter((d) => d.shipped > 0)
              .map((d) => (
                <div key={d.day} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="w-16 shrink-0 text-ink">{d.name}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block h-1.5 rounded-full bg-sunken">
                      <span
                        className="block h-1.5 rounded-full bg-success"
                        style={{ width: `${Math.round(d.deliveryRate)}%` }}
                      />
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-xs text-ink-muted">
                    {Math.round(d.deliveryRate)}%{" "}
                    <span className="text-ink-faint">
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
        <div className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-ink">السعر اللي بيبيع</h2>
            <span className="text-xs text-ink-muted">{prices.length} منتج اتباع بسعرين</span>
          </div>
          <p className="mt-0.5 text-[11px] text-ink-faint">
            المقارنة بالجنيه **في اليوم**، عشان الفترة الأطول ماتكسبش لوحدها.
            ودي مقارنة مش تجربة: لو غيّرت السعر مع إعلان أو موسم، الفرق مش بتاع السعر.
          </p>

          <div className="mt-3 space-y-3">
            {prices.slice(0, 6).map((t) => (
              <div key={t.variantId} className="border-t border-line pt-2 first:border-0 first:pt-0">
                <p className="truncate text-sm text-ink">{t.name}</p>
                <div className="mt-1 grid gap-1 sm:grid-cols-2">
                  <PricePointLine point={t.low} won={t.winner === "low"} />
                  <PricePointLine point={t.high} won={t.winner === "high"} />
                </div>
                {t.overlapped ? (
                  <p className="mt-1 text-[11px] text-warning">
                    ⚠️ السعرين كانوا شغالين في نفس الوقت — ده خصم مش تغيير سعر،
                    والمقارنة هنا مالهاش معنى.
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-ink-muted">
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

      {/*
        رقمنا مقابل رقم بوسطة.

        ⚠️⚠️ **مافيش تصليح تلقائي بقصد** — أحيانًا رقمنا هو الغلط، وأحيانًا
        الاتنين صح (شحنة جزئية)، وبوسطة بتحدّد عدد مرات تعديل التحصيل
        فالأوتوماتيك بياكلهم.
      */}
      {/*
        الدفع المقدم بيوفّر كام.

        ⚠️⚠️ **الرقم من رجوع الدفع عند الاستلام مش من مقارنة الطريقتين.**
        عدد الأوردرات المدفوعة مقدم صغير جدًا (٦ عند مينيز)، و«صفر رجوع»
        عليهم مش دليل — ده نفس فخ «١٠٠٪ على أوردر واحد».
      */}
      {prepaid.codReturnRate !== null && prepaid.lossPerCod !== null && (
        <div className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-ink">
              الدفع المقدم بيوفّر كام
            </h2>
            <span className="text-xs text-ink-muted">
              {prepaid.prepaidCount} أوردر مدفوع مقدم
            </span>
          </div>

          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            <span className="font-medium text-ink">
              {prepaid.codReturnRate}%
            </span>{" "}
            من أوردرات الدفع عند الاستلام بترجع. يعني كل أوردر بيتدفع عند
            الاستلام شايل خسارة متوقعة{" "}
            <span className="font-medium text-ink">
              {formatMoney(Math.round(prepaid.lossPerCod))}
            </span>{" "}
            شحن — والمدفوع مقدم مابيشلهاش، الفلوس معاك قبل ما الشحنة تتحرك.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-control bg-sunken px-3 py-2">
              <p className="text-[11px] text-ink-muted">اتحرق على الراجع</p>
              <p className="text-sm font-bold tabular-nums text-danger">
                {formatMoney(prepaid.burned)}
              </p>
            </div>
            <div className="rounded-control bg-sunken px-3 py-2">
              <p className="text-[11px] text-ink-muted">خصم يستاهل تديه</p>
              <p className="text-sm font-bold tabular-nums text-ink">
                {prepaid.worthDiscount === null
                  ? "—"
                  : formatMoney(prepaid.worthDiscount)}
                {prepaid.worthPercent !== null && (
                  <span className="mr-1 text-xs font-normal text-ink-faint">
                    ({prepaid.worthPercent}%)
                  </span>
                )}
              </p>
            </div>
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            الخصم ده هو اللي بتوفّره بالظبط — أكبر منه بيبقى أغلى من المشكلة.
            والرقم محسوب من رجوع الدفع عند الاستلام على مئات الأوردرات، مش من
            مقارنة بالمدفوع مقدم (عددهم لسه صغير).
          </p>
        </div>
      )}
      {codGap.rows.length > 0 && (
        <div className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-ink">
              التحصيل مختلف عن بوسطة
            </h2>
            <span className="text-xs text-ink-muted">
              {codGap.rows.length} أوردر · {formatMoney(codGap.total)}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-ink-faint">
            الرقم اللي بوسطة هتحصّله مختلف عن إجمالي الأوردر عندنا.
            {codGap.fixable > 0
              ? ` ${codGap.fixable} منهم لسه في السكة وينفع يتظبطوا.`
              : " كلهم خلصوا خلاص، فالفرق للعلم بس."}
          </p>
          <div className="mt-3 space-y-1.5">
            {codGap.rows.slice(0, 10).map((g) => (
              <div
                key={g.orderNumber}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="text-ink">#{g.orderNumber}</span>
                <span className="tabular-nums text-xs text-ink-muted">
                  عندنا {formatMoney(g.ours)} · بوسطة {formatMoney(g.bosta)}
                  {" · "}
                  <span className={g.diff > 0 ? "text-success" : "text-danger"}>
                    {g.diff > 0 ? "+" : ""}
                    {formatMoney(g.diff)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/*
        الخصم كسّب ولا خسّر.

        ⚠️ **الحكم بيتقال بس لما المجموعتين يبقى فيهم عدد كفاية** — حكم
        على ٣ أوردرات فيها خصم مالوش معنى، والصمت أحسن.
      */}
      {discounts.withDiscount.orders > 0 && (
        <div className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-ink">الخصم كسّب ولا خسّر</h2>
            <span className="text-xs text-ink-muted">
              {formatMoney(Math.round(discounts.withDiscount.discount))} اتخصمت
            </span>
          </div>

          <p className="mt-0.5 text-[11px] text-ink-faint">
            {verdict ??
              "لسه مافيش أوردرات كفاية في المجموعتين عشان المقارنة يبقى ليها معنى."}
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {[
              { label: "أوردرات فيها خصم", g: discounts.withDiscount },
              { label: "من غير خصم", g: discounts.without },
            ].map((x) => (
              <div key={x.label} className="rounded-control bg-sunken px-3 py-2">
                <p className="text-xs text-ink-muted">{x.label}</p>
                <p className="text-sm tabular-nums text-ink">
                  {x.g.orders} أوردر · متوسط{" "}
                  {formatMoney(Math.round(x.g.average))}
                </p>
                <p className="text-[11px] text-ink-faint">
                  رجوع{" "}
                  {x.g.returnRate === null ? "—" : x.g.returnRate + "%"}
                </p>
              </div>
            ))}
          </div>

          {discounts.codes.length > 0 ? (
            <div className="mt-3 space-y-1.5 border-t border-line pt-2">
              {discounts.codes.slice(0, 8).map((c) => (
                <div
                  key={c.code}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="font-medium text-ink" dir="ltr">
                    {c.code}
                  </span>
                  <span className="tabular-nums text-ink-muted">
                    {c.orders} أوردر · جاب{" "}
                    {formatMoney(Math.round(c.revenue))} · كلّف{" "}
                    {formatMoney(Math.round(c.discount))}
                    {c.returned > 0 && " · رجع " + c.returned}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            // ⚠️ **مش نقص** — كود الخصم بقى بيتجاب من شوبيفاي من ١٩ أغسطس
            // ٢٠٢٦، والأوردرات اللي قبل كده مالهاش كود متخزّن عندنا أصلًا.
            <p className="mt-3 border-t border-line pt-2 text-xs text-ink-faint">
              تفصيل الأكواد بيتملى مع الأوردرات الجاية — الأوردرات القديمة
              دخلت من غير ما الكود يتخزّن.
            </p>
          )}
        </div>
      )}

      {/* أسباب الرجوع — واللي مااتسجّلش بيتعرض لوحده */}
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-ink">رجعوا ليه؟</h2>
          <span className="text-xs text-ink-muted">
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
          <>
            {/*
              ⚠️ **القسم الفاضي مش نقص ولا شغل متأخّر** — الخانة اتعملت
              ١٢ أغسطس ٢٠٢٦. بس بوسطة نفسها بتسجّل سبب كل محاولة، فالزرار
              تحت بيجيبه منها بدل ما القسم يفضل فاضي.
            */}
            <p className="mt-3 text-sm text-ink-muted">
              مفيش سبب متسجّل على أي شحنة راجعة لسه — وبوسطة عندها السبب.
            </p>
            <FillReasons action={fillReasonsAction} />
          </>
        ) : (
          <>
            <div className="mt-3 space-y-2">
              {reasons.rows.map((row) => (
                <div key={row.value}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink">{row.label}</span>
                    <span className="tabular-nums text-ink-muted">
                      {row.share}%{" "}
                      <span className="text-xs text-ink-faint">
                        ({row.count} · {formatMoney(row.amount)})
                      </span>
                    </span>
                  </div>
                  {/* العلاج جنب السبب — السبب من غير علاج مالوش لازمة */}
                  <p className="text-xs text-ink-faint">{row.fix}</p>
                </div>
              ))}
            </div>
            {reasons.unknown > 0 && (
              // بيان عن النِّسَب نفسها، مش طلب من حد. الرقم موجود عشان
              // اللي بيقرا يعرف النِّسَب دي مبنية على كام شحنة.
              <p className="mt-3 border-t border-line pt-2 text-xs text-ink-faint">
                النِّسَب دي على {reasons.total - reasons.unknown} شحنة
                سببها متسجّل. الباقي ({reasons.unknown}) بره الحسبة عشان
                الأرقام ماتبانش أدق مما هي.
              </p>
            )}
            {reasons.unknown > 0 && <FillReasons action={fillReasonsAction} />}
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
        won ? "font-bold text-success" : "text-ink-muted"
      }`}
    >
      بـ{formatMoney(point.price)}: {formatMoney(Math.round(point.revenuePerDay))} في اليوم
      <span className="font-normal text-ink-faint">
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
    <div className="card p-4 sm:p-5">
      <p className="text-xs text-ink-muted sm:text-sm">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">
        {children}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-faint">{hint}</p>}
    </div>
  );
}
