import Link from "next/link";
import { requirePagePermission } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sortThreads,
  viewThread,
  sinceText,
  waitingCount,
  type Thread,
} from "@/lib/inbox/threads";
import { channelLabel, CHANNELS, isChannel } from "@/lib/inbox/channel";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  channel: string;
  external_id: string;
  display_name: string | null;
  customer_id: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  unread: number;
  archived: boolean;
  customers: { full_name: string | null } | null;
};

/**
 * صندوق الرسايل الموحّد.
 *
 * ⚠️⚠️ **الترتيب مش بالأحدث** — المستني رد فوق، والأقدم جوّه المستنيين
 * فوق. الترتيب بالأحدث بيغرّق العميل اللي بعت من ساعتين ولسه مارديناش
 * عليه تحت كل اللي بعتوا بعده، وده بالظبط العميل اللي بيضيع.
 *
 * ⚠️ **بمفتاح الأدمن** — الجداول دي بيكتب فيها الويب هوك اللي مالوش جلسة،
 * فالفلتر على البيزنس مسؤولية الكود هنا.
 */
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; archived?: string; error?: string }>;
}) {
  const { channel, archived, error: pageError } = await searchParams;
  const user = await requirePagePermission("inbox.view");
  const db = createAdminClient();
  const now = new Date();

  const showArchived = archived === "1";
  let query = db
    .from("conversations")
    .select(
      `id, channel, external_id, display_name, customer_id, last_message_at,
       last_inbound_at, unread, archived, customers(full_name)`
    )
    .eq("tenant_id", user.tenantId)
    .eq("archived", showArchived)
    .order("last_message_at", { ascending: false })
    .limit(300);

  if (channel && isChannel(channel)) query = query.eq("channel", channel);

  const { data, error } = await query.overrideTypes<Row[]>();

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">صندوق الرسايل</h1>
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          الصندوق لسه مااتعملش في الداتابيز — شغّل{" "}
          <code className="rounded bg-amber-100 px-1">sql/inbox.sql</code> وهو
          هيشتغل. ({error.message})
        </p>
      </div>
    );
  }

  const threads = sortThreads(
    (data ?? []).map((r) =>
      viewThread(
        {
          id: r.id,
          channel: isChannel(r.channel) ? r.channel : "whatsapp",
          externalId: r.external_id,
          displayName: r.display_name,
          customerId: r.customer_id,
          customerName: r.customers?.full_name ?? null,
          lastMessageAt: r.last_message_at,
          lastInboundAt: r.last_inbound_at,
          lastBody: null,
          unread: Number(r.unread ?? 0),
          archived: Boolean(r.archived),
        } satisfies Thread,
        now
      )
    )
  );

  const waiting = waitingCount(threads);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">صندوق الرسايل</h1>
        {waiting > 0 && (
          <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
            {waiting} مستني رد
          </span>
        )}
      </div>

      {pageError && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {pageError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Filter href="/inbox" label="الكل" on={!channel && !showArchived} />
        {CHANNELS.map((c) => (
          <Filter
            key={c.key}
            href={`/inbox?channel=${c.key}`}
            label={c.label}
            on={channel === c.key}
          />
        ))}
        <Filter
          href="/inbox?archived=1"
          label="المقفولة"
          on={showArchived}
        />
      </div>

      {threads.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-gray-500">
            {showArchived
              ? "مافيش محادثات مقفولة."
              : "مافيش رسايل لسه."}
          </p>
          {!showArchived && (
            <p className="mt-2 text-xs text-gray-400">
              أول ما حساب يتوصّل، كلام العملاء بيبدأ ينزل هنا لوحده.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {threads.map((t) => (
            <Link
              key={t.id}
              href={`/inbox/${t.id}`}
              className={`block rounded-xl p-4 shadow-sm transition sm:p-5 ${
                t.waiting ? "bg-red-50/60 hover:bg-red-50" : "bg-white hover:bg-gray-50"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-gray-900">{t.title}</span>
                <span className="text-xs text-gray-500">
                  {channelLabel(t.channel)} · {sinceText(t.lastMessageAt, now)}
                </span>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                {t.waiting && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700">
                    مستني رد
                  </span>
                )}
                {!t.canReply && !t.archived && (
                  // ⚠️ ده مش تحذير شكلي — بعد ٢٤ ساعة ميتا بترفض الرد
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                    الرد مقفول
                  </span>
                )}
                {!t.customerId && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                    مش مربوط بعميل
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Filter({
  href,
  label,
  on,
}: {
  href: string;
  label: string;
  on: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 ${
        on
          ? "bg-gray-900 text-white"
          : "bg-white text-gray-600 shadow-sm hover:bg-gray-50"
      }`}
    >
      {label}
    </Link>
  );
}
