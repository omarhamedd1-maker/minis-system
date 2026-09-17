"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { cairoToday } from "@/lib/format";
import { auditFields, reverseCashRows } from "@/lib/cash-reversal";
import { OPENING, OPENING_LABEL, checkOpening } from "@/lib/cash-opening";

export async function updateCashTransaction(formData: FormData) {
  const me = await requirePermission("cash.edit");
  const id = String(formData.get("transaction_id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const amount = Number(formData.get("amount"));
  const description = String(formData.get("description") ?? "").trim();
  const transactionDate = String(formData.get("transaction_date") ?? "");

  if (
    !id ||
    (direction !== "in" && direction !== "out") ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !transactionDate
  ) {
    redirect(
      "/cash?error=" +
        encodeURIComponent("اختار النوع واكتب مبلغ أكبر من صفر والتاريخ")
    );
  }

  const supabase = createAdminClient();

  const { data: reversal } = await supabase
    .from("cash_transactions")
    .select("id")
    .eq("tenant_id", me.tenantId)
    .eq("reversal_of", id)
    .maybeSingle();
  if (reversal) {
    redirect(
      "/cash?error=" +
        encodeURIComponent("الحركة دي اتلغت — سجّل حركة جديدة بدل ما تعدّلها")
    );
  }

  // التعديل مسموح للحركات اليدوية بس — اللي جاية من مصروف أو أوردر بتتعدل من مكانها
  const { error, count } = await supabase
    .from("cash_transactions")
    .update(
      {
        direction,
        amount,
        description: description || null,
        transaction_date: transactionDate,
      },
      { count: "exact" }
    )
    .eq("tenant_id", me.tenantId)
    .eq("id", id)
    .eq("source_type", "manual");

  if (error || count === 0) {
    redirect(
      "/cash?error=" +
        encodeURIComponent("معرفناش نعدل الحركة — اتأكد إن عندك صلاحية تعديل")
    );
  }

  await logActivity(me, "cash.edit", `عدّل حركة خزنة (${direction === "in" ? "إيداع" : "سحب"} ${amount})`);
  revalidatePath("/cash");
}

export async function deleteCashTransaction(formData: FormData) {
  const me = await requirePermission("cash.edit");
  const id = String(formData.get("transaction_id") ?? "");
  if (!id) {
    redirect("/cash?error=" + encodeURIComponent("الحركة دي مش موجودة"));
  }

  const supabase = createAdminClient();

  // ⚠️ **مابنمسحش — بنلغي بحركة عكسية بتاريخ النهارده** (MONEY ٦.٢).
  // اليدوي بس — اللي جاي من مصروف أو أوردر بيتلغي من مكانه.
  const { data: row } = await supabase
    .from("cash_transactions")
    .select("id")
    .eq("tenant_id", me.tenantId)
    .eq("id", id)
    .eq("source_type", "manual")
    .maybeSingle();
  if (!row) {
    redirect("/cash?error=" + encodeURIComponent("الحركة دي مش موجودة أو مش يدوية"));
  }

  const result = await reverseCashRows(supabase, me.tenantId, [id], me, cairoToday());
  if (result.error) {
    redirect("/cash?error=" + encodeURIComponent("معرفناش نلغي الحركة: " + result.error));
  }
  if (result.reversed === 0) {
    redirect("/cash?error=" + encodeURIComponent("الحركة دي اتلغت قبل كده"));
  }

  await logActivity(me, "cash.reverse", "لغى حركة خزنة بحركة عكسية");
  revalidatePath("/cash");
}

export async function addCashTransaction(formData: FormData) {
  const me = await requirePermission("cash.edit");
  const direction = String(formData.get("direction") ?? "");
  const amount = Number(formData.get("amount"));
  const description = String(formData.get("description") ?? "").trim();
  const transactionDate = String(formData.get("transaction_date") ?? "");

  if (
    (direction !== "in" && direction !== "out") ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !transactionDate
  ) {
    redirect(
      "/cash?error=" +
        encodeURIComponent("اختار النوع واكتب مبلغ أكبر من صفر والتاريخ")
    );
  }

  const supabase = createAdminClient();

  const { error } = await supabase.from("cash_transactions").insert({
    // ⚠️ **مش زيادة** — مفتاح الأدمن مالوش مستخدم داخل، والقيمة الافتراضية
    // في الداتابيز بترجّع **مينيز**. يعني خزنة أي بيزنس تاني كانت بتتخلط
    // بخزنة عمر. اقرا `sql/tenants-02-auto-fill.sql`.
    tenant_id: me.tenantId,
    direction,
    amount,
    source_type: "manual",
    description: description || null,
    transaction_date: transactionDate,
    ...auditFields(me, "app"),
  });

  if (error) {
    redirect(
      "/cash?error=" +
        encodeURIComponent(
          "معرفناش نسجل الحركة — اتأكد إن عندك صلاحية تعديل: " + error.message
        )
    );
  }

  await logActivity(me, "cash.add", `${direction === "in" ? "إيداع" : "سحب"} خزنة بمبلغ ${amount}`);
  revalidatePath("/cash");
}

/**
 * الرصيد الافتتاحي — بيتسجّل أول مرة وبيتعدّل في مكانه (`lib/cash-opening.ts`).
 */
export async function setOpeningBalance(formData: FormData) {
  const me = await requirePermission("cash.edit");
  const supabase = createAdminClient();
  const back = (msg: string) =>
    redirect("/cash?tab=moves&error=" + encodeURIComponent(msg));

  const [{ data: current }, { data: first }] = await Promise.all([
    supabase
      .from("cash_transactions")
      .select("id, amount, transaction_date")
      .eq("tenant_id", me.tenantId)
      .eq("source_type", OPENING)
      .maybeSingle(),
    supabase
      .from("cash_transactions")
      .select("transaction_date")
      .eq("tenant_id", me.tenantId)
      .neq("source_type", OPENING)
      .order("transaction_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const check = checkOpening({
    amount: formData.get("amount"),
    date: formData.get("transaction_date"),
    firstMoveDate: first?.transaction_date as string | undefined,
  });
  if (!check.ok) return back(check.error);

  if (current) {
    const { error } = await supabase
      .from("cash_transactions")
      .update({ amount: check.amount, transaction_date: check.date })
      .eq("tenant_id", me.tenantId)
      .eq("id", current.id);
    if (error) return back("معرفناش نعدّل الرصيد الافتتاحي: " + error.message);
    // ⚠️ بيتعدّل في مكانه — فالقيمة القديمة لازم تفضل مكتوبة في مكان
    await logActivity(
      me,
      "cash.opening",
      `عدّل الرصيد الافتتاحي من ${current.amount} (${String(current.transaction_date).slice(0, 10)}) لـ${check.amount} (${check.date})`
    );
  } else {
    const { error } = await supabase.from("cash_transactions").insert({
      tenant_id: me.tenantId,
      direction: "in",
      amount: check.amount,
      source_type: OPENING,
      description: OPENING_LABEL,
      transaction_date: check.date,
      ...auditFields(me, "app"),
    });
    if (error) return back("معرفناش نسجّل الرصيد الافتتاحي: " + error.message);
    await logActivity(me, "cash.opening", `سجّل رصيد افتتاحي ${check.amount} (${check.date})`);
  }

  revalidatePath("/cash");
  redirect("/cash?tab=moves&saved=opening");
}
