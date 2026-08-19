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
      const base = v.products?.name_ar || v.products?.name || "منتج";
      const extra = String(v.variant_name ?? "").trim();
      const skip = extra.toLowerCase() === "default title";
      return {
        id: v.id,
        label: extra && !skip ? `${base} — ${extra}` : base,
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
                <span className="min-w-0 flex-1 truncate text-gray-900">
                  {o.label}
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
          className="mt-3 rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          اعمل اللينك
        </button>
      </form>

      {/* ===== اللينكات الموجودة ===== */}
      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((l) => (
            <div key={l.id} className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-gray-900">
                  {l.title || "لينك من غير اسم"}
                </span>
                <span className="text-xs text-gray-500">
                  {(l.order_link_items ?? []).length} منتج ·{" "}
                  {l.orders_count} أوردر
                </span>
              </div>

              <CopyLink url={`${origin}/o/${l.id}`} href={`/o/${l.id}`} />

              <form action={toggleOrderLink} className="mt-2">
                <input type="hidden" name="link_id" value={l.id} />
                <input type="hidden" name="active" value={l.active ? "0" : "1"} />
                <button
                  type="submit"
                  className="text-xs text-gray-400 underline hover:text-gray-600"
                >
                  {l.active ? "اقفل اللينك" : "افتحه تاني"}
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
