import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { NotificationsBell } from "@/components/NotificationsBell";
import { PushPrompt } from "@/components/PushPrompt";
import { createAdminClient } from "@/lib/supabase/admin";
import { collectNotices } from "@/lib/notifications";
import { can, getSessionUser } from "@/lib/permissions";
import { sendAnnouncement } from "./notify/actions";
import type { NotifyMember } from "@/components/SendAnnouncement";

// ترحيب بالاسم الأول حسب وقت اليوم (بتوقيت مصر)
function greeting(name: string | null) {
  const first = (name ?? "").trim().split(/\s+/)[0] || "";
  const hour = Number(
    new Intl.DateTimeFormat("en", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Africa/Cairo",
    }).format(new Date())
  );
  const part =
    hour < 12 ? "صباح الخير" : hour < 17 ? "أهلاً" : "مساء الخير";
  return first ? `${part} يا ${first} 👋` : `${part} 👋`;
}

/**
 * التيم مع عدد موبايلات كل واحد.
 * **الأجهزة مش الحسابات** — الإشعار بيروح للموبايل، فاللي مافتحش السيستم
 * من موبايله مش هيوصله حاجة مهما كان مختار في القايمة.
 */
async function loadTeam(tenantId: string): Promise<NotifyMember[]> {
  const db = createAdminClient();
  const [{ data: users }, { data: subs }] = await Promise.all([
    db
      .from("app_users")
      .select("auth_user_id, full_name")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("full_name"),
    db.from("push_subscriptions").select("auth_user_id").eq("tenant_id", tenantId),
  ]);

  const devices = new Map<string, number>();
  for (const s of (subs ?? []) as { auth_user_id: string | null }[]) {
    if (!s.auth_user_id) continue;
    devices.set(s.auth_user_id, (devices.get(s.auth_user_id) ?? 0) + 1);
  }

  return ((users ?? []) as { auth_user_id: string; full_name: string | null }[]).map(
    (u) => ({
      authUserId: u.auth_user_id,
      name: u.full_name ?? "بدون اسم",
      devices: devices.get(u.auth_user_id) ?? 0,
    })
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  if (!user.active) {
    redirect("/login?error=" + encodeURIComponent("حسابك موقوف"));
  }

  // الحاجات الواقفة — بتتعرض كأيقونة صغيرة فوق مش بانر بياخد نص الشاشة.
  // فشلها مايوقفش الصفحة: أوردراتك أهم من إشعار.
  let notices: Awaited<ReturnType<typeof collectNotices>> = [];
  try {
    notices = await collectNotices(createAdminClient(), user.tenantId);
  } catch {
    notices = [];
  }

  // قايمة التيم بتتجاب بس لو معاك صلاحية الإرسال — مالهاش لازمة لغيرك،
  // وكل صفحة في السيستم بتعدّي من هنا
  const canNotify = can(user, "admin.notify");
  let team: NotifyMember[] = [];
  if (canNotify) {
    try {
      team = await loadTeam(user.tenantId);
    } catch {
      team = [];
    }
  }

  return (
    <div className="min-h-screen">
      {/* هيدر التليفون — اللوجو + الإشعارات + ترحيب باسم المستخدم */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 md:hidden">
        <span className="text-lg font-bold tracking-wide text-gray-900">
          Gridpoint
        </span>
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate text-sm text-gray-500">
            {greeting(user.fullName ?? user.email)}
          </span>
          <NotificationsBell
            notices={notices}
            canNotify={canNotify}
            team={team}
            senderName={user.fullName ?? user.email ?? "الإدارة"}
            sendAction={sendAnnouncement}
          />
        </div>
      </header>

      <div className="flex">
        <AppNav isAdmin={user.isAdmin} permissions={user.permissions} isPlatformAdmin={user.isPlatformAdmin} />
        <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-6 pb-28 md:pb-8">
          {/* ترحيب على الكمبيوتر (على التليفون بيظهر في الهيدر فوق) */}
          <div className="mb-4 hidden items-center justify-between gap-3 text-sm text-gray-500 md:flex">
            <span>{greeting(user.fullName ?? user.email)}</span>
            <NotificationsBell
            notices={notices}
            canNotify={canNotify}
            team={team}
            senderName={user.fullName ?? user.email ?? "الإدارة"}
            sendAction={sendAnnouncement}
          />
          </div>
          {/* طلب تشغيل الإشعارات — بيبان لوحده أول ما تفتح، ودوسة واحدة
              تخلص. مينفعش نطلب الإذن من غير دوسة، آبل بترفض. */}
          <PushPrompt />
          {children}
        </main>
      </div>
    </div>
  );
}
