"use client";

import { useState } from "react";

type Item = { key: string; label: string; hint?: string };
type Group = { group: string; items: Item[] };
type Preset = { key: string; label: string; permissions: string[] };

export type EditorUser = {
  authUserId: string;
  email: string | null;
  fullName: string | null;
  roleName: string | null;
  isAdmin: boolean;
  active: boolean;
  permissions: string[];
  lastSignInAt: string | null;
  createdAt: string | null;
  recentActivity: { summary: string; when: string }[];
};

function whenText(iso: string | null): string {
  if (!iso) return "لسه مادخلش";
  return new Date(iso).toLocaleString("ar-EG", {
    timeZone: "Africa/Cairo",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function UserEditor({
  user,
  groups,
  presets,
  isSelf,
  updateProfileAction,
  updatePermissionsAction,
  setEmailAction,
  setPasswordAction,
  lockAction,
  deleteAction,
}: {
  user: EditorUser;
  groups: Group[];
  presets: Preset[];
  isSelf: boolean;
  updateProfileAction: (fd: FormData) => Promise<void>;
  updatePermissionsAction: (fd: FormData) => Promise<void>;
  setEmailAction: (fd: FormData) => Promise<void>;
  setPasswordAction: (fd: FormData) => Promise<void>;
  lockAction: (fd: FormData) => Promise<void>;
  deleteAction: (fd: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(user.permissions)
  );

  const allKeys = groups.flatMap((g) => g.items.map((i) => i.key));
  const permCount = user.isAdmin ? allKeys.length : user.permissions.length;

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function applyPreset(keys: string[]) {
    setSelected(new Set(keys));
  }

  return (
    <div className="rounded-xl bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-right"
      >
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <span className="font-medium text-gray-900">
            {user.fullName ?? "بدون اسم"}
          </span>
          <span className="text-sm text-gray-500" dir="ltr">
            {user.email ?? "—"}
          </span>
          {user.isAdmin && (
            <span className="rounded-full bg-gray-900 px-2.5 py-0.5 text-xs font-medium text-white">
              أدمن
            </span>
          )}
          {isSelf && (
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
              إنت
            </span>
          )}
          {!user.active && (
            <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
              موقوف
            </span>
          )}
          <span className="text-xs text-gray-400">
            · آخر دخول: {whenText(user.lastSignInAt)}
          </span>
        </div>
        <span className="text-xs text-gray-400">
          {user.isAdmin ? "كل الصلاحيات" : `${permCount} صلاحية`} {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="space-y-6 border-t border-gray-100 px-5 py-5">
          {/* معلومات وسجل نشاط المستخدم */}
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-gray-600">
              <span>
                آخر دخول:{" "}
                <span className="text-gray-900">{whenText(user.lastSignInAt)}</span>
              </span>
              <span>
                اتعمل الحساب:{" "}
                <span className="text-gray-900">{whenText(user.createdAt)}</span>
              </span>
            </div>
            {user.recentActivity.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-medium text-gray-500">
                  آخر نشاط ليه:
                </div>
                <ul className="space-y-1">
                  {user.recentActivity.map((a, i) => (
                    <li key={i} className="flex justify-between gap-3 text-gray-700">
                      <span>{a.summary}</span>
                      <span className="shrink-0 text-xs text-gray-400">{a.when}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {user.isAdmin ? (
            <p className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
              ده حساب أدمن — عنده كل الصلاحيات تلقائياً ومينفعش يتعدل من هنا.
            </p>
          ) : (
            <>
              {/* الاسم والتفعيل */}
              <form action={updateProfileAction} className="space-y-3">
                <input type="hidden" name="auth_user_id" value={user.authUserId} />
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">الاسم</label>
                    <input
                      name="full_name"
                      defaultValue={user.fullName ?? ""}
                      required
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                    />
                  </div>
                  <label className="flex items-center gap-2 pb-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      name="active"
                      value="1"
                      defaultChecked={user.active}
                      disabled={isSelf}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    الحساب مُفعّل
                  </label>
                  <button
                    type="submit"
                    className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
                  >
                    حفظ البيانات
                  </button>
                </div>
              </form>

              {/* الصلاحيات */}
              <form action={updatePermissionsAction} className="space-y-4">
                <input type="hidden" name="auth_user_id" value={user.authUserId} />
                <div>
                  <div className="mb-2 text-xs font-medium text-gray-500">
                    قوالب جاهزة (بتملأ الاختيارات — تقدر تعدّل بعدها):
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {presets.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => applyPreset(p.permissions)}
                        className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                      >
                        {p.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => applyPreset([])}
                      className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                    >
                      تفريغ الكل
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {groups.map((g) => (
                    <div
                      key={g.group}
                      className="rounded-lg border border-gray-200 p-3"
                    >
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
                              checked={selected.has(item.key)}
                              onChange={() => toggle(item.key)}
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

                <button
                  type="submit"
                  className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
                >
                  حفظ الصلاحيات
                </button>
              </form>
            </>
          )}

          {/* الإيميل والباسورد */}
          <div className="grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
            <form action={setEmailAction} className="flex flex-col gap-1">
              <input type="hidden" name="auth_user_id" value={user.authUserId} />
              <label className="text-xs text-gray-500">تغيير الإيميل</label>
              <div className="flex items-center gap-2">
                <input
                  name="email"
                  type="email"
                  defaultValue={user.email ?? ""}
                  dir="ltr"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  حفظ
                </button>
              </div>
            </form>

            <form action={setPasswordAction} className="flex flex-col gap-1">
              <input type="hidden" name="auth_user_id" value={user.authUserId} />
              <label className="text-xs text-gray-500">
                تغيير الباسورد (6 حروف على الأقل)
              </label>
              <div className="flex items-center gap-2">
                <input
                  name="password"
                  type="text"
                  placeholder="الباسورد الجديد"
                  dir="ltr"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  حفظ
                </button>
              </div>
            </form>
          </div>

          {/* قفل فوري */}
          {!isSelf && !user.isAdmin && user.active && (
            <form
              action={lockAction}
              className="border-t border-gray-100 pt-4"
              onSubmit={(e) => {
                if (
                  !confirm(
                    `تقفل حساب ${user.fullName ?? user.email} فوراً؟ هيتسجّل خروجه من كل الأجهزة ومش هيقدر يدخل تاني لحد ما تفعّله.`
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="auth_user_id" value={user.authUserId} />
              <button
                type="submit"
                className="rounded-lg bg-orange-50 px-4 py-1.5 text-sm font-medium text-orange-700 hover:bg-orange-100"
              >
                اقفل الحساب فوراً (خروج من كل الأجهزة)
              </button>
              <p className="mt-1 text-xs text-gray-400">
                بيوقف الحساب فوراً فيتقفل من أي جهاز خلال ثواني. تقدر تفعّله تاني من
                خانة &quot;الحساب مُفعّل&quot; فوق.
              </p>
            </form>
          )}

          {/* حذف */}
          {!isSelf && !user.isAdmin && (
            <form
              action={deleteAction}
              className="border-t border-gray-100 pt-4"
              onSubmit={(e) => {
                if (
                  !confirm(
                    `متأكد إنك عايز تمسح ${user.fullName ?? user.email} نهائياً؟`
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="auth_user_id" value={user.authUserId} />
              <button
                type="submit"
                className="rounded-lg bg-red-50 px-4 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                مسح اليوزر نهائياً
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
