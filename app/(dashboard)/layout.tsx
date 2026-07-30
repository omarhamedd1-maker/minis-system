import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { NotificationsBell } from "@/components/NotificationsBell";
import { PushPrompt } from "@/components/PushPrompt";
import { createAdminClient } from "@/lib/supabase/admin";
import { collectNotices } from "@/lib/notifications";
import { getSessionUser } from "@/lib/permissions";

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

  return (
    <div className="min-h-screen">
      {/* هيدر التليفون — اللوجو + الإشعارات + ترحيب باسم المستخدم */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 md:hidden">
        <span className="text-lg font-bold tracking-wide text-gray-900">
          MINIS
        </span>
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate text-sm text-gray-500">
            {greeting(user.fullName ?? user.email)}
          </span>
          <NotificationsBell notices={notices} />
        </div>
      </header>

      <div className="flex">
        <AppNav isAdmin={user.isAdmin} permissions={user.permissions} isPlatformAdmin={user.isPlatformAdmin} />
        <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-6 pb-28 md:pb-8">
          {/* ترحيب على الكمبيوتر (على التليفون بيظهر في الهيدر فوق) */}
          <div className="mb-4 hidden items-center justify-between gap-3 text-sm text-gray-500 md:flex">
            <span>{greeting(user.fullName ?? user.email)}</span>
            <NotificationsBell notices={notices} />
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
