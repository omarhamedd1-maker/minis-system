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
  moving: "bg-gray-900",
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
    .select("order_status, tenants(name, slug), customers(phone)");
  const { data } = await (
    looksLikeOrderId(tracking)
      ? query.eq("id", tracking)
      : query.eq("bosta_tracking", tracking)
  )
    .limit(1)
    .maybeSingle();

  const row = data as {
    order_status: string | null;
    tenants: { name: string | null; slug: string | null } | null;
    customers: { phone: string | null } | null;
  } | null;

  // ⚠️ **إنجليزي وكابيتال** — الصفحة كلها إنجليزي، والاسم العربي فوقها
  // بيبان غريب. الاسم اللاتيني بييجي من معرّف البيزنس.
  const store = storeWordmark(row?.tenants?.name, row?.tenants?.slug);
  const hint = maskedTail(row?.customers?.phone);
  const view = row ? trackView(row.order_status) : null;

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

          <div className="mt-10 space-y-4">
            {view.steps.map((s) => {
              // ⚠️ **الخطوة الأخيرة في الرحلة اللي خلصت بتتعلّم كمان** —
              // «اتسلّم» مش خطوة جاية، دي خطوة تمّت.
              const passed = s.done || (s.current && view.finished);
              return (
              <div key={s.label} className="flex items-center gap-3">
                {/*
                  ⚠️ **الخطوة اللي عدّت بتفضل متعلّم عليها بعلامة صح** —
                  قبل كده كانت بتبقى نقطة رمادية زي اللي لسه ماجاش،
                  فالعميل مايعرفش وصل لفين.
                */}
                {passed ? (
                  <svg
                    viewBox="0 0 16 16"
                    className="h-4 w-4 shrink-0 text-emerald-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 8.5 6.5 12 13 4" />
                  </svg>
                ) : (
                  <span
                    className={`h-4 w-4 shrink-0 rounded-full ${
                      s.current
                        ? `${TONE[view.tone] ?? "bg-gray-900"} ring-4 ring-gray-100`
                        : "bg-gray-100"
                    }`}
                  />
                )}
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
