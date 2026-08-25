// ==========================================================================
// النداء على كلود عشان يقرا صورة الإيصال
// --------------------------------------------------------------------------
// ⚠️⚠️ **الملف ده بينادي على الشبكة — والحسبة عليها فلوس.** الصورة الواحدة
// تقريبًا ١٬٥٠٠ توكن دخول، يعني الإيصال بجزء بسيط من القرش. مافيش خطر من
// الفاتورة، بس **مافيش نداء من غير ما حد يضغط زرار** — لا خلفية ولا لفة
// دورية بتقرا صور لوحدها.
//
// ⚠️ **ومن غير مفتاح، الميزة بتقول كده بصوت عالي** بدل ما تفشل بشكل غامض.
// المفتاح بيتحط في `ANTHROPIC_API_KEY` على فيرسل.
//
// ⚠️ **والقراية بترجّع JSON مضبوط** (`output_config.format`) — من غيره
// الرد بييجي كلام حواليه «تمام، الإيصال ده فيه…» ويبوظ التحليل.
// ==========================================================================

import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES, type RawReceipt } from "./receipt";

export type ReadResult =
  | { ok: true; raw: RawReceipt }
  | { ok: false; reason: string };

/** الوصف اللي كلود بيشتغل بيه */
const SYSTEM = [
  "إنت بتقرا صور إيصالات وفواتير مصرية عشان تسجّل مصروف.",
  "",
  "المطلوب: المبلغ الإجمالي المدفوع، والتاريخ، واسم المحل، ونوع المصروف.",
  "",
  "قواعد مهمة:",
  "- المبلغ هو **الإجمالي النهائي المدفوع** — مش المجموع قبل الخصم ولا سطر منتج واحد.",
  "- التاريخ بصيغة YYYY-MM-DD. والتاريخ في الإيصال المصري بيتكتب يوم/شهر/سنة.",
  "- النوع لازم يكون واحد بالظبط من: " + CATEGORIES.join(" · "),
  "",
  "⚠️ أي حاجة مش واضحة أو مش متأكد منها: سيبها null. **متخمّنش.**",
  "الخانة الفاضية بتتملي في ثانية، والرقم الغلط بيدخل الحسابات ومحدش بيلاقيه.",
].join("\n");

/** شكل الرد — بيخلّي كلود يرجّع JSON مضبوط بدل كلام */
const SCHEMA = {
  type: "object" as const,
  properties: {
    amount: {
      type: ["number", "null"],
      description: "الإجمالي النهائي المدفوع بالجنيه",
    },
    date: { type: ["string", "null"], description: "YYYY-MM-DD" },
    vendor: { type: ["string", "null"], description: "اسم المحل" },
    category: {
      type: ["string", "null"],
      enum: [...CATEGORIES, null],
      description: "نوع المصروف",
    },
    note: { type: ["string", "null"], description: "وصف قصير للي اتشرى" },
  },
  required: ["amount", "date", "vendor", "category", "note"],
  additionalProperties: false,
};

/**
 * بيبعت الصورة لكلود ويرجّع اللي قراه.
 *
 * ⚠️ **مابيرميش** — الشبكة بتقع والمفتاح بيبوظ، والشاشة لازم تقول السبب
 * بدل ما توقع.
 */
export async function readReceiptImage(
  image: { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" },
  apiKey = process.env.ANTHROPIC_API_KEY
): Promise<ReadResult> {
  if (!apiKey) {
    return {
      ok: false,
      reason: "قراية الصور لسه مش مفعّلة — محتاجة مفتاح في إعدادات فيرسل",
    };
  }

  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1024,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: image.mediaType,
                data: image.base64,
              },
            },
            { type: "text", text: "اقرا الإيصال ده." },
          ],
        },
      ],
    });

    // ⚠️ **الرفض بيرجع ٢٠٠** — لازم يتشاف قبل ما نقرا المحتوى
    if (response.stop_reason === "refusal") {
      return { ok: false, reason: "الصورة دي مش إيصال — جرّب صورة تانية" };
    }

    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      return { ok: false, reason: "معرفناش نقرا الصورة" };
    }

    const raw = JSON.parse(text.text) as RawReceipt;
    return { ok: true, raw };
  } catch (e) {
    // ⚠️ السبب بيتعرض زي ما هو — «فشل» من غير سبب بتخلّي اللي بيستخدمها
    // يجرّب نفس الصورة عشر مرات
    if (e instanceof Anthropic.AuthenticationError) {
      return { ok: false, reason: "مفتاح قراية الصور مرفوض" };
    }
    if (e instanceof Anthropic.RateLimitError) {
      return { ok: false, reason: "الخدمة مزحومة دلوقتي — جرّب كمان شوية" };
    }
    if (e instanceof SyntaxError) {
      return { ok: false, reason: "الرد رجع بشكل غير متوقع" };
    }
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "معرفناش نقرا الصورة",
    };
  }
}
