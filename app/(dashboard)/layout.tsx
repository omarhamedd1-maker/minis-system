import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { getSessionUser } from "@/lib/permissions";

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
      {/* هيدر التليفون — اللوجو فقط (القائمة تحت) */}
      <header className="sticky top-0 z-30 flex h-14 items-center border-b border-gray-200 bg-white px-4 md:hidden">
        <span className="text-lg font-bold tracking-wide text-gray-900">
          MINIS
        </span>
      </header>

      <div className="flex">
        <AppNav isAdmin={user.isAdmin} permissions={user.permissions} />
        <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-6 pb-28 md:pb-8">
          {children}
        </main>
      </div>
    </div>
  );
}
