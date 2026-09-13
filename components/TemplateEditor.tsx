import { PLACEHOLDERS, MAX_TEMPLATE_LENGTH } from "@/lib/message-template";
import type { MessageKindInfo } from "@/lib/message-kinds";
import { SubmitOnce } from "./SubmitOnce";

/**
 * صندوق تعديل قالب رسالة.
 *
 * ⚠️ **مقفول افتراضيًا** (`<details>`) — الشاشة دي شغلها إنك تبعت، والقالب
 * بيتفتح لما تحتاجه. ومكانه هنا مش في الإعدادات بقرار عمر: الرسالة بتتقري
 * وبتتعدّل في نفس الشاشة اللي بتتبعت منها.
 */
export default function TemplateEditor({
  info,
  value,
  back,
  action,
}: {
  info: MessageKindInfo;
  value: string;
  /** الصفحة اللي نرجعلها بعد الحفظ */
  back: string;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <details className="rounded-card bg-surface p-4 shadow-card sm:p-5">
      <summary className="cursor-pointer text-sm font-bold text-ink">
        الرسالة اللي بتتبعت
      </summary>
      <p className="mt-1 text-xs text-ink-muted">{info.when}</p>
      <form action={action} className="mt-3 space-y-2">
        <input type="hidden" name="kind" value={info.key} />
        <input type="hidden" name="back" value={back} />
        <textarea
          name="template"
          rows={4}
          defaultValue={value}
          maxLength={MAX_TEMPLATE_LENGTH}
          className="w-full rounded-control border border-line px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex flex-wrap items-center gap-2">
          {PLACEHOLDERS.map((ph) => (
            <span
              key={ph.token}
              title={ph.hint}
              className="rounded-full bg-sunken px-2 py-0.5 text-[11px] text-ink-muted"
            >
              {"{" + ph.token + "}"}
            </span>
          ))}
        </div>
        <SubmitOnce className="rounded-control bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-dark">
          احفظ الرسالة
        </SubmitOnce>
      </form>
    </details>
  );
}
