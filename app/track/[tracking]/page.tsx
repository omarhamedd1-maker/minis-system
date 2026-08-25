import { createAdminClient } from "@/lib/supabase/admin";
import {
  trackView,
  looksLikeOrderId,
  storeWordmark,
} from "@/lib/tracking-view";
import { UI } from "@/lib/tracking-copy";
import { maskedTail } from "@/lib/phone-gate";
import { TrackGate } from "@/components/TrackGate";
import { openDetails } from "./actions";
import { deliveryEta, etaCopy } from "@/lib/delivery-eta";

export const dynamic = "force-dynamic";

/**
 * صفحة التتبع اللي العميل بيفتحها — باسم المتجر مش باسم شركة الشحن.
 *
 * ⚠️⚠️ **مفتوحة من غير حساب بقصد** (مستثناة في `lib/supabase/middleware.ts`)
 * — العميل مالوش حساب عندنا، وقبل كده كان اللينك بيوديه على شاشة الدخول.
 *
 * ⚠️ **واللي بيتعرض من غير تحقّق هو الحالة وبس** — مافيش اسم ولا تليفون ولا
 * عنوان ولا مبلغ ولا اسم منتج. حتى الرقم المخمّن مايوصّلش لبيانات حد.
 *
 * ⚠️ **والقراية بمفتاح الأدمن من غير فلتر بيزنس** مقصودة: الزائر مالوش
 * بيزنس، ورقم التتبع بيحدد الشحنة لوحده. الحارس بيسمح للملف ده بالاسم.
 */
const TONE: Record<string, string> = {
  good: "bg-emerald-500",
  moving: "bg-primary",
  warn: "bg-amber-500",
  done: "bg-emerald-500",
};

export default async function TrackPage({
  params,
}: {
  params: Promise<{ tracking: string }>;
}) {
  const { tracking: raw } = await params;
  const tracking = decodeURIComponent(String(raw ?? "")).trim();

  // ⚠️ **اللينك بقى بمعرّف الأوردر** عشان يشتغل قبل ما الشحنة تتعمل،
  // **واللينكات القديمة اتبعتت برقم التتبع** فلازم تفضل تفتح.
  const db = createAdminClient();
  const query = db
    .from("orders")
    .select("tenant_id, order_status, tenants(name, slug), customers(phone)");
  const { data } = await (
    looksLikeOrderId(tracking)
      ? query.eq("id", tracking)
      : query.eq("bosta_tracking", tracking)
  )
    .limit(1)
    .maybeSingle();

  const row = data as {
    tenant_id: string | null;
    order_status: string | null;
    tenants: { name: string | null; slug: string | null } | null;
    customers: { phone: string | null } | null;
  } | null;

  // ⚠️ **إنجليزي وكابيتال** — الصفحة كلها إنجليزي، والاسم العربي فوقها
  // بيبان غريب. الاسم اللاتيني بييجي من معرّف البيزنس.
  const store = storeWordmark(row?.tenants?.name, row?.tenants?.slug);
  const hint = maskedTail(row?.customers?.phone);
  const view = row ? trackView(row.order_status) : null;

  /**
   * «بيوصل خلال كام يوم» — من شحنات **المتجر ده** اللي وصلت فعلًا.
   *
   * ⚠️⚠️ **الوعد من الشريحة ٧٥٪ مش من الوسيط.** الوسيط وعد بيتكسر نُص
   * الوقت بالتعريف، والعميل اللي اتوعد وماجاش في الميعاد بيرفض الاستلام.
   *
   * ⚠️ **وبيتحسب لكل بيزنس لوحده** — سرعة مينيز مش سرعة أي متجر تاني.
   */
  const eta = await (async () => {
    if (!row?.tenant_id || !view || view.finished) return null;
    const { data: past } = await db
      .from("orders")
      .select("bosta_created_at, delivered_at")
      .eq("tenant_id", row.tenant_id)
      .eq("order_status", "delivered")
      .not("delivered_at", "is", null)
      .not("bosta_created_at", "is", null)
      .order("delivered_at", { ascending: false })
      .limit(300);

    return deliveryEta(
      ((past ?? []) as { bosta_created_at: string; delivered_at: string }[]).map(
        (o) => ({ shippedAt: o.bosta_created_at, deliveredAt: o.delivered_at })
      )
    );
  })();

  const etaText = eta ? etaCopy(eta, Boolean(view?.finished)) : null;

  return (
    <div className="mx-auto max-w-md px-6 py-16" dir="ltr">
      {store && (
        <p className="text-sm font-light tracking-[0.2em] text-gray-900">
          {store}
        </p>
      )}

      {!view ? (
        // ⚠️ **مانقولش «الرقم ده مش موجود»** بشكل بيفرّق بين رقم حقيقي وغلط
        <>
          <h1 className="mt-6 text-3xl font-bold leading-tight text-gray-900">
            {UI.notFound}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-500">
            {UI.notFoundHint}
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-6 text-3xl font-bold leading-tight text-gray-900">
            {view.title}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-600">{view.now}</p>

          {/* ⚠️ مافيش رقم = مافيش سطر — مش رقم افتراضي */}
          {etaText && (
            <p className="mt-1 text-sm leading-relaxed text-gray-400">{etaText}</p>
          )}

          <div className="mt-10 space-y-4">
            {view.steps.map((s) => {
              // ⚠️ **الخطوة الأخيرة في الرحلة اللي خلصت بتتعلّم كمان** —
              // «اتسلّم» مش خطوة جاية، دي خطوة تمّت.
              const passed = s.done || (s.current && view.finished);
              return (
                <div key={s.label} className="flex items-center gap-3">
                  {/*
                    ⚠️ **نقطة صغيرة، والخطوة اللي تمّت خضرا** — الشكل ده
                    بيقول «وصلنا لفين» من غير ما ياخد مساحة ولا يبان كقايمة
                    مهام.
                  */}
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      passed
                        ? "bg-emerald-500"
                        : s.current
                          ? `${TONE[view.tone] ?? "bg-primary"} ring-4 ring-gray-100`
                          : "bg-gray-200"
                    }`}
                  />
                  <span
                    className={`text-sm ${
                      s.current
                        ? "font-medium text-gray-900"
                        : passed
                          ? "text-gray-700"
                          : "text-gray-300"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>

          <TrackGate tracking={tracking} hint={hint} action={openDetails} />

          {/* ⚠️ معرّف الأوردر مالوش معنى للعميل — مايتعرضش */}
          {!looksLikeOrderId(tracking) && (
            <p className="mt-12 text-xs uppercase tracking-wide text-gray-300">
              {UI.trackingLabel} {tracking}
            </p>
          )}
        </>
      )}
    </div>
  );
}
