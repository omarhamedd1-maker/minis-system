import { createAdminClient } from "@/lib/supabase/admin";
import { requirePagePermission } from "@/lib/permissions";
import { SendAnnouncement, type NotifyMember } from "@/components/SendAnnouncement";
import { sendAnnouncement } from "./actions";

type AppUserRow = {
  auth_user_id: string;
  full_name: string | null;
};

type SentRow = {
  id: string;
  actor_name: string | null;
  summary: string | null;
  created_at: string;
};

function whenText(iso: string): string {
  return new Date(iso).toLocaleString("ar-EG", {
    timeZone: "Africa/Cairo",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function NotifyPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const me = await requirePagePermission("admin.notify");
  const { sent, error } = await searchParams;

  const db = createAdminClient();

  const [{ data: usersData }, { data: subsData }, { data: logData }] =
    await Promise.all([
      db
        .from("app_users")
        .select("auth_user_id, full_name")
        .eq("tenant_id", me.tenantId)
        .eq("active", true)
        .order("full_name")
        .overrideTypes<AppUserRow[]>(),
      // **الأجهزة مش الحسابات** — الإشعار بيروح للموبايل، والحساب اللي
      // مافتحش التطبيق من موبايله مش هيوصله حاجة مهما كان مختار
      db
        .from("push_subscriptions")
        .select("auth_user_id")
        .eq("tenant_id", me.tenantId),
      db
        .from("activity_log")
        .select("id, actor_name, summary, created_at")
        .eq("action", "notify.send")
        .order("created_at", { ascending: false })
        .limit(20)
        .overrideTypes<SentRow[]>(),
    ]);

  const deviceCount = new Map<string, number>();
  for (const s of (subsData ?? []) as { auth_user_id: string | null }[]) {
    if (!s.auth_user_id) continue;
    deviceCount.set(s.auth_user_id, (deviceCount.get(s.auth_user_id) ?? 0) + 1);
  }

  const team: NotifyMember[] = (usersData ?? []).map((u) => ({
    authUserId: u.auth_user_id,
    name: u.full_name ?? "بدون اسم",
    devices: deviceCount.get(u.auth_user_id) ?? 0,
  }));

  const history = logData ?? [];
  const noDevices = team.filter((m) => m.devices === 0).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">ابعت إشعار</h1>
        <span className="text-sm text-gray-500">
          {team.length - noDevices} من {team.length} مفعّلين الإشعارات
        </span>
      </div>

      {sent && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {sent}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {noDevices === team.length && team.length > 0 && (
        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">محدش مفعّل الإشعارات لسه.</p>
          <p className="mt-1 text-xs">
            كل واحد لازم يفتح السيستم من موبايله ويفعّلها من هناك. وعلى
            الآيفون لازم يفتحه من الأيقونة اللي على الشاشة الرئيسية مش من
            سفاري — آبل مابتسمحش بغير كده.
          </p>
        </div>
      )}

      <SendAnnouncement
        team={team}
        senderName={me.fullName ?? me.email ?? "الإدارة"}
        action={sendAnnouncement}
      />

      {/* اللي اتبعت قبل كده — سطر مقفول زي سجل النشاط */}
      <details className="group rounded-xl bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-90 rtl:-rotate-180 rtl:group-open:-rotate-90"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
            اللي اتبعت قبل كده ({history.length})
          </h2>
          <span className="text-xs font-medium text-gray-400">اضغط للعرض</span>
        </summary>
        <div className="border-t border-gray-200">
          {history.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-500">
              لسه مابعتّش أي إشعار من هنا.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="flex items-start justify-between gap-4 px-5 py-2.5 text-sm"
                >
                  <span className="min-w-0 text-gray-900">
                    <span className="font-medium">
                      {h.actor_name ?? "غير معروف"}
                    </span>{" "}
                    <span className="text-gray-600">{h.summary}</span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">
                    {whenText(h.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}
