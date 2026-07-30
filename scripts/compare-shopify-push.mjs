// ==========================================================================
// مقارنة دالة دفع شوبيفاي: القديمة (لوحة سوبابيز) بالجديدة (جوّه المشروع)
// --------------------------------------------------------------------------
// **مافيش أي كتابة عند شوبيفاي هنا.** الاتنين بيتشغّلوا في وضع التجربة بس:
// القديمة بـ`dry=1` (بتقف قبل orderEditBegin)، والجديدة بـ`dry: true`.
//
//   node scripts/compare-shopify-push.mjs           # كل الأوردرات المربوطة
//   node scripts/compare-shopify-push.mjs 30        # أحدث ٣٠ بس
//
// بيطلع تشغيلتين:
//
//   الأولى: القديمة ضد الجديدة **في وضع القديمة** (`legacy`).
//           المفروض تطابق ١٠٠٪ — دي اللي بتثبت إن النقل أمين.
//
//   التانية: وضع القديمة ضد الوضع الصح.
//           بتوريك بالظبط الأوردرات اللي التصليح بيغيّر فيها حاجة، وليه.
// ==========================================================================
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  changeCount,
  duplicatedVariants,
  planOrderPush,
  readShopLines,
} from "../lib/shopify/order-push-plan.ts";

const env = Object.fromEntries(
  fs
    .readFileSync("./.env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).replace(/^﻿/, "").trim(), l.slice(i + 1).trim()];
    })
);

const LIMIT = Number(process.argv[2]) || 0;
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------- أدوات

/** بنرتّب كل قايمة عشان ترتيب الصفوف مايتحسبش فرق */
function canon(plan) {
  const by = (k) => (a, b) => String(a[k]).localeCompare(String(b[k]));
  return {
    onlyQty: [...plan.onlyQty].sort(by("svid")).map((x) => `${x.svid}:${x.qty}`),
    priceFix: [...plan.priceFix]
      .sort(by("svid"))
      .map((x) => `${x.svid}:${x.target.toFixed(2)}@${x.base.toFixed(2)}`),
    toAdd: [...plan.toAdd]
      .sort(by("svid"))
      .map((x) => `${x.svid}:${x.qty}:${x.price.toFixed(2)}`),
    toRemove: [...plan.toRemove].sort(),
    cantRaise: [...plan.cantRaise]
      .sort(by("svid"))
      .map((x) => `${x.svid}:${x.system.toFixed(2)}@${x.base.toFixed(2)}`),
  };
}

/** رد الدالة القديمة بيجي على شكلين حسب فيه فرق ولا لأ */
function canonOld(body) {
  return canon({
    onlyQty: body.onlyQty ?? [],
    priceFix: body.priceFix ?? [],
    toAdd: body.toAdd ?? [],
    toRemove: body.toRemove ?? [],
    cantRaise: body.cantRaise ?? [],
  });
}

function diffOf(a, b) {
  const out = [];
  for (const key of ["onlyQty", "priceFix", "toAdd", "toRemove", "cantRaise"]) {
    const left = a[key].join(" , ");
    const right = b[key].join(" , ");
    if (left !== right) out.push(`${key}: [${left}] مقابل [${right}]`);
  }
  return out;
}

// ---------------------------------------------------------------- الداتا

let q = db
  .from("orders")
  .select(
    `id, order_number, discount, shopify_order_id, tenant_id, order_status,
     order_items(quantity, sale_price_at_order, product_variants(shopify_variant_id))`
  )
  .not("shopify_order_id", "like", "manual-%")
  .not("shopify_order_id", "like", "import-%")
  .order("order_date", { ascending: false });
if (LIMIT) q = q.limit(LIMIT);

const { data: orders, error } = await q;
if (error) throw new Error(error.message);

const { data: creds } = await db
  .from("tenant_credentials")
  .select("shopify_shop, shopify_access_token")
  .eq("tenant_id", orders[0].tenant_id)
  .maybeSingle();

async function shopLinesOf(shopifyOrderId) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(
      `https://${creds.shopify_shop}/admin/api/2026-07/graphql.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": creds.shopify_access_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `query($id: ID!){ order(id:$id){ cancelledAt lineItems(first:100){ nodes{
            id quantity currentQuantity variant{ legacyResourceId }
            originalUnitPriceSet{ shopMoney{ amount } }
            discountedUnitPriceSet{ shopMoney{ amount } } } } } }`,
          variables: { id: `gid://shopify/Order/${shopifyOrderId}` },
        }),
      }
    );
    const j = await res.json();
    if (j.errors) {
      if (JSON.stringify(j.errors).includes("THROTTLED")) {
        await new Promise((r) => setTimeout(r, 2500));
        continue;
      }
      return { error: JSON.stringify(j.errors).slice(0, 160) };
    }
    if (!j.data?.order) return { error: "شوبيفاي مالقتش الأوردر" };
    return {
      nodes: j.data.order.lineItems.nodes,
      cancelledAt: j.data.order.cancelledAt,
    };
  }
  return { error: "شوبيفاي رفضت من كتر الطلبات" };
}

async function oldDry(orderId) {
  const res = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/shopify-order-push` +
      `?key=${env.SYNC_KEY}&order=${orderId}&dry=1`
  );
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: null, raw: text.slice(0, 200) };
  }
}

// ---------------------------------------------------------------- المقارنة

const itemsOf = (o) =>
  (o.order_items ?? []).map((it) => ({
    shopifyVariantId: it.product_variants?.shopify_variant_id ?? null,
    quantity: Number(it.quantity),
    salePrice: Number(it.sale_price_at_order),
  }));

let same = 0;
const mismatches = [];
const failures = [];
const fixChanges = [];
const dupOrders = [];
const lies = [];
const skipped = [];

console.log(`بنقارن ${orders.length} أوردر — مافيش أي كتابة عند شوبيفاي\n`);

for (const o of orders) {
  const label = `أوردر ${o.order_number}`;

  const shop = await shopLinesOf(o.shopify_order_id);
  if (shop.error) {
    failures.push(`${label}: ${shop.error}`);
    continue;
  }

  const old = await oldDry(o.id);
  if (!old.body || (old.status !== 200 && old.status !== 400)) {
    failures.push(`${label}: القديمة ردّت ${old.status} — ${old.raw ?? ""}`);
    continue;
  }
  if (old.body.error) {
    failures.push(`${label}: القديمة قالت "${old.body.error}"`);
    continue;
  }

  const items = itemsOf(o);
  const discount = Number(o.discount ?? 0);

  const legacyPlan = planOrderPush(
    items,
    readShopLines(shop.nodes, { legacy: true }),
    discount
  );
  const fixedPlan = planOrderPush(items, readShopLines(shop.nodes), discount);

  // ١) القديمة ضد الجديدة في وضع القديمة
  const d = diffOf(canonOld(old.body), canon(legacyPlan));
  if (d.length === 0) same++;
  else mismatches.push({ label, lines: d });

  // ٢) وضع القديمة ضد الوضع الصح
  const d2 = diffOf(canon(legacyPlan), canon(fixedPlan));
  if (d2.length > 0) {
    fixChanges.push({
      label,
      lines: d2,
      before: changeCount(legacyPlan),
      after: changeCount(fixedPlan),
    });
  }

  if (duplicatedVariants(shop.nodes).length > 0) dupOrders.push(label);

  // الأوردر الملغي — الجديدة بتوقف قبل ما تلمسه خالص
  if (o.order_status === "cancelled" || shop.cancelledAt) {
    skipped.push(
      `${label}: ${o.order_status === "cancelled" ? "ملغي عندنا" : "ملغي عند شوبيفاي"}` +
        ` — القديمة كانت هتشوف ${changeCount(legacyPlan)} تغيير` +
        `، والوضع الصح ${changeCount(fixedPlan)}`
    );
  }

  // ٣) "مفيش فرق" وهي بتقول كده وفيه فرق مستحيل تنفيذه
  if (changeCount(legacyPlan) === 0 && legacyPlan.cantRaise.length > 0) {
    lies.push(
      `${label}: ${legacyPlan.cantRaise
        .map((c) => `عندنا ${c.system} وسعر الكتالوج ${c.base}`)
        .join(" ، ")}`
    );
  }
}

// ---------------------------------------------------------------- النتيجة

const line = "=".repeat(70);
console.log(line);
console.log("١) القديمة ضد الجديدة (وضع القديمة) — إثبات إن النقل أمين");
console.log(line);
console.log(`مطابق: ${same} من ${orders.length - failures.length}`);
if (mismatches.length) {
  console.log(`\nمختلف: ${mismatches.length}`);
  for (const m of mismatches) {
    console.log(`\n  ${m.label}`);
    for (const l of m.lines) console.log(`    ${l}`);
  }
} else {
  console.log("مفيش أي اختلاف.");
}

console.log(`\n${line}`);
console.log("٢) وضع القديمة ضد الوضع الصح — إيه اللي التصليح بيغيّره");
console.log(line);
if (fixChanges.length === 0) {
  console.log("مفيش فرق.");
} else {
  console.log(`اتغيّر في ${fixChanges.length} أوردر:\n`);
  for (const f of fixChanges) {
    console.log(`  ${f.label} — تغييرات القديمة ${f.before}، الصح ${f.after}`);
    for (const l of f.lines) console.log(`    ${l}`);
  }
}

console.log(`\n${line}`);
console.log("٣) مخاطر متلقّطة");
console.log(line);
console.log(`أوردرات فيها أكتر من بند لنفس المنتج (القديمة بتزوّد كمية): ${dupOrders.length}`);
if (dupOrders.length) console.log(`  ${dupOrders.join(" ، ")}`);
console.log(`\nأوردرات القديمة بتقول فيها "مفيش فرق" وفيه فرق: ${lies.length}`);
for (const l of lies) console.log(`  ${l}`);

console.log(`\nأوردرات ملغية — الجديدة بتوقف قبل ما تلمسها: ${skipped.length}`);
for (const s of skipped) console.log(`  ${s}`);

if (failures.length) {
  console.log(`\n${line}`);
  console.log(`أوردرات مقدرناش نقارنها: ${failures.length}`);
  console.log(line);
  for (const f of failures) console.log(`  ${f}`);
}
