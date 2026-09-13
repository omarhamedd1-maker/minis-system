import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { BackLink } from "@/components/BackLink";
import { requirePagePermission } from "@/lib/permissions";

type ActivityRow = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  summary: string | null;
  created_at: string;
};

const CATEGORIES: { value: string; label: string }[] = [
  { value: "user", label: "المستخدمون" },
  { value: "order", label: "الأوردرات" },
  { value: "bosta", label: "الشحن (بوسطة)" },
  { value: "product", label: "المنتجات" },
  { value: "expense", label: "المصاريف" },
  { value: "cash", label: "الخزنة" },
  { value: "customer", label: "العملاء" },
];

function whenText(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ar-EG", {
    timeZone: "Africa/Cairo",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ actor?: string; type?: string; limit?: string }>;
}) {
  const me = await requirePagePermission("admin.users");
  const { actor, type, limit: rawLimit } = await searchParams;
  const limit = Math.min(Math.max(Number(rawLimit) || 100, 100), 2000);
  const typeValid = CATEGORIES.some((c) => c.value === type) ? type : undefined;

  const admin = createAdminClient();

  // ⚠️ **`tenant_id` إجباري مع مفتاح الأدمن** — بيعدّي فوق قواعد المنع،
  // فالفلتر هنا هو الحماية الوحيدة
  const { data: appUsers } = await admin
    .from("app_users")
    .select("auth_user_id, full_name")
    .eq("tenant_id", me.tenantId)
    .overrideTypes<{ auth_user_id: string; full_name: string | null }[]>();

  let query = admin
    .from("activity_log")
    .select("id, actor_id, actor_name, action, summary, created_at")
    .eq("tenant_id", me.tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (actor) query = query.eq("actor_id", actor);
  if (typeValid) query = query.like("action", `${typeValid}.%`);

  const { data: rows } = await query.overrideTypes<ActivityRow[]>();
  const activity = rows ?? [];

  // لبناء اللينكات مع الحفاظ على الفلاتر
  const params = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (actor) p.set("actor", actor);
    if (typeValid) p.set("type", typeValid);
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined) p.delete(k);
      else p.set(k, v);
    }
    const s = p.toString();
    return s ? `/users/activity?${s}` : "/users/activity";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">سجل النشاط</h1>
        <BackLink href="/users" label="الرجوع للمستخدمين" />
      </div>

      {/* فلاتر */}
      <form
        action="/users/activity"
        className="card flex flex-wrap items-end gap-3 p-4"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink-muted">المستخدم</label>
          <select
            name="actor"
            defaultValue={actor ?? ""}
            className="field w-auto"
          >
            <option value="">الكل</option>
            {(appUsers ?? []).map((u) => (
              <option key={u.auth_user_id} value={u.auth_user_id}>
                {u.full_name ?? "بدون اسم"}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink-muted">نوع العملية</label>
          <select
            name="type"
            defaultValue={typeValid ?? ""}
            className="field w-auto"
          >
            <option value="">الكل</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="btn btn-primary"
        >
          فلترة
        </button>
        {(actor || typeValid) && (
          <Link
            href="/users/activity"
            className="rounded-control bg-sunken px-4 py-1.5 text-sm font-medium text-ink-body hover:bg-line"
          >
            مسح الفلتر
          </Link>
        )}
        <span className="ms-auto text-sm text-ink-muted">{activity.length} عملية</span>
      </form>

      <div className="card overflow-hidden">
        {activity.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-muted">
            مفيش نشاط بالفلاتر دي.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {activity.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm"
              >
                <span className="text-ink">
                  <span className="font-medium">{a.actor_name ?? "غير معروف"}</span>{" "}
                  <span className="text-ink-muted">{a.summary ?? a.action}</span>
                </span>
                <span className="shrink-0 text-xs text-ink-faint">
                  {whenText(a.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {activity.length >= limit && (
        <div className="flex justify-center">
          <Link
            href={params({ limit: String(limit + 100) })}
            className="btn btn-secondary px-6"
          >
            عرض المزيد
          </Link>
        </div>
      )}
    </div>
  );
}
