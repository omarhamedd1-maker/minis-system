import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// الكتالوج في ملف صافي عشان الكود اللي مش سيرفر يقدر يقراه
export * from "./permission-keys";
import { ALL_PERMISSION_KEYS, type PermissionKey } from "./permission-keys";


// ===== القوالب الجاهزة (Presets) =====
export type Preset = { key: string; label: string; permissions: PermissionKey[] };

export const PRESETS: Preset[] = [
  {
    key: "full",
    label: "أدمن كامل",
    permissions: [...ALL_PERMISSION_KEYS],
  },
  {
    key: "ops",
    label: "مدير عمليات",
    permissions: [
      "orders.view",
      "orders.status",
      "orders.items",
      "orders.create",
      "orders.delete",
      "orders.archive",
      "orders.comments",
      "ship.send",
      "ship.print",
      "ship.link",
      "customers.view",
      "customers.edit",
      "products.view",
      "products.cost",
      "products.stock",
      "products.edit",
      "suppliers.view",
      "suppliers.edit",
      "tasks.view",
      "tasks.edit",
      "tasks.assign",
    ],
  },
  {
    key: "packer",
    label: "موظف تغليف/شحن",
    permissions: [
      "orders.view",
      "orders.status",
      "orders.comments",
      "ship.send",
      "ship.print",
      "ship.link",
      "tasks.view",
      "tasks.edit",
    ],
  },
  {
    key: "accountant",
    label: "محاسب",
    permissions: [
      "orders.view",
      "finance.dashboard",
      "expenses.view",
      "expenses.edit",
      "cash.view",
      "cash.edit",
      "finance.export",
      "suppliers.view",
      "suppliers.edit",
    ],
  },
  {
    key: "partner",
    label: "شريك (متفرّج)",
    permissions: [
      "orders.view",
      "customers.view",
      "products.view",
      "finance.dashboard",
      "expenses.view",
      "cash.view",
      "suppliers.view",
    ],
  },
];

// ===== المستخدم الحالي =====
export type SessionUser = {
  authUserId: string;
  email: string | null;
  fullName: string | null;
  isAdmin: boolean;
  permissions: PermissionKey[];
  active: boolean;
  /** البيزنس اللي المستخدم ده تبعه — كل حاجة بتتفلتر بيه */
  tenantId: string;
  /**
   * صاحب المنصة: يعمل بيزنسات جديدة ويدير اشتراكاتها.
   * ده مش صلاحية بيزنس — أدمن أي عميل مايقدرش يوصلها مهما كانت صلاحياته.
   */
  isPlatformAdmin: boolean;
};

/** بيزنس مينيز — بيتستخدم كقيمة احتياطية لو الخانة فاضية لأي سبب */
const FALLBACK_TENANT = "00000000-0000-0000-0000-000000000001";

// بيقرأ المستخدم الحالي مرة واحدة: بياناته من app_users + هل هو أدمن.
// بيرجّع null لو مفيش جلسة.
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: isAdmin }, { data: appUser }] = await Promise.all([
    supabase.rpc("is_admin"),
    supabase
      .from("app_users")
      .select("full_name, permissions, active, last_seen_at, tenant_id, is_platform_admin")
      .eq("auth_user_id", user.id)
      .maybeSingle()
      .overrideTypes<{
        full_name: string | null;
        permissions: string[] | null;
        active: boolean | null;
        last_seen_at: string | null;
        tenant_id: string | null;
        is_platform_admin: boolean | null;
      }>(),
  ]);

  // "آخر مرة فتح السيستم" — بنحدّثها كل دقيقة بالكتير عشان مانبطّأش السيستم.
  // لازم تتكتب بمفتاح الأدمن: المستخدم العادي مالوش صلاحية UPDATE على app_users
  // في الـRLS، فالكتابة بمفتاحه كانت بتفشل في صمت والخانة تفضل فاضية
  // (وعشان كده الصفحة كانت بتقع على آخر تسجيل دخول).
  const seen = appUser?.last_seen_at ? new Date(appUser.last_seen_at).getTime() : 0;
  if (Date.now() - seen > 60 * 1000) {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      void createAdminClient()
        .from("app_users")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("auth_user_id", user.id)
        .then(() => {});
    } catch {
      // لو مفتاح الأدمن ناقص مانوقفش تحميل الصفحة
    }
  }

  return {
    authUserId: user.id,
    email: user.email ?? null,
    fullName: appUser?.full_name ?? null,
    isAdmin: Boolean(isAdmin),
    permissions: (appUser?.permissions ?? []) as PermissionKey[],
    active: appUser?.active ?? true,
    tenantId: appUser?.tenant_id ?? FALLBACK_TENANT,
    isPlatformAdmin: Boolean(appUser?.is_platform_admin),
  };
}

// هل المستخدم عنده صلاحية معينة؟ (الأدمن عنده كل حاجة)
export function can(
  user: SessionUser | null,
  permission: PermissionKey
): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  return user.permissions.includes(permission);
}

// حارس للصفحات: بيرجّع المستخدم لو عنده الصلاحية، وإلا بيوجّهه لصفحة مسموح بيها.
// بيُستخدم في أول أي صفحة server component.
export async function requirePagePermission(
  permission: PermissionKey
): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.active) redirect("/login?error=" + encodeURIComponent("حسابك موقوف"));
  if (!can(user, permission)) redirect(landingPathFor(user));
  return user;
}

// حارس للـ server actions: بيرمي خطأ لو مفيش صلاحية (بيوقف التعديل).
export async function requirePermission(
  permission: PermissionKey
): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.active || !can(user, permission)) {
    throw new Error("مالكش صلاحية تعمل الحاجة دي");
  }
  return user;
}

// أول صفحة مسموح للمستخدم يشوفها (للتوجيه لما يفتح صفحة ممنوعة).
export function landingPathFor(user: SessionUser | null): string {
  if (!user) return "/login";
  const order: { perm: PermissionKey; path: string }[] = [
    { perm: "orders.view", path: "/orders" },
    { perm: "finance.dashboard", path: "/" },
    { perm: "customers.view", path: "/customers" },
    { perm: "products.view", path: "/products" },
    { perm: "suppliers.view", path: "/suppliers" },
    { perm: "expenses.view", path: "/expenses" },
    { perm: "cash.view", path: "/cash" },
    { perm: "admin.users", path: "/users" },
  ];
  for (const o of order) {
    if (can(user, o.perm)) return o.path;
  }
  return "/no-access";
}
