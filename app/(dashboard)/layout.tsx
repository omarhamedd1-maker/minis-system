import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
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

  return (
    <div className="min-h-screen">
      {/* هيدر التليفون — اللوجو + ترحيب باسم المستخدم */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 md:hidden">
        <span className="text-lg font-bold tracking-wide text-gray-900">
          MINIS
        </span>
        <span className="truncate text-sm text-gray-500">
          {greeting(user.fullName ?? user.email)}
        </span>
      </header>

      <div className="flex">
        <AppNav isAdmin={user.isAdmin} permissions={user.permissions} />
        <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-6 pb-28 md:pb-8">
          {/* ترحيب على الكمبيوتر (على التليفون بيظهر في الهيدر فوق) */}
          <div className="mb-4 hidden text-sm text-gray-500 md:block">
            {greeting(user.fullName ?? user.email)}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
