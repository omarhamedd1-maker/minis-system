import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
for (const l of readFileSync(".env.local","utf8").replace(/^\uFEFF/,"").split(/\r?\n/)) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim();
}
it("فيه مسار POST لتسجيل ويب هوك؟", async () => {
  const { createAdminClient } = await import("./lib/supabase/admin");
  const db = createAdminClient();
  const { data } = await db.from("tenant_credentials").select("bosta_api_key").not("bosta_api_key","is",null).limit(1).maybeSingle();
  const key = (data as { bosta_api_key: string }).bosta_api_key;
  const paths = [
    "/api/v2/webhooks", "/api/v0/webhooks", "/api/v1/webhooks",
    "/api/v2/businesses/webhooks", "/api/v2/webhook",
    "/api/v2/integrations/webhooks", "/api/v2/deliveries/webhooks",
  ];
  // **جسم فاضي بقصد**: لو المسار موجود هيرد بخطأ تحقق من غير ما يعمل حاجة
  for (const p of paths) {
    try {
      const r = await fetch(`https://app.bosta.co${p}`, {
        method: "POST",
        headers: { Authorization: key, "content-type": "application/json" },
        body: "{}",
      });
      const t = (await r.text()).slice(0, 140).replace(/\s+/g, " ");
      console.log(`${r.status}  POST ${p}  ${t}`);
    } catch (e) { console.log(`ERR  ${p}  ${String(e).slice(0,60)}`); }
  }
  expect(true).toBe(true);
}, 180000);
