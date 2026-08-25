import { BackLink } from "@/components/BackLink";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePagePermission } from "@/lib/permissions";
import { formatMoney } from "@/lib/format";
import { CopyLink } from "@/components/CopyLink";
import { headers } from "next/headers";
import { createOrderLink, toggleOrderLink } from "./actions";

export const dynamic = "force-dynamic";

/**
 * لينكات الطلب.
 *
 * ⚠️ **اللينك سلة مش منتج** — تختار المنتجات اللي عايز تعرضها، وتطلع بلينك
 * واحد تبعته في رسالة أو ستوري.
 *
 * ⚠️ **واللينك بيتقفل مش بيتمسح** — اللي اتبعت في رسالة قديمة بيفضل يفتح
 * ويقول «العرض ده خلص» بدل صفحة مكسورة.
 */
export default async function OrderLinksPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; new?: string }>;
}) {
  const { error, new: created } = await searchParams;
  const me = await requirePagePermission("products.edit");
  const db = createAdminClient();

  const origin = (await headers()).get("origin") ?? "";

  const [{ data: variants }, { data: links }] = await Promise.all([
    db
      .from("product_variants")
      .select("id, variant_name, sale_price, products(name, name_ar)")
      .eq("tenant_id", me.tenantId)
      .gt("sale_price", 0)
      .limit(500),
    db
      .from("order_links")
      .select("id, title, active, orders_count, created_at, order_link_items(variant_id)")
      .eq("tenant_id", me.tenantId)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);

  type V = {
    id: string;
    variant_name: string | null;
    sale_price: number;
    products: { name: string | null; name_ar: string | null } | null;
  };

  const options = ((variants ?? []) as unknown as V[])
    .map((v) => {
      // ⚠️ **إنت بتشوف الاسمين، والعميل بيشوف اسم شوبيفاي بس.**
      // الاسم العربي بتاعك هو اللي بتعرف بيه المنتج، واسم شوبيفاي هو اللي
      // العميل شافه وهو بيشتري — فاللي بتختار منه محتاج الاتنين.
      const arabic = String(v.products?.name_ar ?? "").trim();
      const shopify = String(v.products?.name ?? "").trim();
      const extra = String(v.variant_name ?? "").trim();
      const skip = extra.toLowerCase() === "default title";
      const base = arabic || shopify || "منتج";
      return {
        id: v.id,
        label: extra && !skip ? `${base} — ${extra}` : base,
        second: arabic && shopify && arabic !== shopify ? shopify : null,
        price: Number(v.sale_price ?? 0),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "ar"));

  const rows = (links ?? []) as unknown as {
    id: string;
    title: string | null;
    active: boolean;
    orders_count: number;
    created_at: string;
    order_link_items: { variant_id: string }[] | null;
  }[];

  // ⚠️ **اللينك بيختفي من القايمة بعد يوم — بس بيفضل شغّال.**
  //
  // اللينكات بتتبعت في رسايل وبتفضل موجودة عند الناس، فمسحها معناه صفحة
  // مكسورة عند حد. اللي بيحصل إنها بتنزل تحت «أقدم»، واللي لسه شغّال
  // وجابلك أوردرات بيفضل فوق مهما طال — ده مش لينك قديم، ده حملة شغّالة.
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = new Date().getTime();
  const isRecent = (l: { created_at: string; active: boolean; orders_count: number }) =>
    now - new Date(l.created_at).getTime() < DAY_MS ||
    (l.active && l.orders_count > 0);

  const recent = rows.filter(isRecent);
  const older = rows.filter((l) => !isRecent(l));

  return (
    <div className="space-y-4">
      <BackLink href="/products" label="المنتجات" />
      <h1 className="text-2xl font-bold text-gray-900">لينكات الطلب</h1>
      <p className="text-sm text-gray-500">
        اختار المنتجات، خد اللينك، وابعته في رسالة أو ستوري. العميل يملا عنوانه
        بنفسه والأوردر ييجي عندك في «محتاج تأكيد».
      </p>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {created && (
        <div className="rounded-xl bg-emerald-50 p-4">
          <p className="text-sm font-bold text-emerald-900">اللينك جاهز</p>
          <CopyLink url={`${origin}/o/${created}`} href={`/o/${created}`} />
        </div>
      )}

      {/* ===== لينك جديد ===== */}
      <form action={createOrderLink} className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
        <input
          name="title"
          placeholder="اسم اللينك — «عرض الستوري» (اختياري)"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />

        <div className="mt-3 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-gray-100 p-2">
          {options.length === 0 ? (
            <p className="p-4 text-center text-sm text-gray-400">
              مفيش منتجات بسعر لسه.
            </p>
          ) : (
            options.map((o) => (
              <label
                key={o.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  name="variant"
                  value={o.id}
                  className="h-4 w-4 shrink-0 rounded border-gray-300"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-gray-900">{o.label}</span>
                  {o.second && (
                    <span className="block truncate text-[11px] text-gray-400" dir="ltr">
                      {o.second}
                    </span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums text-xs text-gray-400">
                  {formatMoney(o.price)}
                </span>
              </label>
            ))
          )}
        </div>

        <button
          type="submit"
          className="mt-3 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-dark"
        >
          اعمل اللينك
        </button>
      </form>

      {/* ===== اللينكات الموجودة ===== */}
      {recent.length > 0 && (
        <div className="divide-y divide-gray-100 rounded-xl bg-white shadow-sm">
          {recent.map((l) => (
            <LinkRow key={l.id} link={l} origin={origin} />
          ))}
        </div>
      )}

      {older.length > 0 && (
        <details className="rounded-xl bg-white shadow-sm">
          <summary className="cursor-pointer px-4 py-3 text-sm text-gray-500">
            لينكات أقدم ({older.length})
          </summary>
          <div className="divide-y divide-gray-100 border-t border-gray-100">
            {older.map((l) => (
              <LinkRow key={l.id} link={l} origin={origin} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}


/**
 * سطر لينك واحد — مضغوط.
 *
 * ⚠️ **الاسم والأرقام في سطر، واللينك تحته** — الشكل القديم كان كارت لكل
 * لينك، وعشرة لينكات كانوا بيملوا الشاشة.
 */
function LinkRow({
  link,
  origin,
}: {
  link: {
    id: string;
    title: string | null;
    active: boolean;
    orders_count: number;
    order_link_items: { variant_id: string }[] | null;
  };
  origin: string;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-gray-900">
          {link.title || "من غير اسم"}
          {!link.active && (
            <span className="mr-2 text-[11px] font-normal text-gray-400">مقفول</span>
          )}
        </span>
        <span className="text-[11px] text-gray-400">
          {(link.order_link_items ?? []).length} منتج
          {link.orders_count > 0 && ` · ${link.orders_count} أوردر`}
        </span>
      </div>

      <CopyLink url={`${origin}/o/${link.id}`} href={`/o/${link.id}`} />

      <form action={toggleOrderLink}>
        <input type="hidden" name="link_id" value={link.id} />
        <input type="hidden" name="active" value={link.active ? "0" : "1"} />
        <button
          type="submit"
          className="mt-1 text-[11px] text-gray-400 underline hover:text-gray-600"
        >
          {link.active ? "اقفله" : "افتحه"}
        </button>
      </form>
    </div>
  );
}