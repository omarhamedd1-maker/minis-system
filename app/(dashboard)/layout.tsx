import { redirect } from "next/navigation";
import { logout } from "@/app/login/actions";
import { NavLinks } from "@/components/NavLinks";
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
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex flex-wrap items-center gap-6">
            <span className="text-lg font-bold tracking-wide text-gray-900">
              MINIS
            </span>
            <NavLinks isAdmin={user.isAdmin} permissions={user.permissions} />
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              تسجيل الخروج
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
