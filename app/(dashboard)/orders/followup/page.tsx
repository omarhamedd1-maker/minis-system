import { BackLink } from "@/components/BackLink";
import { createClient } from "@/lib/supabase/server";
import { requirePagePermission, can } from "@/lib/permissions";
import { followupQueue, ASK_AFTER_DAYS, ASK_BEFORE_DAYS } from "@/lib/followup";
import { FollowupList } from "@/components/FollowupList";
import { trackingLink } from "@/lib/tracking-view";
import { ratingLink } from "@/lib/rating";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { markFollowedUp } from "./actions";
import { saveMessageTemplate } from "../template-actions";
import { kindInfo, templateFor } from "@/lib/message-kinds";
import { loadStoredTemplates } from "@/lib/message-templates-db";
import TemplateEditor from "@/components/TemplateEditor";

export const dynamic = "force-dynamic";

/**
 * اسأل بعد التسليم.
 *
 * ⚠️⚠️ **مافيش إرسال تلقائي.** الصفحة بتقول مين يتكلّم والنص الجاهز، والزرار
 * بيفتح واتساب على المحادثة والرسالة مكتوبة. الرسالة اللي بتروح لوحدها لعميل
 * مالهوش دعوة أوحش من إنها ماتروحش.
 */
export default async function FollowupPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error: saveError } = await searchParams;
  const user = await requirePagePermission("orders.view");
  const canMark = can(user, "orders.status");
  const supabase = await createClient();

  // ⚠️ **القالب واسم المتجر بمفتاح الأدمن** — الجدولين دول مقفولين في
  // الـRLS، والفشل هنا معناه القالب الافتراضي مش شاشة واقعة.
  const admin = createAdminClient();
  const [storeName, stored] = await Promise.all([
    (async () => {
      const { data } = await admin
        .from("tenants")
        .select("name")
        .eq("id", user.tenantId)
        .maybeSingle();
      return (data as { name: string | null } | null)?.name ?? null;
    })(),
    loadStoredTemplates(admin, user.tenantId),
  ]);
  const template = templateFor("followup", stored);

  type Row = {
    id: string;
    order_number: string | null;
    order_status: string | null;
    delivered_at: string | null;
    followed_up_at: string | null;
    bosta_tracking: string | null;
    customers: { full_name: string | null; phone: string | null } | null;
    order_items: {
      product_variants: {
        products: { name_ar: string | null; name: string | null } | null;
      } | null;
    }[];
  };

  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, order_number, order_status, delivered_at, followed_up_at, bosta_tracking,
       customers(full_name, phone),
       order_items(product_variants(products(name_ar, name)))`
    )
    .eq("order_status", "delivered")
    .is("followed_up_at", null)
    .order("delivered_at", { ascending: true })
    .limit(500)
    .overrideTypes<Row[]>();

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        {/* الخانة لسه مااتعملتش؟ ده بيبان هنا بدل ما الصفحة تقع */}
        معرفناش نقرا الأوردرات: {error.message}
      </div>
    );
  }

  // العنوان من الطلب عشان اللينك يبقى بدومين الموقع اللي فاتح دلوقتي
  const origin = (await headers()).get("origin") ?? null;

  const queue = followupQueue(
    (data ?? []).map((o) => ({
      id: o.id,
      orderNumber: o.order_number,
      orderStatus: o.order_status,
      deliveredAt: o.delivered_at,
      followedUpAt: o.followed_up_at,
      customerName: o.customers?.full_name ?? null,
      customerPhone: o.customers?.phone ?? null,
      products: [
        ...new Set(
          (o.order_items ?? []).map(
            (i) =>
              i.product_variants?.products?.name_ar ||
              i.product_variants?.products?.name ||
              ""
          )
        ),
      ].filter(Boolean),
      trackLink: trackingLink(o.id, origin),
      rateLink: ratingLink(o.id, origin),
    })),
    new Date(),
    storeName,
    template
  );

  return (
    <div className="space-y-4">
      <BackLink href="/orders" label="الأوردرات" />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">اسأل بعد التسليم</h1>
        <span className="text-xs text-gray-500">{queue.length} عميل</span>
      </div>

      <p className="text-sm text-gray-500">
        العميل اللي عنده مشكلة بيسكت وبعدين يعمل مرتجع. السؤال بعد{" "}
        {ASK_AFTER_DAYS} أيام بيخلّي المشكلة توصلك قبل ما تتحوّل لشحنة عكسية.
        بعد {ASK_BEFORE_DAYS} أيام بيخرج من القايمة — السؤال ساعتها اتأخّر.
      </p>

      {saveError && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {saveError}
        </p>
      )}
      {saved && (
        <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          الرسالة اتحفظت
        </p>
      )}

      {/*
        الرسالة نفسها.

        ⚠️ **مكانها هنا مش في الإعدادات** — بتتقري وبتتعدّل في نفس الشاشة
        اللي بتتبعت منها، والخانات عربي عشان اللي بيكتب مايحتاجش يبدّل
        لوحة المفاتيح في نص الجملة.
      */}
      {canMark && (
        <TemplateEditor
          info={kindInfo("followup")!}
          value={template}
          back="/orders/followup"
          action={saveMessageTemplate}
        />
      )}

      {queue.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          مفيش حد مستني سؤال دلوقتي.
        </p>
      ) : (
        <FollowupList
          items={queue}
          canMark={canMark}
          markAction={markFollowedUp}
        />
      )}
    </div>
  );
}
