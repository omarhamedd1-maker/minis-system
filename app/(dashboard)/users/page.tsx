import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PERMISSIONS,
  PRESETS,
  requirePagePermission,
} from "@/lib/permissions";
import { UserEditor, type EditorUser } from "@/components/UserEditor";
import { displayEmail } from "@/lib/tenant-email";
import {
  createUser,
  deleteUser,
  lockUserNow,
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
  last_seen_at: string | null;
  roles: { name: string | null } | null;
};

type ActivityRow = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  summary: string | null;
  created_at: string;
};

// وقت بصيغة بسيطة بتوقيت مصر
function whenText(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ar-EG", {
    timeZone: "Africa/Cairo",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const me = await requirePagePermission("admin.users");
  const { saved, error } = await searchParams;

  const admin = createAdminClient();

  const [{ data: appUsers }, authList, { data: activityData }, { data: tenant }] =
    await Promise.all([
      // ⚠️ **`tenant_id` إجباري مع مفتاح الأدمن.** المفتاح ده بيعدّي فوق
      // قواعد المنع في قاعدة البيانات، فالفلتر هنا هو الحماية الوحيدة —
      // من غيره الصفحة كانت بتعرض مستخدمين كل البيزنسات لبعض.
      admin
        .from("app_users")
        .select("auth_user_id, full_name, permissions, active, last_seen_at, roles(name)")
        .eq("tenant_id", me.tenantId)
        .overrideTypes<AppUserRow[]>(),
      admin.auth.admin.listUsers({ perPage: 200 }),
      admin
        .from("activity_log")
        .select("id, actor_id, actor_name, action, summary, created_at")
        .eq("tenant_id", me.tenantId)
        .order("created_at", { ascending: false })
        .limit(80)
        .overrideTypes<ActivityRow[]>(),
      admin.from("tenants").select("slug").eq("id", me.tenantId).maybeSingle(),
    ]);

  // **الإيميل مخزّن مبوّب باسم المتجر** (`omar+minis@…`) عشان نفس الإيميل
  // ينفع في متجرين — بس اللي بيتعرض هو اللي المستخدم يعرفه
  const slug = (tenant as { slug: string | null } | null)?.slug ?? "";

  const emailById = new Map<string, string | null>();
  const lastSignInById = new Map<string, string | null>();
  const createdById = new Map<string, string | null>();
  for (const u of authList.data?.users ?? []) {
    emailById.set(u.id, u.email ? displayEmail(u.email, slug) : null);
    lastSignInById.set(u.id, u.last_sign_in_at ?? null);
    createdById.set(u.id, u.created_at ?? null);
  }

  const activity = activityData ?? [];

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
        lastSignInAt: u.last_seen_at ?? lastSignInById.get(u.auth_user_id) ?? null,
        createdAt: createdById.get(u.auth_user_id) ?? null,
        recentActivity: activity
          .filter((a) => a.actor_id === u.auth_user_id)
          .slice(0, 6)
          .map((a) => ({ summary: a.summary ?? a.action, when: whenText(a.created_at) })),
      };
    })
    // الأدمن الأول، بعدين بالاسم
    .sort((a, b) => {
      if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
      return (a.fullName ?? "").localeCompare(b.fullName ?? "", "ar");
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">المستخدمون</h1>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span>{users.filter((u) => u.active).length} نشط</span>
          {users.some((u) => !u.active) && (
            <span className="text-red-600">
              {users.filter((u) => !u.active).length} موقوف
            </span>
          )}
        </div>
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

          {/* اختار قالب جاهز — وتقدر تفصّل الصلاحيات بعد الإنشاء */}
          <div>
            <div className="mb-2 text-xs font-medium text-gray-500">
              نوع المستخدم (بيحدّد صلاحياته — تقدر تعدّلها بعد الإنشاء):
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PRESETS.map((p, i) => (
                <label
                  key={p.key}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 p-3 hover:bg-gray-50 has-checked:border-gray-900 has-checked:bg-gray-50"
                >
                  <input
                    type="radio"
                    name="preset"
                    value={p.key}
                    defaultChecked={i === PRESETS.length - 1}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-900">
                      {p.label}
                    </span>
                    <span className="block text-[11px] text-gray-500">
                      {p.permissions.length} صلاحية
                    </span>
                  </span>
                </label>
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
            lockAction={lockUserNow}
            deleteAction={deleteUser}
          />
        ))}
      </div>

      {/* سجل النشاط العام — مقفول، بيفتح لما تدوس عليه */}
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
            سجل النشاط ({activity.length})
          </h2>
          <span className="text-xs font-medium text-gray-400">
            {activity.length > 0 ? "اضغط للعرض" : ""}
          </span>
        </summary>
        <div className="border-t border-gray-200">
          <div className="px-5 py-2">
            <Link
              href="/users/activity"
              className="text-xs font-medium text-gray-500 hover:text-gray-900"
            >
              السجل كامل مع الفلترة ←
            </Link>
          </div>
        {activity.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-500">
            لسه مفيش نشاط مسجّل. أول ما حد يعمل حاجة مهمة (تغيير حالة، حذف، إرسال
            لبوسطة، إدارة مستخدمين) هتظهر هنا.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {activity.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm"
              >
                <span className="text-gray-900">
                  <span className="font-medium">{a.actor_name ?? "غير معروف"}</span>{" "}
                  <span className="text-gray-600">{a.summary ?? a.action}</span>
                </span>
                <span className="shrink-0 text-xs text-gray-400">
                  {whenText(a.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
        </div>
      </details>

      <p className="text-xs text-gray-400">
        ملاحظة: الأدمن عنده كل الصلاحيات تلقائياً. المستخدمون الجدد بيتعملوا كأعضاء
        (يقدروا يقرأوا حسب صلاحياتهم) ومش أدمن. سجل النشاط بيتسجّل تلقائياً
        للحاجات المهمة.
      </p>
    </div>
  );
}
