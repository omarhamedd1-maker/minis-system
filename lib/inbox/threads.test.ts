import { describe, expect, it } from "vitest";
import {
  sortThreads,
  viewThread,
  threadTitle,
  sinceText,
  waitingCount,
  type Thread,
} from "./threads";

const NOW = new Date("2026-09-13T12:00:00Z");

const thread = (over: Partial<Thread> = {}): Thread => ({
  id: "t1",
  channel: "whatsapp",
  displayName: "أحمد",
  externalId: "201001234567",
  customerId: null,
  customerName: null,
  lastMessageAt: "2026-09-13T11:00:00Z",
  lastInboundAt: "2026-09-13T11:00:00Z",
  lastBody: "الأوردر وصل؟",
  unread: 0,
  archived: false,
  ...over,
});

describe("قايمة المحادثات", () => {
  it("⚠️⚠️ المستني رد فوق — مهما كان قديم", () => {
    const old = viewThread(
      thread({ id: "قديم", unread: 2, lastInboundAt: "2026-09-13T06:00:00Z", lastMessageAt: "2026-09-13T06:00:00Z" }),
      NOW
    );
    const fresh = viewThread(
      thread({ id: "جديد", unread: 0, lastMessageAt: "2026-09-13T11:59:00Z" }),
      NOW
    );
    expect(sortThreads([fresh, old]).map((t) => t.id)).toEqual(["قديم", "جديد"]);
  });

  it("⚠️ وجوّه المستنيين — الأقدم الأول", () => {
    const a = viewThread(thread({ id: "أ", unread: 1, lastInboundAt: "2026-09-13T09:00:00Z" }), NOW);
    const b = viewThread(thread({ id: "ب", unread: 1, lastInboundAt: "2026-09-13T11:30:00Z" }), NOW);
    expect(sortThreads([b, a]).map((t) => t.id)).toEqual(["أ", "ب"]);
  });

  it("واللي مش مستني — الأحدث الأول", () => {
    const a = viewThread(thread({ id: "أ", lastMessageAt: "2026-09-13T08:00:00Z" }), NOW);
    const b = viewThread(thread({ id: "ب", lastMessageAt: "2026-09-13T11:00:00Z" }), NOW);
    expect(sortThreads([a, b]).map((t) => t.id)).toEqual(["ب", "أ"]);
  });

  it("⚠️ اسم العميل بيكسب الاسم اللي جه من ميتا", () => {
    expect(
      threadTitle(thread({ customerName: "أحمد محمد", displayName: "Ahmed" }))
    ).toBe("أحمد محمد");
  });

  it("⚠️⚠️ وإنستجرام من غير اسم مابيقولش «بدون اسم»", () => {
    // الرقم أو المعرّف بيخلّي اللي بيرد يعرف يفرّق — «بدون اسم» بتتكرر
    const ig = threadTitle(
      thread({ channel: "instagram", displayName: null, externalId: "17841400000123" })
    );
    expect(ig).not.toContain("بدون");
    expect(ig).toContain("000123");

    const wa = threadTitle(thread({ displayName: null }));
    expect(wa).toBe("201001234567");
  });

  it("النافذة المقفولة بتمنع الرد", () => {
    const closed = viewThread(thread({ lastInboundAt: "2026-09-11T12:00:00Z" }), NOW);
    expect(closed.canReply).toBe(false);
    const open = viewThread(thread(), NOW);
    expect(open.canReply).toBe(true);
  });

  it("عدّاد المستنيين بيشيل المؤرشف", () => {
    const list = [
      viewThread(thread({ id: "١", unread: 1 }), NOW),
      viewThread(thread({ id: "٢", unread: 3, archived: true }), NOW),
      viewThread(thread({ id: "٣", unread: 0 }), NOW),
    ];
    expect(waitingCount(list)).toBe(1);
  });

  it("صياغة الوقت", () => {
    const at = (iso: string) => sinceText(iso, NOW);
    expect(at("2026-09-13T11:59:40Z")).toBe("دلوقتي");
    expect(at("2026-09-13T11:59:00Z")).toBe("من دقيقة");
    expect(at("2026-09-13T11:58:00Z")).toBe("من دقيقتين");
    expect(at("2026-09-13T11:30:00Z")).toBe("من 30 دقيقة");
    expect(at("2026-09-13T11:00:00Z")).toBe("من ساعة");
    expect(at("2026-09-13T10:00:00Z")).toBe("من ساعتين");
    expect(at("2026-09-12T12:00:00Z")).toBe("إمبارح");
    expect(at("2026-09-10T12:00:00Z")).toBe("من 3 يوم");
    expect(sinceText(null, NOW)).toBe("—");
    expect(sinceText("مش تاريخ", NOW)).toBe("—");
  });
});
