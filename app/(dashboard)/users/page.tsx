import { createAdminClient } from "@/lib/supabase/admin";
import {
  PERMISSIONS,
  PRESETS,
  requirePagePermission,
} from "@/lib/permissions";
import { UserEditor, type EditorUser } from "@/components/UserEditor";
import {
  createUser,
  deleteUser,
  setUserEmail,
  setUserPassword,
  updateUserPermissions,
  updateUserProfile,
} from "./actions";

type AppUserRow = {
  auth_user_id: string;
  full_name: string | null;
  permissions: string[] | null;
  active: boolean | null;
  roles: { name: string | null } | null;
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const me = await requirePagePermission("admin.users");
  const { saved, error } = await searchParams;

  const admin = createAdminClient();

  const [{ data: appUsers }, authList] = await Promise.all([
    admin
      .from("app_users")
      .select("auth_user_id, full_name, permissions, active, roles(name)")
      .overrideTypes<AppUserRow[]>(),
    admin.auth.admin.listUsers({ perPage: 200 }),
  ]);

  const emailById = new Map<string, string | null>();
  for (const u of authList.data?.users ?? []) {
    emailById.set(u.id, u.email ?? null);
  }

  const users: EditorUser[] = (appUsers ?? [])
    .map((u) => {
      const isAdmin = (u.roles?.name ?? "").toLowerCase() === "admin";
      return {
        authUserId: u.auth_user_id,
        email: emailById.get(u.auth_user_id) ?? null,
        fullName: u.full_name,
        roleName: u.roles?.name ?? null,
        isAdmin,
        active: u.active ?? true,
        permissions: u.permissions ?? [],
      };
    })
    // الأدمن الأول، بعدين بالاسم
    .sort((a, b) => {
      if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
      return (a.fullName ?? "").localeCompare(b.fullName ?? "", "ar");
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">المستخدمون والصلاحيات</h1>
        <span className="text-sm text-gray-500">{users.length} مستخدم</span>
      </div>

      {saved && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {saved}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* إنشاء يوزر جديد */}
      <details className="rounded-xl bg-white p-5 shadow-sm">
        <summary className="cursor-pointer text-sm font-bold text-gray-900">
          + إضافة مستخدم جديد
        </summary>
        <form action={createUser} className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">الاسم</label>
              <input
                name="full_name"
                required
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">الإيميل</label>
              <input
                name="email"
                type="email"
                required
                dir="ltr"
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">
                الباسورد (6 حروف على الأقل)
              </label>
              <input
                name="password"
                type="text"
                required
                dir="ltr"
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-medium text-gray-500">
              الصلاحيات (تقدر تعدّلها بعد الإنشاء كمان):
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PERMISSIONS.map((g) => (
                <div key={g.group} className="rounded-lg border border-gray-200 p-3">
                  <div className="mb-2 text-sm font-bold text-gray-900">
                    {g.group}
                  </div>
                  <div className="space-y-1.5">
                    {g.items.map((item) => (
                      <label
                        key={item.key}
                        className="flex items-start gap-2 text-sm text-gray-700"
                      >
                        <input
                          type="checkbox"
                          name="permissions"
                          value={item.key}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300"
                        />
                        <span>
                          {item.label}
                          {item.hint && (
                            <span className="block text-xs text-gray-400">
                              {item.hint}
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            إنشاء المستخدم
          </button>
        </form>
      </details>

      {/* قايمة المستخدمين */}
      <div className="space-y-3">
        {users.map((u) => (
          <UserEditor
            key={u.authUserId}
            user={u}
            groups={PERMISSIONS}
            presets={PRESETS}
            isSelf={u.authUserId === me.authUserId}
            updateProfileAction={updateUserProfile}
            updatePermissionsAction={updateUserPermissions}
            setEmailAction={setUserEmail}
            setPasswordAction={setUserPassword}
            deleteAction={deleteUser}
          />
        ))}
      </div>

      <p className="text-xs text-gray-400">
        ملاحظة: الأدمن عنده كل الصلاحيات تلقائياً. المستخدمون الجدد بيتعملوا كأعضاء
        (يقدروا يقرأوا حسب صلاحياتهم) ومش أدمن.
      </p>
    </div>
  );
}
