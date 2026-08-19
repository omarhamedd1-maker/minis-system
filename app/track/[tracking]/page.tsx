import { createAdminClient } from "@/lib/supabase/admin";
import { trackView } from "@/lib/tracking-view";
import { TrackGate } from "@/components/TrackGate";
import { openDetails } from "./actions";

export const dynamic = "force-dynamic";

/**
 * صفحة التتبع اللي العميل بيفتحها — باسم المتجر مش باسم شركة الشحن.
 *
 * ⚠️⚠️ **مفتوحة من غير حساب بقصد** — العميل مالوش حساب عندنا. وعشان كده
 * اللي بيتعرض هنا **الحالة وبس**: مافيش اسم عميل ولا تليفون ولا عنوان ولا
 * مبلغ ولا حتى اسم المنتج. يعني حتى لو حد خمّن رقم تتبع، اللي هيشوفه جملة
 * زي «الشحنة في الطريق» ومالهاش صاحب.
 *
 * ⚠️ **والقراية بمفتاح الأدمن من غير فلتر بيزنس** — مقصودة: الزائر مالوش
 * بيزنس، ورقم التتبع بيحدد الشحنة لوحده. الحارس (`lib/tenant-isolation`)
 * بيسمح للملف ده بالاسم عشان ده الاستثناء الوحيد.
 */
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
    <div className="mx-auto max-w-md px-5 py-12">
      <p className="text-xs text-gray-400">{store ?? "تتبع الشحنة"}</p>

      {!view ? (
        // ⚠️ **مانقولش «الشحنة مش موجودة»** — ده بيخلّي الصفحة تقول لأي حد
        // إذا كان الرقم ده حقيقي ولا لأ. الجملة دي مابتفرّقش.
        <>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">
            مالقيناش شحنة بالرقم ده
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            اتأكد من الرقم، ولو لسه مش ظاهر كلّم المتجر.
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">
            {view.headline}
          </h1>
          <p className="mt-2 text-sm text-gray-500">{view.detail}</p>

          <div className="mt-8 space-y-3">
            {view.steps.map((s) => (
              <div key={s.label} className="flex items-center gap-3">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    s.current
                      ? "bg-emerald-500 ring-4 ring-emerald-100"
                      : s.done
                        ? "bg-emerald-400"
                        : "bg-gray-200"
                  }`}
                />
                <span
                  className={`text-sm ${
                    s.current
                      ? "font-bold text-gray-900"
                      : s.done
                        ? "text-gray-600"
                        : "text-gray-300"
                  }`}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          {/*
            بوابة التفاصيل.

            ⚠️ **الحالة فوق بتبان للكل، والتفاصيل بعد التليفون بس** —
            يعني بقى فيه حاجتين: اللينك، وإن يكون هو صاحب الأوردر.
          */}
          <TrackGate tracking={tracking} action={openDetails} />

          <p className="mt-8 text-xs text-gray-400" dir="ltr">
            {tracking}
          </p>
        </>
      )}
    </div>
  );
}
