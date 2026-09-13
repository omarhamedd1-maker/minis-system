// ==========================================================================
// قراية اللي ميتا بتبعته — تلات قنوات بتيجي على نفس الباب بأشكال مختلفة
// --------------------------------------------------------------------------
// واتساب وإنستجرام وماسنجر كلهم بيرنّوا على نفس العنوان، بس الجسم مختلف:
// واتساب بيبعت `entry[].changes[].value.messages[]`، وماسنجر وإنستجرام
// بيبعتوا `entry[].messaging[]`.
//
// ⚠️⚠️ **وأخطر حاجة هنا: صدى الرسايل (`is_echo`).** الرسالة اللي إحنا
// بنبعتها بترجع لنا تاني من ميتا كأنها حدث جديد. من غير ما نشيلها، ردنا
// إحنا بيتسجّل **كرسالة من العميل** — فالمحادثة بتبان غير مقروءة، ونافذة
// الـ٢٤ ساعة بتتحسب غلط وتفضل مفتوحة للأبد في الورق وهي مقفولة عند ميتا.
//
// ⚠️ **والوقت بشكلين**: واتساب بيبعت ثواني كنص، وماسنجر بيبعت
// ملّي ثانية كرقم. الخلط بينهم بيحط رسالة سنة ١٩٧٠ فوق المحادثة.
//
// **الملف ده صافي** — جسم داخل، رسايل خارج.
// ==========================================================================

import type { Channel } from "./channel";

export type IncomingMessage = {
  channel: Channel;
  /**
   * `in` من العميل · `out` مننا.
   *
   * ⚠️⚠️ **`out` مش دايمًا يعني إن السيستم هو اللي بعت.** في Coexistence
   * الرد اللي صاحب المتجر بيكتبه **من موبايله** بيوصلنا كصدى
   * (`smb_message_echoes`) — ولو اترمى، المحادثة في السيستم بتبان
   * كأنها من غير رد وهو رد فعلًا.
   */
  direction: "in" | "out";
  /** معرّف الطرف التاني — رقم الواتساب أو IGSID أو PSID */
  externalId: string;
  /** معرّف الرسالة عند ميتا — ده اللي بيمنع التكرار */
  messageId: string | null;
  displayName: string | null;
  body: string | null;
  attachmentUrl: string | null;
  attachmentType: string | null;
  /** ISO */
  at: string;
  /** الحساب اللي وصلته الرسالة — عشان نعرف البيزنس */
  accountId: string | null;
};

/** حالة رسالة بعتناها — delivered / read / failed */
export type StatusUpdate = {
  messageId: string;
  status: string;
  error: string | null;
  /**
   * الحساب اللي الحالة جاية منه.
   *
   * ⚠️⚠️ **من غيره التحديث بيمشي على كل البيزنسات.** معرّف الرسالة
   * فريد **جوّه البيزنس** بس — فتحديث بالمعرّف لوحده ممكن يلمس رسالة
   * بيزنس تاني.
   */
  accountId: string | null;
};

export type ParsedWebhook = {
  messages: IncomingMessage[];
  statuses: StatusUpdate[];
  /** اللي اتشال بقصد — للتسجيل، مش للتخزين */
  skipped: { why: string; count: number }[];
};

function iso(value: unknown, unit: "s" | "ms"): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString();
  return new Date(unit === "s" ? n * 1000 : n).toISOString();
}

function text(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s ? s : null;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function parseMetaWebhook(payload: unknown): ParsedWebhook {
  const out: ParsedWebhook = { messages: [], statuses: [], skipped: [] };
  const skip = (why: string) => {
    const hit = out.skipped.find((s) => s.why === why);
    if (hit) hit.count++;
    else out.skipped.push({ why, count: 1 });
  };

  const root = obj(payload);
  const kind = String(root.object ?? "");

  for (const entryRaw of arr(root.entry)) {
    const entry = obj(entryRaw);

    // ===== واتساب =====
    for (const changeRaw of arr(entry.changes)) {
      const value = obj(obj(changeRaw).value);
      const accountId =
        text(obj(value.metadata).phone_number_id) ?? text(entry.id);

      // الاسم بييجي في قايمة منفصلة عن الرسالة
      const names = new Map<string, string>();
      for (const c of arr(value.contacts)) {
        const contact = obj(c);
        const wa = text(contact.wa_id);
        const name = text(obj(contact.profile).name);
        if (wa && name) names.set(wa, name);
      }

      for (const m of arr(value.messages)) {
        const msg = obj(m);
        const from = text(msg.from);
        if (!from) {
          skip("رسالة واتساب من غير رقم");
          continue;
        }
        const type = String(msg.type ?? "text");
        const media = obj(msg[type]);
        out.messages.push({
          channel: "whatsapp",
          direction: "in",
          externalId: from,
          messageId: text(msg.id),
          displayName: names.get(from) ?? null,
          body: text(obj(msg.text).body) ?? text(media.caption),
          // ⚠️ ميتا بتدي معرّف الملف مش رابط — التحميل بيحصل بعدين
          attachmentUrl: type === "text" ? null : text(media.id),
          attachmentType: type === "text" ? null : type,
          at: iso(msg.timestamp, "s"),
          accountId,
        });
      }

      /**
       * ⚠️⚠️ **صدى واتساب = رد صاحب المتجر من موبايله.**
       *
       * في Coexistence الرقم شغّال على التطبيق وعلى الـAPI مع بعض،
       * والرد اللي بيتكتب من التطبيق بيوصل هنا. ده **مش** زي صدى
       * ماسنجر اللي بنرميه: ده الرد نفسه، ولو اترمى المحادثة بتبان
       * في السيستم كأنها مستنية رد وهي مردود عليها.
       */
      for (const m of arr(value.message_echoes)) {
        const msg = obj(m);
        // الصدى بيتبعت لمين — مش مين بعته
        const to = text(msg.to) ?? text(msg.recipient_id);
        if (!to) {
          skip("صدى واتساب من غير مستقبل");
          continue;
        }
        const type = String(msg.type ?? "text");
        const media = obj(msg[type]);
        out.messages.push({
          channel: "whatsapp",
          direction: "out",
          externalId: to,
          messageId: text(msg.id),
          displayName: names.get(to) ?? null,
          body: text(obj(msg.text).body) ?? text(media.caption),
          attachmentUrl: type === "text" ? null : text(media.id),
          attachmentType: type === "text" ? null : type,
          at: iso(msg.timestamp, "s"),
          accountId,
        });
      }

      for (const s of arr(value.statuses)) {
        const st = obj(s);
        const id = text(st.id);
        if (!id) continue;
        const errors = arr(st.errors).map((e) => text(obj(e).title)).filter(Boolean);
        out.statuses.push({
          messageId: id,
          status: String(st.status ?? "sent"),
          error: errors.length ? errors.join(" · ") : null,
          accountId,
        });
      }
    }

    // ===== ماسنجر وإنستجرام =====
    const channel: Channel = kind === "instagram" ? "instagram" : "messenger";
    for (const mRaw of arr(entry.messaging)) {
      const ev = obj(mRaw);
      const message = obj(ev.message);

      // ⚠️⚠️ **الصدى** — ردنا إحنا راجع لنا. لو اتسجّل بيبقى رسالة من العميل
      if (message.is_echo === true) {
        skip("صدى لرسالة بعتناها");
        continue;
      }
      // قراية وتسليم — مش كلام
      if (!ev.message) {
        skip("حدث مش رسالة (قراية أو تسليم)");
        continue;
      }

      const senderId = text(obj(ev.sender).id);
      if (!senderId) {
        skip("رسالة من غير مرسل");
        continue;
      }

      const attachment = obj(arr(message.attachments)[0]);
      out.messages.push({
        channel,
        direction: "in",
        externalId: senderId,
        messageId: text(message.mid),
        displayName: null,
        body: text(message.text),
        attachmentUrl: text(obj(attachment.payload).url),
        attachmentType: text(attachment.type),
        at: iso(ev.timestamp, "ms"),
        accountId: text(obj(ev.recipient).id) ?? text(entry.id),
      });
    }
  }

  return out;
}
