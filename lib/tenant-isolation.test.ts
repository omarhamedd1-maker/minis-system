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

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** جداول مش متقسّمة على البيزنسات أصلاً — مالهاش عمود `tenant_id` */
/**
 * ⚠️ **`app_users` في `lib/permissions.ts` استثناء واحد مقصود**: بيحدّث
 * `last_seen_at` بـ`auth_user_id` بتاع الجلسة نفسها — يعني مربوط بالشخص
 * اللي داخل مش برقم صف بيتبعت من برّه. مافيش حاجة يقدر يوصلها بغير حسابه.
 */
/**
 * ⚠️ **وصفحة التتبع استثناء تاني مقصود**: العميل بيفتحها من غير حساب،
 * فمالوش بيزنس نفلتر بيه — رقم التتبع هو اللي بيحدد الشحنة. واللي
 * بيتعرض **الحالة وبس**: مافيش اسم ولا تليفون ولا عنوان ولا مبلغ ولا
 * اسم منتج، فحتى الرقم المخمّن مايوصّلش لبيانات حد.
 */
const ALLOWED = new Set([
  "lib/permissions.ts",
  "app/track/[tracking]/page.tsx",
  "app/track/[tracking]/actions.ts",
  // ⚠️ **صفحة التقييم** — العميل مالوش بيزنس، ومعرّف الأوردر (`uuid`) هو
  // اللي بيحدده لوحده. والبيزنس بيتاخد **من الأوردر نفسه** مش من اللي
  // بيبعت، فمافيش طريق يسجّل تقييم على بيزنس تاني.
  "app/r/[id]/page.tsx",
  "app/r/[id]/actions.ts",
]);

const GLOBAL_TABLES = new Set([
  "push_config",
  "shopify_app",
  "tenants",
  "platform_admins",
  "shopify_installs",
]);

/**
 * ⚠️⚠️ **دوال Supabase قديمة — قايمة متجمّدة، والعدد بيقل بس.**
 *
 * الحارس اتوسّع يمسح `supabase/functions` (١٣ سبتمبر) بعد ما
 * `bosta-cashout` طلعت بتكتب حركة خزنة من غير `tenant_id` ومحدش شافها.
 * أول تشغيل مسك **٣٤ موضع في ٨ دوال**. موضعين `bosta-cashout` اتصلّحوا،
 * والباقي هنا بعدده المقاس.
 *
 * الدوال دي نسخ بتتلزق في Supabase بالإيد، واتكتبت قبل عزل البيزنسات —
 * والتطبيق دلوقتي بيستقبل أوردرات شوبيفاي من `app/api/shopify/webhooks`.
 * **القرار (تصليح ولا مسح) عند عمر.**
 *
 * القايمة مش استثناء مفتوح:
 * - موضع جديد من غير `tenant_id` في نفس الملف → الحارس بيقع
 * - دالة جديدة مش في القايمة → الحارس بيقع
 * - موضع اتصلّح → الحارس بيقع لحد ما الرقم ينزل
 */
const LEGACY_EDGE_FUNCTIONS = new Map<string, number>([
  ["supabase/functions/bosta-audit/index.ts", 1],
  ["supabase/functions/bosta-create/index.ts", 1],
  ["supabase/functions/bosta-return/index.ts", 1],
  ["supabase/functions/bright-endpoint/index.ts", 2],
  ["supabase/functions/shopify-order-update/index.ts", 10],
  ["supabase/functions/shopify-product/index.ts", 8],
  ["supabase/functions/shopify-sync/index.ts", 9],
]);

type Hit = { file: string; line: number; table: string };

/** المسح بطيء (بيقرا المشروع كله) — بيتعمل مرة واحدة للاختبارات كلها */
let cachedHits: Hit[] | null = null;
function allHits(): Hit[] {
  if (!cachedHits) cachedHits = unfilteredAdminReads();
  return cachedHits;
}

function legacyCounts(hits: Hit[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const h of hits) {
    if (LEGACY_EDGE_FUNCTIONS.has(h.file)) {
      counts.set(h.file, (counts.get(h.file) ?? 0) + 1);
    }
  }
  return counts;
}

/** قراية آمنة — ملف قارناه مش نص أو مرفوض مايوقّعش الحارس نفسه */
function safeRead(f: string): string {
  try {
    return readFileSync(f, "utf8");
  } catch {
    return "";
  }
}

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
  //
  // ⚠️ **والمسح نفسه بـNode مش بـ`grep`.** الحارس كان بينادي أمر `grep`
  // — مش موجود في ويندوز، فبوابة `npm run check` كانت بتقع على جهاز
  // التطوير قبل ما تقيس أي حاجة أصلاً (٢٤ أغسطس). المسح بقى بـ`node:fs`
  // — نفس النتيجة على أي نظام، وبالمساطر القدامية (`/` مش `\`).
  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = `${dir}/${e.name}`;
      return e.isDirectory() ? walk(p) : [p];
    });
  }
  const files = ["app", "lib", "components", "supabase/functions"]
    .flatMap(walk)
    .filter(
      (f) =>
        !f.endsWith("supabase/admin.ts") &&
        !f.includes(".test.") &&
        /\.(ts|tsx)$/.test(f) &&
        /createAdminClient|SupabaseClient|SERVICE_ROLE/.test(safeRead(f))
    );

  const hits: Hit[] = [];

  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");

    // أسماء المتغيرات اللي شايلة مفتاح الأدمن في الملف ده — عشان
    // `createClient()` المحمي بالـRLS مايتحسبش غلط
    const adminVars = new Set<string>();
    for (let k = 0; k < lines.length; k++) {
      const l = lines[k];
      const m = l.match(
        /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?createAdminClient\(\)/
      );
      if (m) adminVars.add(m[1]);
      // والعميل اللي بييجي كمعامل — ده اللي كان بيفلت
      const p = l.match(/([A-Za-z_$][\w$]*)\s*:\s*SupabaseClient/);
      if (p) adminVars.add(p[1]);
      // ⚠️⚠️ **ودوال Supabase (Deno)** — بتعمل العميل بـ`createClient` ومفتاح
      // الخدمة من البيئة، مش بـ`createAdminClient`. من غير السطر ده كانت برّه
      // الحارس كلها: `bosta-cashout` كانت بتكتب حركة خزنة من غير `tenant_id`
      // ومحدش شافها (١٣ سبتمبر).
      const svc = l.match(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*createClient\(/);
      if (svc && lines.slice(k, k + 4).join("\n").includes("SERVICE_ROLE")) {
        adminVars.add(svc[1]);
      }
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
    const hits = allHits().filter((h) => !LEGACY_EDGE_FUNCTIONS.has(h.file));
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
    // ⚠️ **٣٠ ثانية مش رفاهية.** الاختبار ده بيلف على كل ملفات `app`
    // و`lib` و`components` ويقراهم واحد واحد — وده أبطأ من أي اختبار
    // تاني في المشروع. المهلة الافتراضية في vitest **٥ ثواني**، فتحت ضغط
    // التشغيل المتوازي كان بيتعدّاها ويقع **من غير ما يكون فيه غلط
    // أصلاً**.
    //
    // اتمسك بتشغيل السويت ٦ مرات (١٨ أغسطس): وقع مرة بـ٥٥٧٤ مللي، وعدّى
    // ٨ مرات لوحده في ٢٥٠ مللي. والفشل العشوائي أوحش من البطء، لأنه
    // بيخلّي الحارس نفسه مش موثوق فحد يعدّي عليه.
  }, 30_000);

  it("⚠️⚠️ الدوال القديمة: العدد بيقل بس", () => {
    const counts = legacyCounts(allHits());
    const drift: string[] = [];
    for (const [file, frozen] of LEGACY_EDGE_FUNCTIONS) {
      const now = counts.get(file) ?? 0;
      if (now > frozen) drift.push(`${file}: ${now} موضع — كان ${frozen}. موضع جديد من غير tenant_id`);
      else if (now < frozen) drift.push(`${file}: ${now} موضع — اتصلّح حاجة، نزّل الرقم في القايمة لـ${now}`);
    }
    expect(drift).toEqual([]);
  }, 30_000);

  it("الحارس بيشوف دوال Supabase فعلًا — و bosta-cashout نضيفة", () => {
    const hits = allHits();
    // لو المسح وقف يقرا المجلد، القايمة كلها هتبان صفر — ده اللي بيمسكه
    expect(legacyCounts(hits).size).toBe(LEGACY_EDGE_FUNCTIONS.size);
    expect(hits.filter((h) => h.file.includes("bosta-cashout"))).toEqual([]);
  }, 30_000);
});
