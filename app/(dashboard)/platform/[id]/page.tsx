import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/permissions";
import { formatDate, formatMoney } from "@/lib/format";
import { displayEmail } from "@/lib/tenant-email";
import { BackLink } from "@/components/BackLink";
import { CopyLink } from "@/components/CopyLink";

export const dynamic = "force-dynamic";

/**
 * بيانات بيزنس واحد — لصاحب المنصة بس.
 *
 * **دي الشاشة الوحيدة اللي بتقرا بيزنس تاني بقصد**، وعشان كده الحماية
 * فيها `isPlatformAdmin` مش صلاحية بيزنس: عميل عنده كل الصلاحيات مايوصلهاش.
 *
 * **ومفيش مفاتيح ربط بتتعرض هنا** — لا بوسطة ولا شوبيفاي. معرفة إن المتجر
 * رابط ولا لأ كفاية للإدارة، والمفتاح نفسه مالوش أي لازمة على شاشة.
 */
export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const me = await getSessionUser();
  if (!me || !me.active) redirect("/login");
  if (!me.isPlatformAdmin) redirect("/");

  const db = createAdminClient();

  const { data: tenant } = await db
    .from("tenants")
    .select("id, name, slug, active, subscription_ends_at, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!tenant) notFound();
  const t = tenant as {
    id: string;
    name: string;
    slug: string | null;
    active: boolean;
    subscription_ends_at: string | null;
    created_at: string;
  };

  // كل الأرقام بفلتر البيزنس — الصفحة دي بتقرا بمفتاح الأدمن
  const counts = await Promise.all(
    (
      [
        ["orders", "أوردرات"],
        ["customers", "عملاء"],
        ["products", "منتجات"],
        ["suppliers", "موردين"],
        ["expenses", "مصاريف"],
        ["tasks", "تاسكات"],
      ] as const
    ).map(async ([table, label]) => {
      const { count } = await db
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", t.id);
      return { label, count: count ?? 0 };
    })
  );

  const [{ data: users }, { data: creds }, { data: recent }, { data: cash }] =
    await Promise.all([
      db
        .from("app_users")
        .select("auth_user_id, full_name, active, last_seen_at, roles(name)")
        .eq("tenant_id", t.id)
        .order("full_name"),
      db
        .from("tenant_credentials")
        .select("bosta_api_key, shopify_domain, shopify_token")
        .eq("tenant_id", t.id)
        .maybeSingle(),
      db
        .from("orders")
        .select("id, order_number, order_status, order_date")
        .eq("tenant_id", t.id)
        .order("order_date", { ascending: false })
        .limit(8),
      db
        .from("cash_transactions")
        .select("direction, amount")
        .eq("tenant_id", t.id)
        .limit(5000),
    ]);

  const authList = await db.auth.admin.listUsers({ perPage: 200 });
  const emailById = new Map(
    (authList.data?.users ?? []).map((u) => [u.id, u.email ?? null])
  );

  const balance = ((cash ?? []) as { direction: string; amount: number }[]).reduce(
    (s, c) => s + (c.direction === "in" ? 1 : -1) * Number(c.amount ?? 0),
    0
  );

  const c = creds as {
    bosta_api_key: string | null;
    shopify_domain: string | null;
    shopify_token: string | null;
  } | null;

  const base = process.env.NEXT_PUBLIC_SITE_URL
    ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "")
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "";

  const today = new Date().toISOString().slice(0, 10);
  const expired = t.subscription_ends_at && t.subscription_ends_at < today;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-ink">{t.name}</h1>
          <p className="mt-0.5 text-xs text-ink-faint">
            من {formatDate(t.created_at)}
            {t.id === me.tenantId && " · بيزنسك"}
          </p>
        </div>
        <BackLink href="/platform" label="الرجوع للبيزنسات" variant="exit" />
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span
          className={`rounded-full px-2.5 py-1 font-medium ${
            t.active ? "bg-success-soft text-success" : "bg-sunken text-ink-muted"
          }`}
        >
          {t.active ? "شغال" : "موقوف"}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 ${
            expired ? "bg-danger-soft text-danger" : "bg-sunken text-ink-muted"
          }`}
        >
          الاشتراك: {t.subscription_ends_at ?? "مفتوح"}
        </span>
      </div>

      {t.slug && (
        <div className="card p-4">
          <h2 className="text-sm font-bold text-ink">لينك الدخول</h2>
          <CopyLink url={`${base}/login/${t.slug}`} href={`/login/${t.slug}`} />
        </div>
      )}

      {/* ===== الأرقام ===== */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {counts.map((x) => (
          <div key={x.label} className="card p-3">
            <div className="text-lg font-bold text-ink">{x.count}</div>
            <div className="text-[11px] text-ink-muted">{x.label}</div>
          </div>
        ))}
        <div className="card p-3">
          <div className="text-lg font-bold text-ink">
            {formatMoney(balance)}
          </div>
          <div className="text-[11px] text-ink-muted">رصيد الخزنة</div>
        </div>
      </div>

      {/* ===== الربط — الحالة بس من غير أي مفتاح ===== */}
      <div className="card p-4">
        <h2 className="mb-2 text-sm font-bold text-ink">الربط</h2>
        <dl className="space-y-1.5 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">بوسطة</dt>
            <dd className={c?.bosta_api_key ? "text-success" : "text-ink-faint"}>
              {c?.bosta_api_key ? "مربوط" : "مش مربوط"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">شوبيفاي</dt>
            <dd className={c?.shopify_token ? "text-success" : "text-ink-faint"}>
              {c?.shopify_token
                ? `مربوط · ${c.shopify_domain ?? ""}`
                : "مش مربوط"}
            </dd>
          </div>
        </dl>
        {/* المفاتيح نفسها مابتتعرضش — معرفة «مربوط ولا لأ» كفاية للإدارة */}
      </div>

      {/* ===== المستخدمون ===== */}
      <div className="card overflow-hidden">
        <h2 className="px-4 py-3 text-sm font-bold text-ink">
          المستخدمون ({(users ?? []).length})
        </h2>
        {(users ?? []).length === 0 ? (
          <p className="px-4 pb-4 text-xs text-ink-faint">مفيش مستخدمين</p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {(
              (users ?? []) as unknown as {
                auth_user_id: string;
                full_name: string | null;
                active: boolean | null;
                last_seen_at: string | null;
                roles: { name: string | null } | null;
              }[]
            ).map((u) => {
              const raw = emailById.get(u.auth_user_id) ?? null;
              return (
                <li
                  key={u.auth_user_id}
                  className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 text-xs"
                >
                  <span className="font-medium text-ink">
                    {u.full_name ?? "بدون اسم"}
                    {u.roles?.name && (
                      <span className="ms-2 font-normal text-ink-faint">
                        {u.roles.name}
                      </span>
                    )}
                  </span>
                  <span dir="ltr" className="text-ink-muted">
                    {raw ? displayEmail(raw, t.slug ?? "") : "—"}
                  </span>
                  {!u.active && <span className="text-danger">موقوف</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ===== آخر أوردرات ===== */}
      <div className="card overflow-hidden">
        <h2 className="px-4 py-3 text-sm font-bold text-ink">آخر أوردرات</h2>
        {(recent ?? []).length === 0 ? (
          <p className="px-4 pb-4 text-xs text-ink-faint">مفيش أوردرات</p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {(
              (recent ?? []) as {
                id: string;
                order_number: string | null;
                order_status: string | null;
                order_date: string | null;
              }[]
            ).map((o) => (
              <li
                key={o.id}
                className="flex items-baseline justify-between gap-3 px-4 py-2 text-xs"
              >
                <span className="text-ink">أوردر {o.order_number ?? "—"}</span>
                <span className="text-ink-muted">{o.order_status}</span>
                <span className="text-ink-faint">
                  {o.order_date ? formatDate(o.order_date) : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
