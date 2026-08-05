// ==========================================================================
// كتالوج الصلاحيات — **ملف صافي بقصد**
// --------------------------------------------------------------------------
// `permissions.ts` بيسحب معاه كود سيرفر (التوجيه وجلسة سوبابيز)، فأي ملف
// صافي عايز يعرف الصلاحيات كان بيتعطّل. الكتالوج اتفصل هنا عشان ينفع
// يتحمّل من أي مكان — كود سيرفر أو اختبار أو سكريبت.
// ==========================================================================

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
  | "suppliers.view"
  | "suppliers.edit"
  | "finance.dashboard"
  | "expenses.view"
  | "expenses.edit"
  | "cash.view"
  | "cash.edit"
  | "finance.export"
  | "tasks.view"
  | "tasks.edit"
  | "tasks.assign"
  | "tasks.delete"
  | "admin.users"
  | "admin.settings"
  | "admin.notify";

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
    group: "الموردين",
    items: [
      {
        key: "suppliers.view",
        label: "عرض الموردين وحساباتهم",
        hint: "اللي عليك لكل مورد",
      },
      {
        key: "suppliers.edit",
        label: "تسجيل فواتير ودفعات الموردين",
        hint: "بيأثر على الخزنة",
      },
    ],
  },
  {
    group: "التاسكات",
    items: [
      {
        key: "tasks.view",
        label: "عرض التاسكات",
        hint: "من غيرها الموظف مايشوفش الشاشة خالص",
      },
      {
        key: "tasks.edit",
        label: "إضافة وتعديل التاسكات",
        hint: "والخطوات والتعليقات",
      },
      {
        key: "tasks.assign",
        label: "إسناد التاسك لموظف",
        hint: "من غيرها بيقدر يشتغل على اللي عليه بس",
      },
      { key: "tasks.delete", label: "حذف التاسكات" },
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
      {
        key: "admin.settings",
        label: "إعدادات البيزنس",
        hint: "الشحن والباقة ورسوم بوسطة ومفاتيح الربط",
      },
      {
        key: "admin.notify",
        label: "إرسال إشعارات للتيم",
        hint: "بتوصل على موبايلاتهم — لناس محددة أو للكل",
      },
    ],
  },
];

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSIONS.flatMap((g) =>
  g.items.map((i) => i.key)
);
