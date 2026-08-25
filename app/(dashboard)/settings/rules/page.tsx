import { BackLink } from "@/components/BackLink";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePagePermission } from "@/lib/permissions";
import { TRIGGERS, UNITS, DIRECTION, type Trigger } from "@/lib/automation";
import { saveRule, toggleRule } from "./actions";

export const dynamic = "force-dynamic";

/** الجملة اللي بتشرح القاعدة قبل ما تكتب الرقم */
const HINT: Record<Trigger, string> = {
  order_waiting: "أوردر جديد قاعد من غير ما حد يأكّده",
  order_not_shipped: "أوردر متأكّد ولسه مااتعملّوش شحنة",
  shipment_stuck: "شحنة عند بوسطة مش بتتحرك",
  stock_low: "شكل مخزونه قرّب يخلص",
  big_order: "أوردر كبير — يستاهل مكالمة تأكيد",
  cod_gap: "الرقم اللي بوسطة هتحصّله مختلف عن إجمالي الأوردر عندنا",
};

const UNIT_LABEL: Record<"days" | "money" | "units", string> = {
  days: "يوم",
  money: "جنيه",
  units: "قطعة",
};

type RuleRow = {
  id: string;
  trigger: string;
  threshold: number;
  active: boolean;
};

/**
 * قواعد «لو حصل كذا نبّهني».
 *
 * ⚠️⚠️ **القواعد بتنبّه بس — مابتعملش حاجة في الداتا.** ولا بتلغي أوردر
 * ولا بتغيّر حالة ولا بتبعت للعميل. السيستم اللي بيتصرّف لوحده في فلوس
 * وشحنات محدش بيثق فيه، وأول غلطة بيتقفل.
 */
export default async function RulesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const me = await requirePagePermission("admin.settings");

  const { data, error: readError } = await createAdminClient()
    .from("automation_rules")
    .select("id, trigger, threshold, active")
    // ⚠️ **tenant_id إجباري مع مفتاح الأدمن** — بيعدّي فوق قواعد المنع
    .eq("tenant_id", me.tenantId)
    .limit(50)
    .overrideTypes<RuleRow[]>();

  const missingTable = Boolean(readError);
  const byTrigger = new Map((data ?? []).map((r) => [r.trigger, r]));

  return (
    <div className="max-w-2xl space-y-4">
      <BackLink href="/settings" label="الإعدادات" />

      <div>
        <h1 className="text-lg font-bold text-gray-900">قواعد التنبيه</h1>
        <p className="mt-1 text-xs text-gray-400">
          إنت اللي بتحدد الأرقام — مش الكود.
        </p>
      </div>

      {missingTable && (
        <div className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-bold">الصفحة محتاجة جدول في الداتابيز الأول.</p>
          <p className="mt-1">
            افتح Supabase ← SQL Editor وشغّل{" "}
            <code>sql/automation-rules.sql</code>، وبعدها افتح الصفحة دي تاني.
          </p>
          <p className="mt-2 text-xs text-amber-700">({readError?.message})</p>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {saved && (
        <p className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-800">
          {saved}
        </p>
      )}

      {/*
        ⚠️⚠️ **التنبيه بيتقال مرة لكل حالة** — مش كل ربع ساعة لحد ما يتصلّح.
        الإشعار اللي بيتكرر بيتقفل بعد تلات مرات، وبعدين اللي فيه خبر مايتقراش.
      */}
      <div className="space-y-2">
        {(Object.keys(TRIGGERS) as Trigger[]).map((t) => {
          const rule = byTrigger.get(t);
          const unit = UNITS[t];
          const below = DIRECTION[t] === "below";

          return (
            <div key={t} className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {TRIGGERS[t]}
                </span>
                {rule && (
                  <form action={toggleRule}>
                    <input type="hidden" name="rule_id" value={rule.id} />
                    <input
                      type="hidden"
                      name="active"
                      value={rule.active ? "0" : "1"}
                    />
                    <button className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">
                      {rule.active ? "شغّالة — اقفلها" : "مقفولة — شغّلها"}
                    </button>
                  </form>
                )}
              </div>

              <p className="mt-0.5 text-[11px] text-gray-400">{HINT[t]}</p>

              <form
                action={saveRule}
                className="mt-3 flex flex-wrap items-center gap-2"
              >
                <input type="hidden" name="trigger" value={t} />
                <span className="text-xs text-gray-500">
                  {below ? "نبّهني لما ينزل تحت" : "نبّهني بعد"}
                </span>
                <input
                  name="threshold"
                  type="number"
                  min="1"
                  step={unit === "money" ? "1" : "1"}
                  defaultValue={rule ? String(rule.threshold) : ""}
                  placeholder="؟"
                  required
                  disabled={missingTable}
                  className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none disabled:bg-gray-50"
                />
                <span className="text-xs text-gray-500">{UNIT_LABEL[unit]}</span>
                <button
                  disabled={missingTable}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                >
                  {rule ? "غيّر" : "شغّلها"}
                </button>
              </form>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] leading-relaxed text-gray-400">
        القواعد دي **بتنبّه بس** — مابتلغيش أوردر ولا بتغيّر حالة ولا بتبعت
        للعميل. وكل حالة بتتقال عليها مرة واحدة، مش كل ربع ساعة لحد ما تتصلّح.
      </p>
    </div>
  );
}
