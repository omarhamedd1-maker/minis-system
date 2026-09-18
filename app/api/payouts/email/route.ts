// ==========================================================================
// استقبال إيميل التحويل (TRANSFERS §٣ · §٤ · الخطوة ٥)
// --------------------------------------------------------------------------
// مزوّد البريد الوارد بينادي المسار ده لكل إيميل بيوصل على العنوان السري.
// الشكل بيختلف من مزوّد للتاني، فبنقرا **أي حقل بيشبه** اللي محتاجينه
// (`to` · `from` · `subject` · `html`/`text`) بدل ما نتقفل على واحد.
//
// ⛔⛔ **مفيش حركة خزنة بتتعمل هنا.** الإيميل بيتسجّل، والتحويل بيتقيّد
// بحالته (`matched` أو `needs_review`) — وتسجيل الفلوس تلقائي **مستني
// قرار عمر** (§١٢ · الخطوة ٧).
//
// الطبقات (§٤):
//   ١. العنوان سري — المفتاح بيحدد البيزنس، واللي مالوش مفتاح بيترفض.
//   ٢. توقيع بوسطة (`DKIM`) بيتسجّل — ⚠️ **مش `SPF`**: الإيميل محوّل من
//      جيميل صاحب المتجر، فـSPF بيتحقق للمُحوِّل مش لبوسطة.
//   ٣. المطابقة شرط — اللي مايطابقش بيبقى «محتاج مراجعة» مش حركة.
//   ٤. رقم الفاتورة فريد — التكرار بيتعدّى.
//   ٥. كل إيميل بيتسجّل كامل، حتى المرفوض.
// ==========================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { keyFromAddress } from "@/lib/payout-address";
import { parsePayoutEmail } from "@/lib/payout-email";
import { matchPayout } from "@/lib/payout-match";
import { allRows } from "@/lib/fetch-all-pages";

export const dynamic = "force-dynamic";

/** المزوّدين بيسمّوا الحقول بأسامي مختلفة — بناخد أول واحد موجود */
function pick(body: Record<string, unknown>, names: string[]): string {
  for (const n of names) {
    const v = n.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], body);
    if (typeof v === "string" && v.trim()) return v;
    if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  }
  return "";
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "الجسم مش JSON" }, { status: 400 });
  }

  const to = pick(body, ["to", "To", "recipient", "envelope.to", "headers.to"]);
  const from = pick(body, ["from", "From", "sender", "envelope.from", "headers.from"]);
  const subject = pick(body, ["subject", "Subject", "headers.subject"]);
  const raw = pick(body, ["html", "html_body", "body-html", "text", "text_body", "body-plain", "body"]);
  const dkim = pick(body, ["dkim", "dkim_result", "authentication.dkim"]);

  const key = keyFromAddress(to);
  const db = createAdminClient();

  // ⚠️ **المفتاح هو اللي بيحدد البيزنس** — من غيره مفيش مكان نسجّل فيه أصلًا
  if (!key) return NextResponse.json({ error: "العنوان مش معروف" }, { status: 404 });

  const { data: cred } = await db
    .from("tenant_credentials")
    .select("tenant_id")
    .eq("payout_email_key", key)
    .maybeSingle();
  const tenantId = (cred?.tenant_id as string | undefined) ?? null;
  if (!tenantId) return NextResponse.json({ error: "العنوان مش معروف" }, { status: 404 });

  const dkimOk = /pass/i.test(dkim) || null;
  const parsed = parsePayoutEmail(raw);

  const log = async (fields: Record<string, unknown>) => {
    // ⚠️ **الإيميل بيتسجّل حتى لو اترفض** — من غير السجل، اللي مااشتغلش
    // مالوش أثر ومحدش يعرف إنه جه
    await db.from("courier_payout_emails").insert({
      // ⚠️ **tenant_id صريح** — مفتاح الأدمن بيعدّي فوق قواعد العزل
      tenant_id: tenantId,
      from_address: from || null,
      subject: subject || null,
      dkim_ok: dkimOk,
      raw: raw.slice(0, 20_000),
      ...fields,
    });
  };

  if (!parsed.ok) {
    await log({ parsed_ok: false, error: parsed.reason });
    return NextResponse.json({ ok: true, skipped: parsed.reason });
  }
  const p = parsed.payout;

  // ⚠️ رقم الفاتورة مايتكررش — الإيميل المعاد أو المتكرر مايعملش تحويل تاني
  const { data: already } = await db
    .from("courier_payouts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("invoice_number", p.invoiceNumber)
    .maybeSingle();
  if (already) {
    await log({ parsed_ok: true, payout_id: already.id as string, error: "متسجّل قبل كده" });
    return NextResponse.json({ ok: true, duplicate: p.invoiceNumber });
  }

  // المطابقة بالأوردرات — **السماح صفر هنا**، الإيميل بيدّي الرقم الصحيح
  const [{ data: orders }, { data: linked }] = await Promise.all([
    allRows(db
      .from("orders")
      .select("id, bosta_cod, delivered_at")
      .eq("tenant_id", tenantId)
      .eq("order_status", "delivered")
      .overrideTypes<{ id: string; bosta_cod: number | null; delivered_at: string | null }[]>()),
    allRows(db
      .from("courier_payout_orders")
      .select("order_id")
      .eq("tenant_id", tenantId)
      .overrideTypes<{ order_id: string }[]>()),
  ]);
  const taken = new Set((linked ?? []).map((r) => r.order_id));
  const match = matchPayout(
    { gross: p.gross, count: p.orderCount, date: p.date },
    (orders ?? [])
      .filter((o) => !taken.has(o.id))
      .map((o) => ({ orderId: o.id, cod: Number(o.bosta_cod ?? 0), deliveredAt: o.delivered_at }))
  );

  const { data: payout, error } = await db
    .from("courier_payouts")
    .insert({
      // ⚠️ **tenant_id صريح** — مفتاح الأدمن بيعدّي فوق قواعد العزل
      tenant_id: tenantId,
      courier: "bosta",
      invoice_number: p.invoiceNumber,
      payout_date: p.date,
      gross_amount: p.gross,
      fees_amount: p.fees,
      net_amount: p.net,
      order_count: p.orderCount,
      status: match.ok ? "matched" : "needs_review",
      review_reason: match.ok ? null : match.reason,
      // ⚠️ النافذة الزمنية نتيجتها **مرجّحة** مش مؤكدة
      match_confidence: match.ok ? (match.how === "window" ? "likely" : "exact") : null,
      source: "email",
      created_by_name: "إيميل التحويل",
    })
    .select("id")
    .single();

  if (error || !payout) {
    await log({ parsed_ok: true, error: "معرفناش نسجّل التحويل: " + (error?.message ?? "") });
    return NextResponse.json({ error: "معرفناش نسجّل التحويل" }, { status: 500 });
  }

  if (match.ok && match.orderIds.length > 0) {
    const codOf = new Map((orders ?? []).map((o) => [o.id, Number(o.bosta_cod ?? 0)]));
    const gross = p.gross || 1;
    const links = match.orderIds.map((orderId) => ({
      payout_id: payout.id as string,
      order_id: orderId,
      cod_amount: codOf.get(orderId) ?? 0,
      fee_amount: Math.round(((p.fees * (codOf.get(orderId) ?? 0)) / gross) * 100) / 100,
    }));
    // ⚠️ **tenant_id صريح** — مفتاح الأدمن بيعدّي فوق قواعد العزل
    await db
      .from("courier_payout_orders")
      .insert(links.map((l) => ({ tenant_id: tenantId, ...l })));
    await db
      .from("orders")
      .update({ cash_received_at: p.date })
      .eq("tenant_id", tenantId)
      .in("id", match.orderIds);
  }

  await log({ parsed_ok: true, payout_id: payout.id as string });

  // ⛔ **مفيش حركة خزنة** — التسجيل التلقائي مستني قرار عمر (§١٢ · الخطوة ٧)
  return NextResponse.json({
    ok: true,
    invoice: p.invoiceNumber,
    status: match.ok ? "matched" : "needs_review",
    orders: match.ok ? match.orderIds.length : 0,
  });
}
