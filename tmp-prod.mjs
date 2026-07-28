import fs from "node:fs";
const env = Object.fromEntries(
  fs.readFileSync("./.env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const BASE = process.argv[2] ?? "https://minis-system-git-main-minishome.vercel.app";

console.log("⏳ المسار الجديد (على فيرسل)...");
const freshRes = await fetch(`${BASE}/api/bosta/sync?dry=1&key=${env.SYNC_KEY}`);
const ct = freshRes.headers.get("content-type") ?? "";
if (!ct.includes("json")) {
  console.log("رد مش JSON:", freshRes.status, (await freshRes.text()).slice(0, 200));
  process.exit(1);
}
const fresh = await freshRes.json();
if (!freshRes.ok) { console.log("خطأ:", freshRes.status, fresh); process.exit(1); }

console.log("⏳ الدالة القديمة...");
const old = await (await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/bright-endpoint?dry=1&key=${env.SYNC_KEY}`)).json();

const rows = [
  ["شحنات اتجابت", old.fetched, fresh.fetched],
  ["اتطابقت بأوردر", old.matched, fresh.matched],
  ["هتتغيّر", old.changed, fresh.changed],
  ["حالتها مقفولة", old.statusLocked, fresh.statusLocked],
  ["اسم مختلف (اتجاهلت)", old.skippedTampered, fresh.nameMismatch],
  ["مالهاش أوردر", old.unmatchedCount, fresh.unmatched],
];
console.table(rows.map(([b, o, n]) => ({ البند: b, القديم: o, الجديد: n, "": o === n ? "✅" : "❌" })));

if (fresh.changed > 0) {
  console.log(`\nاللي الجديد شايف إنه محتاج تغيير (${fresh.changed}):`);
  for (const d of fresh.details.slice(0, 30)) console.log(`  ${d.order}: ${d.reasons.join(" · ")}`);
  if (fresh.details.length > 30) console.log(`  ... و${fresh.details.length - 30} كمان`);
}
if (fresh.errors?.length) console.log("\nأخطاء:", fresh.errors);
