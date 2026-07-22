import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// ===== كتالوج الصلاحيات =====
// كل صلاحية مفتاح ثابت (key) + وصف عربي (label). الأدمن عنده كل الصلاحيات تلقائياً.

export type PermissionKey =
  | "orders.view"
  | "orders.status"
  | "orders.items"
  | "orders.create"
  | "orders.delete"
  | "orders.archive"
  | "orders.comments"
  | "ship.send"
  | "ship.print"
  | "ship.link"
  | "customers.view"
  | "customers.edit"
  | "products.view"
  | "products.cost"
  | "products.stock"
  | "products.edit"
  | "finance.dashboard"
  | "expenses.view"
  | "expenses.edit"
  | "cash.view"
  | "cash.edit"
  | "finance.export"
  | "admin.users";

export type PermissionGroup = {
  group: string;
  items: { key: PermissionKey; label: string; hint?: string }[];
};

export const PERMISSIONS: PermissionGroup[] = [
  {
    group: "الأوردرات",
    items: [
      { key: "orders.view", label: "عرض الأوردرات" },
      { key: "orders.status", label: "تغيير حالة الأوردر" },
      {
        key: "orders.items",
        label: "تعديل بنود الأوردر",
        hint: "كمية/سعر/إضافة/مسح + الخصم + الشحن",
      },
      { key: "orders.create", label: "إضافة أوردر يدوي" },
      { key: "orders.delete", label: "حذف أوردر" },
      { key: "orders.archive", label: "أرشفة الأوردرات" },
      { key: "orders.comments", label: "التعليقات على الأوردرات" },
    ],
  },
  {
    group: "الشحن (بوسطة)",
    items: [
      { key: "ship.send", label: "إرسال الأوردر لبوسطة كشحنة" },
      { key: "ship.print", label: "طباعة البوالص (AWB)" },
      { key: "ship.link", label: "ربط شحنة بوسطة يدوي" },
    ],
  },
  {
    group: "العملاء",
    items: [
      { key: "customers.view", label: "عرض العملاء" },
      { key: "customers.edit", label: "تعديل بيانات العملاء" },
    ],
  },
  {
    group: "المنتجات والمخزون",
    items: [
      { key: "products.view", label: "عرض المنتجات" },
      { key: "products.cost", label: "تعديل التكلفة" },
      { key: "products.stock", label: "تعديل المخزون/الكميات" },
      { key: "products.edit", label: "تعديل بيانات المنتج والأشكال" },
    ],
  },
  {
    group: "الفلوس (حسّاسة)",
    items: [
      { key: "finance.dashboard", label: "عرض الداشبورد والأرباح" },
      { key: "expenses.view", label: "عرض المصاريف" },
      { key: "expenses.edit", label: "تعديل المصاريف" },
      { key: "cash.view", label: "عرض الخزنة" },
      { key: "cash.edit", label: "تعديل الخزنة" },
      { key: "finance.export", label: "تصدير البيانات (CSV)" },
    ],
  },
  {
    group: "الإدارة",
    items: [
      {
        key: "admin.users",
        label: "إدارة المستخدمين والصلاحيات",
        hint: "الصفحة دي نفسها",
      },
    ],
  },
];

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSIONS.flatMap((g) =>
  g.items.map((i) => i.key)
);

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
};

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
      .select("full_name, permissions, active")
      .eq("auth_user_id", user.id)
      .maybeSingle()
      .overrideTypes<{
        full_name: string | null;
        permissions: string[] | null;
        active: boolean | null;
      }>(),
  ]);

  return {
    authUserId: user.id,
    email: user.email ?? null,
    fullName: appUser?.full_name ?? null,
    isAdmin: Boolean(isAdmin),
    permissions: (appUser?.permissions ?? []) as PermissionKey[],
    active: appUser?.active ?? true,
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
    { perm: "expenses.view", path: "/expenses" },
    { perm: "cash.view", path: "/cash" },
    { perm: "admin.users", path: "/users" },
  ];
  for (const o of order) {
    if (can(user, o.perm)) return o.path;
  }
  return "/no-access";
}
