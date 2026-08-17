// ==========================================================================
// حارس: دوال شوبيفاي **مابتعرفش البيزنس**
// --------------------------------------------------------------------------
// الدوال دي بتكتب في الداتابيز بمفتاح الأدمن، و**ولا واحدة فيهم بتكتب
// رقم البيزنس**. ساعتها الداتابيز بتحطه بالقيمة الافتراضية:
//
//     current_tenant_id()  →  بيزنس المستخدم الداخل،
//                             ولو مفيش مستخدم →  **مينيز**
//
// ومفتاح الأدمن مالوش مستخدم. يعني **أي أوردر بيدخل من الدوال دي بيتكتب
// عند مينيز مهما كان المتجر اللي بعته**.
//
// ودي مش نظرية: التطبيق العام بتاع شوبيفاي **سرّه واحد لكل المتاجر**،
// والدوال بتتحقق من التوقيع بالسر ده بس ومابتبصّش على المتجر اللي بعت
// (`x-shopify-shop-domain`) خالص. أي متجر يركّب التطبيق وويب هوكه يوصل
// هنا، أوردراته بتتحط في بيزنس عمر.
//
// **المسار السليم موجود خلاص**: `app/api/shopify/webhooks` بيطلّع البيزنس
// من `tenant_credentials` بدومين المتجر، والاستيراد الدوري بيلف على كل
// بيزنس بمفاتيحه. يعني الدوال دي مابقاش لها لازمة في الاستقبال.
//
// ⚠️ **الملفات دي نسخة من اللي منشور في لوحة سوبابيز** (اقرا `README.md`
// جنبها). الاختبار ده بيحرس النسخة: لو حد نقل الدوال للريبو أو عدّلها،
// مايقدرش يخلّيها تكتب من غير رقم بيزنس من غير ما ياخد باله.
// ==========================================================================

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = "supabase/functions";

/** جداول مالهاش رقم بيزنس أصلاً — الكتابة فيها مش خطر خلط */
const GLOBAL_TABLES = new Set([
  "shopify_app",
  "shopify_installs",
  "tenants",
  "platform_admins",
  "push_config",
]);

type Hit = { file: string; line: number; table: string };

function tenantBlindWrites(): Hit[] {
  const hits: Hit[] = [];
  if (!existsSync(ROOT)) return hits;

  for (const dir of readdirSync(ROOT, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const file = join(ROOT, dir.name, "index.ts");
    if (!existsSync(file)) continue;

    const lines = readFileSync(file, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const from = lines[i].match(/\.from\(\s*["'`](\w+)["'`]\s*\)/);
      if (!from) continue;
      const table = from[1];
      if (GLOBAL_TABLES.has(table)) continue;

      // السلسلة من `.from(...)` لحد آخرها
      const chain = lines.slice(i, i + 20).join("\n");
      const end = chain.search(/;\s*$/m);
      const scope = end > 0 ? chain.slice(0, end) : chain;

      if (!/\.(insert|upsert|update)\(/.test(scope)) continue;
      if (/tenant_id/.test(scope)) continue;

      hits.push({ file: file.replace(/\\/g, "/"), line: i + 1, table });
    }
  }
  return hits;
}

describe("دوال سوبابيز والبيزنس", () => {
  it("**الكتابة من غير رقم بيزنس بتروح لمينيز** — دي الحالة الواقعة دلوقتي", () => {
    const hits = tenantBlindWrites();

    // الاختبار **مابيفشلش** على الوضع الحالي عن قصد: الدوال منشورة في
    // لوحة سوبابيز مش من هنا، ومسحها قرار عمر مش قرار الاختبار.
    // اللي بيحرسه إن العدد **مايزيدش** — الإصلاح بينزّله والرقم يتنزّل
    // معاه، والزيادة بتوقّع.
    //
    // ⚠️ الرقم طلع لما دوال بوسطة التمنية اتنقلت للريبو (١٧ أغسطس) —
    // فيهم ٨ كتابات عمياها، أخطرها `bosta-webhook` اللي كانت بتدوّر على
    // الأوردر **برقمه بس**.
    //
    // ونزل تاني لما `bosta-webhook` بقت **جرس بس** (١٨ أغسطس): مابقاش
    // فيها ولا كتابة — بتحوّل النداء لـ`app/api/bosta/webhook` واللي
    // بيلاقي الأوردر برقم التتبع. الباقي ٣٢ كلهم في دوال شوبيفاي
    // المتوقّفة + ٤ في دوال بوسطة التانية.
    const report = hits.map((h) => `  ${h.file}:${h.line} → ${h.table}`).join("\n");
    expect(hits.length, `كتابات عمياها عن البيزنس:\n${report}`).toBeLessThanOrEqual(32);
  });

  it("ولا دالة بتبصّ على المتجر اللي بعت الويب هوك", () => {
    // التوقيع بيتفحص بسر واحد لكل المتاجر، فالتحقق منه **مش** إثبات إن
    // الأوردر جاي من متجر عمر.
    const checks: string[] = [];
    for (const dir of readdirSync(ROOT, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const file = join(ROOT, dir.name, "index.ts");
      if (!existsSync(file)) continue;
      if (/x-shopify-shop-domain/i.test(readFileSync(file, "utf8"))) {
        checks.push(dir.name);
      }
    }
    expect(checks).toEqual([]);
  });
});
