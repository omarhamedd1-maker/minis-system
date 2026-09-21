// ==========================================================================
// استقبال إيميل التحويل (TRANSFERS §٣ · §٤ · الخطوة ٥)
// --------------------------------------------------------------------------
// مزوّد البريد الوارد بينادي المسار ده لكل إيميل بيوصل على العنوان السري.
// الشكل بيختلف من مزوّد للتاني، فبنقرا **أي حقل بيشبه** اللي محتاجينه
// (`to` · `from` · `subject` · `html`/`text`) بدل ما نتقفل على واحد.
//
// ⚠️⚠️ **الحركة بتتعمل تلقائي للمطابق بس** (قرار عمر ٢١ سبتمبر · الخطوة ٧).
// «مطابق» معناها إن مجموع أوردرات حقيقية عندنا = مبلغ التحويل بالمليم —
// فالإيميل اتحقق من جوّه السيستم مش من شكله. واللي مايطابقش بيفضل مستني
// دوسة في التاب.
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
import { dkimPassed, fetchResendEmail, readInbound } from "@/lib/resend-inbound";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "الجسم مش JSON" }, { status: 400 });
  }

  const inbound = readInbound(body);
  const from = inbound.from;
  const subject = inbound.subject;

  // العنوان بتاعنا ممكن يكون في أكتر من حقل — أول واحد فيه مفتاح معروف
  let key: string | null = null;
  for (const address of inbound.to) {
    const k = keyFromAddress(address);
    if (k) { key = k; break; }
  }
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

  // ⚠️ **الويب هوك مابيبعتش الجسم** — بيتجاب بنداء تاني بمفتاح Resend
  let raw = inbound.body;
  let dkimOk: boolean | null = inbound.dkim ? /pass/i.test(inbound.dkim) : null;
  if (!raw && inbound.emailId) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "RESEND_API_KEY ناقص" }, { status: 500 });
    }
    try {
      const mail = await fetchResendEmail(inbound.emailId, apiKey);
      raw = mail.html || mail.text;
      dkimOk = dkimPassed(mail.headers);
    } catch (e) {
      await db.from("courier_payout_emails").insert({
        tenant_id: tenantId,
        from_address: from || null,
        subject: subject || null,
        parsed_ok: false,
        error: (e as Error).message,
      });
      return NextResponse.json({ error: "معرفناش نجيب محتوى الإيميل" }, { status: 502 });
    }
  }

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

  // ===== التسجيل التلقائي (الخطوة ٧ · قرار عمر ٢١ سبتمبر) =====
  //
  // ⚠️⚠️ **الحركة بتتعمل للمطابق بس.** المطابقة معناها إن مجموع أوردرات
  // حقيقية عندنا = مبلغ التحويل بالمليم، يعني الإيميل مش بس «وصل» — هو
  // اتحقق من جوّه السيستم. واللي مايطابقش بيفضل مستني دوسة.
  //
  // والحركة نوعها `payout` ومربوطة بالتحويل، فأي مراجعة بعدين بتعرف
  // مصدرها، والإلغاء بيمشي بالحركة العكسية زي أي حركة (MONEY §٦.٢).
  let cashId: string | null = null;
  if (match.ok && p.net > 0) {
    const { data: row, error: cashError } = await db
      .from("cash_transactions")
      .insert({
        // ⚠️ **tenant_id صريح** — مفتاح الأدمن بيعدّي فوق قواعد العزل
        tenant_id: tenantId,
        direction: "in",
        amount: p.net,
        source_type: "payout",
        description: `تحويل ${p.invoiceNumber}`,
        transaction_date: p.date,
        related_payout_id: payout.id as string,
        created_by_name: "إيميل التحويل",
        origin: "system",
      })
      .select("id")
      .single();
    if (!cashError && row) {
      cashId = row.id as string;
      await db
        .from("courier_payouts")
        .update({ cash_transaction_id: cashId, status: "confirmed" })
        .eq("tenant_id", tenantId)
        .eq("id", payout.id as string);
    } else {
      // الحركة فشلت؟ التحويل بيفضل مستني دوسة بدل ما يبان متأكّد وهو ناقص
      await db
        .from("courier_payouts")
        .update({
          status: "needs_review",
          review_reason: "الإيميل طابق بس الحركة مااتعملتش — دوس «اعمل حركة»",
        })
        .eq("tenant_id", tenantId)
        .eq("id", payout.id as string);
    }
  }

  await log({ parsed_ok: true, payout_id: payout.id as string });

  return NextResponse.json({
    ok: true,
    invoice: p.invoiceNumber,
    status: match.ok ? (cashId ? "confirmed" : "needs_review") : "needs_review",
    orders: match.ok ? match.orderIds.length : 0,
    cash: cashId ? p.net : 0,
  });
}
