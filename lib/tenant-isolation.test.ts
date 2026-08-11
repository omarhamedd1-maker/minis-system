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
const GLOBAL_TABLES = new Set([
  "push_config",
  "shopify_app",
  "tenants",
  "platform_admins",
  "shopify_installs",
]);

type Hit = { file: string; line: number; table: string };

function unfilteredAdminReads(): Hit[] {
  const files = execSync('grep -rl "createAdminClient" app lib components', {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f && !f.endsWith("supabase/admin.ts"));

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
    }

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

      const chain = lines.slice(i, i + 18).join("\n");
      const end = chain.search(/;\s*$/m);
      const scope = end > 0 ? chain.slice(0, end) : chain;

      if (/tenant_id/.test(scope)) continue;
      if (/\.eq\(|\.in\(|\.match\(|\.or\(/.test(scope)) continue;
      if (/\.insert\(|\.upsert\(/.test(scope)) continue;

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
  });
});
