import { createAdminClient } from "@/lib/supabase/admin";
import { trackView } from "@/lib/tracking-view";
import { UI } from "@/lib/tracking-copy";
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

  const db = createAdminClient();
  const { data } = await db
    .from("orders")
    .select("order_status, tenants(name)")
    .eq("bosta_tracking", tracking)
    .limit(1)
    .maybeSingle();

  const row = data as {
    order_status: string | null;
    tenants: { name: string | null } | null;
  } | null;

  const store = row?.tenants?.name ?? null;
  const view = row ? trackView(row.order_status) : null;

  return (
    <div className="mx-auto max-w-md px-6 py-16" dir="ltr">
      {store && (
        <p className="text-sm font-medium tracking-wide text-gray-900">{store}</p>
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
          {view.next && (
            <p className="mt-1.5 text-sm leading-relaxed text-gray-400">
              {view.next}
            </p>
          )}

          <div className="mt-10 space-y-4">
            {view.steps.map((s) => (
              <div key={s.label} className="flex items-center gap-3">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    s.current
                      ? `${TONE[view.tone] ?? "bg-gray-900"} ring-4 ring-gray-100`
                      : s.done
                        ? "bg-gray-300"
                        : "bg-gray-100"
                  }`}
                />
                <span
                  className={`text-sm ${
                    s.current
                      ? "font-medium text-gray-900"
                      : s.done
                        ? "text-gray-500"
                        : "text-gray-300"
                  }`}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          <TrackGate tracking={tracking} action={openDetails} />

          <p className="mt-12 text-xs uppercase tracking-wide text-gray-300">
            {UI.trackingLabel} {tracking}
          </p>
        </>
      )}
    </div>
  );
}
