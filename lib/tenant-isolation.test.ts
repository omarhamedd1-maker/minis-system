// ==========================================================================
// حارس عزل البيزنسات — اختبار بيقرا الكود نفسه
// --------------------------------------------------------------------------
// مفتاح الأدمن **بيعدّي على الـRLS**. يعني أي استعلام بيه من غير
// `.eq("tenant_id", …)` بيرجّع صفوف كل البيزنسات، والداتا بتتخلط أو تتسرّب.
//
// الغلطة دي اتكررت أكتر من مرة (شاشات المستخدمين والسجل والموردين
// والمصاريف والمراجعة، وبعدين ملف التكاليف وفحص التغطية) — فبدل ما نفتكر،
// الاختبار ده بيقرا الملفات وبيوقع لو حد كتب استعلام قراءة مكشوف.
//
// **بيمسك القراءة المكشوفة بس**: استعلام على متغير شايل مفتاح الأدمن،
// ومالوش لا `tenant_id` ولا أي فلتر (`.eq` / `.in` / `.or` / `.match`).
// الاستعلام اللي بيفلتر بـ`id` اتأكد قبله إنه تبع البيزنس مش بيتحسب —
// ده هيبقى ضجيج مالوش لازمة.
// ==========================================================================

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/** جداول مش متقسّمة على البيزنسات أصلاً — مالهاش عمود `tenant_id` */
/**
 * ⚠️ **`app_users` في `lib/permissions.ts` استثناء واحد مقصود**: بيحدّث
 * `last_seen_at` بـ`auth_user_id` بتاع الجلسة نفسها — يعني مربوط بالشخص
 * اللي داخل مش برقم صف بيتبعت من برّه. مافيش حاجة يقدر يوصلها بغير حسابه.
 */
const ALLOWED = new Set(["lib/permissions.ts"]);

const GLOBAL_TABLES = new Set([
  "push_config",
  "shopify_app",
  "tenants",
  "platform_admins",
  "shopify_installs",
]);

type Hit = { file: string; line: number; table: string };

function unfilteredAdminReads(): Hit[] {
  // ⚠️ **مش بس اللي بيعمل المفتاح جواه.**
  //
  // النسخة الأولى كانت بتدوّر على `createAdminClient` في الملف نفسه — يعني
  // أي ملف بياخد العميل **كمعامل** كان خارج نظر الحارس تمامًا. وده مكان
  // أخطر شغل في السيستم: مزامنة بوسطة، واستيراد شوبيفاي، وسجل الاستيراد —
  // كلهم بياخدوا `db: SupabaseClient` من اللي بيناديهم.
  //
  // وطلع فيهم فعلًا **٨ كتابات** من غير رقم بيزنس (١٣ أغسطس)، منها استيراد
  // متجر عميل جديد بالكامل — عملاءه ومنتجاته وأوردراته — جوّه بيزنس عمر.
  const files = execSync(
    'grep -rlE "createAdminClient|SupabaseClient" app lib components',
    { encoding: "utf8" }
  )
    .trim()
    .split("\n")
    .map((f) => f.trim())
    .filter(
      (f) =>
        f &&
        !f.endsWith("supabase/admin.ts") &&
        !f.includes(".test.")
    );

  const hits: Hit[] = [];

  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");

    // أسماء المتغيرات اللي شايلة مفتاح الأدمن في الملف ده — عشان
    // `createClient()` المحمي بالـRLS مايتحسبش غلط
    const adminVars = new Set<string>();
    for (const l of lines) {
      const m = l.match(
        /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?createAdminClient\(\)/
      );
      if (m) adminVars.add(m[1]);
      // والعميل اللي بييجي كمعامل — ده اللي كان بيفلت
      const p = l.match(/([A-Za-z_$][\w$]*)\s*:\s*SupabaseClient/);
      if (p) adminVars.add(p[1]);
    }
    // ⚠️⚠️ **الملف اللي بينده `createAdminClient()` مباشرة كان بيتخطّى كله.**
    //
    // الشرط كان «مافيش متغير شايل مفتاح الأدمن؟ عدّي الملف». والشكل ده:
    //
    //     await createAdminClient()
    //       .from("deletion_requests")
    //       .eq("status", "pending")
    //
    // مافيهوش متغير خالص، فالملف كان بره الفحص من أصله. اتكشف بالسبوتاج
    // (١٨ أغسطس): شيلت فلتر البيزنس من `orders/page.tsx` **والاختبار عدّى**.
    const usesAdmin =
      adminVars.size > 0 || lines.some((l) => l.includes("createAdminClient()"));
    if (!usesAdmin) continue;

    for (let i = 0; i < lines.length; i++) {
      const inline = lines[i].match(
        /([A-Za-z_$][\w$]*|createAdminClient\(\))\s*\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/
      );
      const wrapped = lines[i].match(/^\s*\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/);

      let holder: string | undefined;
      let table: string | undefined;

      if (inline) {
        holder = inline[1];
        table = inline[2];
      } else if (wrapped) {
        table = wrapped[1];
        // الشين مكسور على سطور — صاحب الاستدعاء فوق
        for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
          const p = lines[j].match(/([A-Za-z_$][\w$]*|createAdminClient\(\))\s*$/);
          if (p) {
            holder = p[1];
            break;
          }
        }
      }

      if (!holder || !table) continue;
      if (holder !== "createAdminClient()" && !adminVars.has(holder)) continue;
      if (GLOBAL_TABLES.has(table)) continue;
      if (ALLOWED.has(file)) continue;

      // ⚠️ **السلسلة بتنتهي عند الاستعلام اللي بعدها، مش عند أول `;`.**
      //
      // الاستعلامات اللي جوّه `Promise.all([...])` بتنتهي كلها بـ`;` واحد في
      // الآخر. فالحارس كان بياخد التلاتة ككتلة واحدة، ويلاقي `tenant_id` في
      // واحد فيهم، ويسكت عن التانيين. اتجرّب بالعكس: شيلنا الفلتر من قراية
      // الأوردرات في استيراد شوبيفاي **والاختبار عدّى** — وده كان هيسيب
      // أخطر قراية في السيستم من غير حارس.
      const stop = lines
        .slice(i + 1, i + 18)
        .findIndex((l) => /\.from\(\s*["'`]/.test(l));
      const chain = lines
        .slice(i, stop === -1 ? i + 18 : i + 1 + stop)
        .join("\n");
      const end = chain.search(/;\s*$/m);
      let scope = end > 0 ? chain.slice(0, end) : chain;

      // **الاستعلام ممكن يتخزّن في متغير** ويتستعمل بعد كام سطر:
      //
      //     const log = db.from("activity_log");
      //     await log.insert(row);
      //
      // من غير المتابعة دي، الحارس بيشوف السطر الأول بس — ومايشوفش الصف
      // اللي فيه رقم البيزنس، فبيبلّغ عن حاجة سليمة.
      const held = lines[i].match(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/);
      if (held) {
        const uses = lines
          .slice(i + 1, i + 24)
          .filter((l) => new RegExp("\\b" + held[1] + "\\.").test(l));
        // والصف نفسه بيتبني فوق غالبًا
        scope += "\n" + lines.slice(Math.max(0, i - 14), i).join("\n");
        scope += "\n" + uses.join("\n");
      }

      if (/tenant_id/.test(scope)) continue;

      // **الكتابة قاعدتها أتقل من القراءة.** التعديل أو الحذف المفلتر
      // بـ`id` لوحده معناه إن حد من بيزنس يبعت رقم صف من بيزنس تاني
      // ويغيّره — والمفتاح ده بيعدّي على الـRLS.
      //
      // اتلقى **٨٩ موضع** كده (١٢ أغسطس)، منهم واحد بيمسح أوردر كامل
      // بمخزونه وحركاته. القراءة المكشوفة وحشة، والكتابة المكشوفة أوحش.
      if (/\.(update|delete)\(/.test(scope)) {
        hits.push({ file, line: i + 1, table });
        continue;
      }

      // ⚠️ **والإضافة كانت مستثناة، والاستثناء ده كان غلط.**
      //
      // الفكرة كانت إن الداتابيز بتملّي الخانة لوحدها
      // (`sql/tenants-02-auto-fill.sql`). بس الدالة دي بتقرا
      // `auth.uid()` — **ومفتاح الأدمن مالوش مستخدم داخل**، فبترجّع
      // بيزنس مينيز الثابت.
      //
      // يعني كل إضافة بمفتاح الأدمن من غير الخانة كانت بتنزل عند مينيز
      // مهما كان البيزنس اللي بيعمل العملية. اتأكد بالتجربة ١٣ أغسطس:
      // صف اتضاف بالمفتاح من غير `tenant_id` ونزل في مينيز.
      //
      // اتلقى **٢٢ موضع** كده — أوردر وعميل وخزنة ومصروف ومورد وحركة
      // مخزون وسجل النشاط. كلهم اتصلّحوا في نفس اليوم.
      if (/\.insert\(|\.upsert\(/.test(scope)) {
        hits.push({ file, line: i + 1, table });
        continue;
      }

      // ⚠️⚠️ **مش أي فلتر بيكفي — لازم يكون على معرّف فريد.**
      //
      // القاعدة القديمة كانت «فيه `.eq` يبقى تمام»، وده سمح بقرايات زي:
      //
      //     .from("orders").in("order_status", …).is("bosta_tracking", null)
      //     .from("deletion_requests").eq("status", "pending")
      //
      // الفلاتر دي **مابتحددش بيزنس**، فمفتاح الأدمن بيرجّع صفوف كل
      // البيزنسات. اتلقى تلات مواضع كده (١٨ أغسطس)، أخطرهم شاشة ربط
      // الشحنات الناقصة: كانت بتعرض أوردرات كل البيزنسات، **وبتربطها بشحنة
      // من حساب بوسطة بتاع اللي فاتح الشاشة** — يعني رسوم وتحصيل بيزنس
      // بيتجرّوا على بيزنس تاني.
      //
      // **الفلتر بمعرّف فريد آمن**: `id` وأي `*_id` قيمته UUID مالهاش تخمين،
      // فالصف اللي بيرجع هو صف صاحبه. أما `status` و`order_status`
      // و`action` و`archived` فبتوصف حالة مش ملكية.
      const filters = [
        ...scope.matchAll(/\.(?:eq|in|match)\(\s*["'`](\w+)["'`]/g),
      ].map((x) => x[1]);

      if (filters.length === 0) {
        hits.push({ file, line: i + 1, table });
        continue;
      }

      // فيه فلتر واحد على الأقل بمعرّف فريد؟ الصف بيبقى محدد
      if (filters.some((c) => c === "id" || /_id$/.test(c))) continue;

      hits.push({ file, line: i + 1, table });
    }
  }

  return hits;
}

describe("عزل البيزنسات", () => {
  it("مفيش قراءة بمفتاح الأدمن من غير فلتر بيزنس", () => {
    const hits = unfilteredAdminReads();
    const report = hits
      .map((h) => `  ${h.file}:${h.line} → ${h.table}`)
      .join("\n");

    expect(
      hits,
      hits.length
        ? `\nاستعلامات بتقرا من كل البيزنسات:\n${report}\n\n` +
            `الحل: زوّد .eq("tenant_id", me.tenantId) على كل واحد فيهم.\n`
        : undefined
    ).toEqual([]);
    // ⚠️ **٣٠ ثانية مش رفاهية.** الاختبار ده بيشغّل `grep` على كل الملفات
    // وبيقراهم واحد واحد — وده أبطأ من أي اختبار تاني في المشروع. والمهلة
    // الافتراضية في vitest **٥ ثواني**، فتحت ضغط التشغيل المتوازي كان
    // بيتعدّاها ويقع **من غير ما يكون فيه غلط أصلاً**.
    //
    // اتمسك بتشغيل السويت ٦ مرات (١٨ أغسطس): وقع مرة بـ٥٥٧٤ مللي، وعدّى
    // ٨ مرات لوحده في ٢٥٠ مللي. والفشل العشوائي أوحش من البطء، لأنه
    // بيخلّي الحارس نفسه مش موثوق فحد يعدّي عليه.
  }, 30_000);
});
