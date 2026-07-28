// ==========================================================================
// دالة bosta-cashout — فلوس بوسطة اللي اتحوّلت لك تنزل الخزنة تلقائياً
// --------------------------------------------------------------------------
// اعمل دالة جديدة في Supabase اسمها bosta-cashout والصق الكود ده، و Verify JWT = OFF
//
// بتتنادى: GET /functions/v1/bosta-cashout?key=<BOSTA_WEBHOOK_KEY>
//          &dry=1 للتجربة من غير ما تسجّل حاجة
//
// بتعمل إيه: بتجيب معاملات محفظة بوسطة، وتاخد بس حركات "Cash Out"
// (اللي بوسطة حوّلتها لحسابك فعلاً)، وتسجّلها إيداع في الخزنة.
// بتستخدم جدول bosta_cashouts عشان نفس التحويل مايتسجّلش مرتين.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOSTA_API_KEY = Deno.env.get("BOSTA_API_KEY")!;
const GUARD_KEY = Deno.env.get("BOSTA_WEBHOOK_KEY") ?? "";
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// تاريخ إكسل/بوسطة الرقمي لتاريخ عادي
function toDate(v: unknown): string | null {
  if (typeof v === "number") {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v ?? "");
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (!GUARD_KEY || url.searchParams.get("key") !== GUARD_KEY) {
    return new Response("Unauthorized", { status: 401 });
  }
  const dry = url.searchParams.get("dry") === "1";
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b, null, 2), {
      status: s,
      headers: { "Content-Type": "application/json" },
    });

  const headers = {
    Authorization: BOSTA_API_KEY,
    "X-Requested-By": "minis",
    "Content-Type": "application/json",
  };

  // أول حاجة: بنحاول نعرف رقم الحساب (business id) — بعض المسارات محتاجاه
  let businessId = "";
  for (const p of [
    "https://app.bosta.co/api/v2/businesses/me",
    "https://app.bosta.co/api/v2/users/me",
    "https://app.bosta.co/api/v1/businesses/me",
  ]) {
    try {
      const r = await fetch(p, { headers });
      if (r.status !== 200) continue;
      const j = await r.json();
      businessId = String(
        j?.data?._id ?? j?.data?.businessId ?? j?.data?.business?._id ?? "",
      );
      if (businessId) break;
    } catch {
      // نكمّل
    }
  }

  // بنجيب معاملات المحفظة (بنجرب أكتر من مسار لأن بوسطة بتغيّرهم)
  const paths = [
    "https://app.bosta.co/api/v2/wallet/transactions?limit=200",
    "https://app.bosta.co/api/v2/businesses/wallet/transactions?limit=200",
    "https://app.bosta.co/api/v2/wallet/transactions?pageNumber=0&pageSize=200",
    "https://app.bosta.co/api/v2/wallet?limit=200",
    "https://app.bosta.co/api/v1/wallet/transactions?limit=200",
    ...(businessId
      ? [
          `https://app.bosta.co/api/v2/businesses/${businessId}/wallet/transactions?limit=200`,
          `https://app.bosta.co/api/v2/businesses/${businessId}/wallet?limit=200`,
          `https://app.bosta.co/api/v2/businesses/${businessId}/transactions?limit=200`,
        ]
      : []),
  ];

  // لو المستخدم عدّى مسار بنفسه: &path=<url>
  const custom = url.searchParams.get("path");
  if (custom) paths.unshift(custom);

  let rows: Record<string, unknown>[] = [];
  let usedPath = "";
  const attempts: { path: string; status: number | string; preview: string }[] = [];

  for (const p of paths) {
    try {
      const res = await fetch(p, { headers });
      const text = await res.text();
      attempts.push({
        path: p,
        status: res.status,
        preview: text.slice(0, 300),
      });
      if (res.status !== 200) continue;
      let j: unknown;
      try {
        j = JSON.parse(text);
      } catch {
        continue;
      }
      const o = j as Record<string, any>;
      const arr =
        o?.data?.transactions ??
        o?.data?.list ??
        o?.data?.items ??
        o?.transactions ??
        o?.list ??
        (Array.isArray(o?.data) ? o.data : []);
      if (Array.isArray(arr) && arr.length > 0) {
        rows = arr;
        usedPath = p;
        break;
      }
    } catch (e) {
      attempts.push({ path: p, status: "ERR", preview: String(e).slice(0, 200) });
    }
  }

  if (rows.length === 0) {
    return json(
      {
        ok: false,
        error:
          "معرفناش نجيب معاملات المحفظة من بوسطة. بص على attempts تحت وابعتهالي.",
        businessId: businessId || "(معرفناهوش)",
        attempts,
      },
      502,
    );
  }

  // بناخد بس حركات التحويل لحسابك
  const cashouts = rows.filter((r) => {
    const cat = String(r.category ?? r.type ?? r.Category ?? "").toLowerCase();
    return cat.includes("cash out") || cat.includes("cashout");
  });

  let added = 0, skipped = 0;
  const details: unknown[] = [];

  for (const r of cashouts) {
    const cashoutId = String(
      r.cashoutId ?? r["Cashout ID"] ?? r.id ?? r["Transactions ID"] ?? "",
    );
    if (!cashoutId) continue;

    // المبلغ: بيجي بالسالب (خارج من محفظة بوسطة) فبناخد قيمته المطلقة
    const amount = Math.abs(
      Number(r.cashoutAmount ?? r["Cashout Amount"] ?? r.amount ?? r.Amount ?? 0),
    );
    if (!amount) continue;

    const date =
      toDate(r.cashoutDate ?? r["Cashout Date"] ?? r.date ?? r.Date) ??
      new Date().toISOString().slice(0, 10);

    // اتسجّل قبل كده؟
    const { data: exists } = await supabase
      .from("bosta_cashouts")
      .select("id")
      .eq("cashout_id", cashoutId)
      .maybeSingle();
    if (exists) {
      skipped++;
      continue;
    }

    details.push({ cashoutId, amount, date });
    if (dry) {
      added++;
      continue;
    }

    // إيداع في الخزنة
    const { error: cashErr } = await supabase.from("cash_transactions").insert({
      direction: "in",
      amount,
      source_type: "manual",
      description: `تحويل من بوسطة (${cashoutId})`,
      transaction_date: date,
    });
    if (cashErr) continue;

    await supabase.from("bosta_cashouts").insert({
      cashout_id: cashoutId,
      amount,
      cashout_date: date,
    });
    added++;
  }

  return json({
    mode: dry ? "DRY RUN" : "تم التنفيذ",
    usedPath,
    fetched: rows.length,
    cashouts: cashouts.length,
    added,
    skipped,
    details: details.slice(0, 20),
  });
});
