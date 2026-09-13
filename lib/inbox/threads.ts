// ==========================================================================
// ترتيب المحادثات وعرضها — **ملف صافي**
// --------------------------------------------------------------------------
// اللي بيرد مش بيدوّر في قايمة، هو بيدوّر على **اللي مستني**. فالترتيب هنا
// مش بالأحدث زي ما هو متوقع: المستني رد بييجي فوق، وجوّه الفئة الواحدة
// الأقدم بييجي الأول — لأنه هو اللي مستني من زمان.
// ==========================================================================

import { replyWindow, type Channel } from "./channel";

export type Thread = {
  id: string;
  channel: Channel;
  displayName: string | null;
  externalId: string;
  customerId: string | null;
  customerName: string | null;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  lastBody: string | null;
  unread: number;
  archived: boolean;
};

export type ThreadView = Thread & {
  /** مستني رد مننا */
  waiting: boolean;
  /** نافذة الرد لسه مفتوحة */
  canReply: boolean;
  /** الاسم اللي بيتعرض — اسم العميل لو مربوط، وإلا اللي جه من ميتا */
  title: string;
};

export function threadTitle(t: Thread): string {
  return (
    t.customerName?.trim() ||
    t.displayName?.trim() ||
    // إنستجرام مابيديش اسم ولا رقم — المعرّف أحسن من «بدون اسم»
    (t.channel === "whatsapp" ? t.externalId : "حساب " + t.externalId.slice(-6))
  );
}

export function viewThread(t: Thread, now: Date): ThreadView {
  const w = replyWindow(t.lastInboundAt, now);
  return {
    ...t,
    waiting: t.unread > 0,
    canReply: w.open,
    title: threadTitle(t),
  };
}

/**
 * ترتيب القايمة.
 *
 * ⚠️⚠️ **المستني فوق، والأقدم جوّه المستني فوق.** الترتيب بالأحدث بيخلّي
 * العميل اللي بعت من ساعتين ولسه مارديناش عليه **يغرق تحت** كل اللي بعتوا
 * بعده — وده بالظبط العميل اللي بتخسره.
 *
 * ⚠️ **والنافذة اللي قربت تقفل بتتقدّم** جوّه المستنيين: اللي فاضله ساعة
 * لو فات، الرد عليه بقى بفلوس أو مابيعديش خالص.
 */
export function sortThreads(threads: ThreadView[]): ThreadView[] {
  return [...threads].sort((a, b) => {
    if (a.waiting !== b.waiting) return a.waiting ? -1 : 1;
    if (a.waiting && b.waiting) {
      // الأقدم الأول — هو المستني من زمان
      return time(a.lastInboundAt) - time(b.lastInboundAt);
    }
    // اللي مش مستني: الأحدث الأول، عشان سياق الكلام يفضل قريب
    return time(b.lastMessageAt) - time(a.lastMessageAt);
  });
}

function time(v: string | null): number {
  const t = v ? new Date(v).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

/** «من ٣ دقايق» · «من ساعتين» · «إمبارح» */
export function sinceText(at: string | null | undefined, now: Date): string {
  const t = at ? new Date(at).getTime() : NaN;
  if (!Number.isFinite(t)) return "—";

  const mins = Math.max(0, Math.round((now.getTime() - t) / 60_000));
  if (mins < 1) return "دلوقتي";
  if (mins === 1) return "من دقيقة";
  if (mins === 2) return "من دقيقتين";
  if (mins < 60) return `من ${mins} دقيقة`;

  const hours = Math.round(mins / 60);
  if (hours === 1) return "من ساعة";
  if (hours === 2) return "من ساعتين";
  if (hours < 24) return `من ${hours} ساعات`;

  const days = Math.round(hours / 24);
  if (days === 1) return "إمبارح";
  if (days === 2) return "من يومين";
  return `من ${days} يوم`;
}

/** عدد اللي مستنيين رد — الرقم اللي بيبان جنب اسم الصفحة */
export function waitingCount(threads: ThreadView[]): number {
  return threads.filter((t) => t.waiting && !t.archived).length;
}
