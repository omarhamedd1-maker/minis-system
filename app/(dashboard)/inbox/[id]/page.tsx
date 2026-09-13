import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { can, requirePagePermission } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { SubmitOnce } from "@/components/SubmitOnce";
import { formatMoney } from "@/lib/format";
import { replyWindow, channelLabel, isChannel } from "@/lib/inbox/channel";
import { threadTitle, sinceText } from "@/lib/inbox/threads";
import { missingCredentials } from "@/lib/inbox/send";
import { loadTenantCredentials } from "@/lib/tenant-settings";
import { replyToThread, markRead, linkCustomer, archiveThread } from "../actions";

export const dynamic = "force-dynamic";

/**
 * محادثة واحدة.
 *
 * ⚠️⚠️ **أوردرات العميل جنب كلامه.** ده كان السبب الأصلي للصندوق: اللي
 * بيرد كان بيقرا «الأوردر وصل إمتى؟» وبعدين يفتح تاب تاني ويدوّر على
 * الأوردر بالاسم أو الرقم. دلوقتي الاتنين في شاشة واحدة.
 */
export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error: actionError, saved } = await searchParams;
  const user = await requirePagePermission("inbox.view");
  const canReply = can(user, "inbox.reply");
  const db = createAdminClient();
  const now = new Date();

  const { data } = await db
    .from("conversations")
    .select(
      `id, channel, external_id, display_name, customer_id, last_message_at,
       last_inbound_at, unread, archived, customers(full_name, phone)`
    )
    // ⚠️ **الفلتر على البيزنس لازم** — بمفتاح الأدمن، من غيره أي معرّف
    // بيفتح محادثة بيزنس تاني
    .eq("tenant_id", user.tenantId)
    .eq("id", id)
    .maybeSingle();

  const thread = data as {
    id: string;
    channel: string;
    external_id: string;
    display_name: string | null;
    customer_id: string | null;
    last_inbound_at: string | null;
    unread: number;
    archived: boolean;
    customers: { full_name: string | null; phone: string | null } | null;
  } | null;

  if (!thread) notFound();

  const channel = isChannel(thread.channel) ? thread.channel : "whatsapp";
  const win = replyWindow(thread.last_inbound_at, now);

  const [{ data: msgRows }, creds, orders] = await Promise.all([
    db
      .from("conversation_messages")
      .select("id, direction, body, attachment_type, sent_by_name, status, error, created_at")
      .eq("tenant_id", user.tenantId)
      .eq("conversation_id", id)
      .order("created_at", { ascending: true })
      .limit(200),
    loadTenantCredentials(db, user.tenantId),
    thread.customer_id
      ? db
          .from("orders")
          .select("id, order_number, order_status, order_date, bosta_cod")
          .eq("tenant_id", user.tenantId)
          .eq("customer_id", thread.customer_id)
          .order("order_date", { ascending: false })
          .limit(5)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);

  const messages = (msgRows ?? []) as {
    id: string;
    direction: string;
    body: string | null;
    attachment_type: string | null;
    sent_by_name: string | null;
    status: string | null;
    error: string | null;
    created_at: string;
  }[];

  const notConnected = missingCredentials({
    channel,
    externalId: thread.external_id,
    whatsappPhoneId: creds.whatsappPhoneId,
    whatsappToken: creds.whatsappToken,
    pageToken: creds.metaPageToken,
  });

  const title = threadTitle({
    id: thread.id,
    channel,
    displayName: thread.display_name,
    externalId: thread.external_id,
    customerId: thread.customer_id,
    customerName: thread.customers?.full_name ?? null,
    lastMessageAt: null,
    lastInboundAt: thread.last_inbound_at,
    lastBody: null,
    unread: thread.unread,
    archived: thread.archived,
  });

  return (
    <div className="space-y-4">
      <BackLink href="/inbox" label="صندوق الرسايل" />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        <span className="text-xs text-ink-muted">
          {channelLabel(channel)} · {thread.external_id}
        </span>
      </div>

      {actionError && (
        <p className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
          {actionError}
        </p>
      )}
      {saved && (
        <p className="rounded-control bg-success-soft px-4 py-3 text-sm text-success">
          اتحفظ
        </p>
      )}

      {/* العميل وأوردراته — نفس الشاشة، عشان محدش يدوّر في تاب تاني */}
      <div className="card p-4 sm:p-5">
        {thread.customer_id ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/customers/${thread.customer_id}`}
                className="font-medium text-ink hover:underline"
              >
                {thread.customers?.full_name ?? "العميل"}
              </Link>
              {canReply && (
                <form action={linkCustomer}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="customerId" value="" />
                  <SubmitOnce className="text-xs text-ink-faint hover:text-ink-muted">
                    فُك الربط
                  </SubmitOnce>
                </form>
              )}
            </div>
            {orders.length === 0 ? (
              <p className="text-xs text-ink-muted">مالوش أوردرات لسه.</p>
            ) : (
              <ul className="space-y-1">
                {orders.map((o) => {
                  const row = o as {
                    id: string;
                    order_number: string | null;
                    order_status: string | null;
                    bosta_cod: number | null;
                  };
                  return (
                    <li key={row.id}>
                      <Link
                        href={`/orders/${row.id}`}
                        className="flex justify-between gap-3 rounded-control px-2 py-1 text-xs hover:bg-sunken"
                      >
                        <span className="text-ink">#{row.order_number}</span>
                        <span className="text-ink-muted">
                          {row.order_status} ·{" "}
                          {formatMoney(Number(row.bosta_cod ?? 0))}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <form action={linkCustomer} className="space-y-2">
            <input type="hidden" name="id" value={id} />
            <p className="text-sm text-ink-muted">
              المحادثة دي مش مربوطة بعميل، فأوردراته مش ظاهرة هنا.
              {channel !== "whatsapp" &&
                " إنستجرام وماسنجر مابيدّوش تليفون، فالربط بإيدك."}
            </p>
            {canReply && (
              <div className="flex flex-wrap gap-2">
                <input
                  name="customerId"
                  placeholder="رقم العميل في السيستم"
                  className="field flex-1"
                  dir="ltr"
                />
                <SubmitOnce className="rounded-control bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-dark">
                  اربط
                </SubmitOnce>
              </div>
            )}
          </form>
        )}
      </div>

      {/* الكلام */}
      <div className="space-y-2">
        {messages.length === 0 ? (
          <p className="card empty">
            مافيش كلام في المحادثة دي.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.direction === "out";
            return (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-card p-3 text-sm shadow-card ${
                  mine ? "ms-auto bg-primary/10" : "bg-surface"
                }`}
              >
                <p className="whitespace-pre-wrap text-ink" dir="auto">
                  {m.body ??
                    (m.attachment_type ? `[${m.attachment_type}]` : "—")}
                </p>
                <p className="mt-1 flex flex-wrap gap-2 text-[11px] text-ink-faint">
                  <span>{sinceText(m.created_at, now)}</span>
                  {mine && m.sent_by_name && <span>· {m.sent_by_name}</span>}
                  {m.status === "failed" && (
                    <span className="text-danger">· مابعتتش{m.error ? `: ${m.error}` : ""}</span>
                  )}
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* الرد */}
      {canReply && !thread.archived && (
        <div className="card p-4 sm:p-5">
          {notConnected ? (
            <p className="text-sm text-warning">{notConnected}</p>
          ) : !win.open ? (
            <p className="text-sm text-ink-muted">{win.note}</p>
          ) : (
            <form action={replyToThread} className="space-y-2">
              <input type="hidden" name="id" value={id} />
              {win.note && (
                <p className="text-xs text-warning">{win.note}</p>
              )}
              <textarea
                name="body"
                rows={3}
                placeholder="اكتب ردك"
                className="field"
              />
              <SubmitOnce className="rounded-control bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-dark">
                ابعت
              </SubmitOnce>
            </form>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {thread.unread > 0 && (
          <form action={markRead}>
            <input type="hidden" name="id" value={id} />
            <SubmitOnce className="btn btn-secondary btn-sm px-4">
              علّمها مقروءة
            </SubmitOnce>
          </form>
        )}
        {canReply && !thread.archived && (
          <form action={archiveThread}>
            <input type="hidden" name="id" value={id} />
            <SubmitOnce className="btn btn-secondary btn-sm px-4">
              اقفل المحادثة
            </SubmitOnce>
          </form>
        )}
      </div>
    </div>
  );
}
