"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

// ===== استيراد تحويلات بوسطة من ملف المحفظة =====
// بوسطة مش بتسمح بالوصول للمحفظة من الـ API، فبنرفع الملف اللي بننزّله منها.
// بناخد بس حركات "Cash Out" (الفلوس اللي وصلتك) ونسجّلها إيداع في الخزنة،
// وبنمنع التكرار عن طريق جدول bosta_cashouts.
export async function importBostaCashouts(
  formData: FormData
): Promise<{ ok: boolean; added?: number; skipped?: number; error?: string }> {
  const me = await requirePermission("cash.edit");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "اختار الملف الأول" };
  }

  let rows: Record<string, unknown>[] = [];
  try {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });
  } catch {
    return { ok: false, error: "معرفناش نقرأ الملف — اتأكد إنه ملف بوسطة الأصلي" };
  }

  // تاريخ إكسل الرقمي لتاريخ عادي
  const toDate = (v: unknown): string | null => {
    if (typeof v === "number" && v > 20000) {
      return new Date(Math.round((v - 25569) * 86400 * 1000))
        .toISOString()
        .slice(0, 10);
    }
    const s = String(v ?? "").trim();
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  };

  const pick = (r: Record<string, unknown>, keys: string[]) => {
    for (const k of keys) {
      if (r[k] !== undefined && String(r[k]).trim() !== "") return r[k];
    }
    return "";
  };

  const supabase = createAdminClient();
  let added = 0;
  let skipped = 0;

  for (const r of rows) {
    const category = String(pick(r, ["Category", "category", "النوع"])).toLowerCase();
    if (!category.includes("cash out") && !category.includes("cashout")) continue;

    // رقم التحويل: بنفضّل Cashout ID وإلا رقم الحركة
    const cashoutId = String(
      pick(r, ["Cashout ID", "cashoutId", "Transactions ID", "id"])
    ).trim();
    if (!cashoutId) continue;

    const amount = Math.abs(
      Number(pick(r, ["Cashout Amount", "Amount", "amount"])) || 0
    );
    if (!amount) continue;

    const date =
      toDate(pick(r, ["Cashout Date", "Date", "date"])) ??
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

  if (added > 0) {
    await logActivity(
      me,
      "cash.import",
      `استورد ${added} تحويل من بوسطة للخزنة`
    );
  }
  revalidatePath("/cash");
  return { ok: true, added, skipped };
}

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

  const { error, count } = await supabase
    .from("cash_transactions")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("source_type", "manual");

  if (error || count === 0) {
    redirect(
      "/cash?error=" +
        encodeURIComponent("معرفناش نمسح الحركة — اتأكد إن عندك صلاحية تعديل")
    );
  }

  await logActivity(me, "cash.delete", "مسح حركة خزنة");
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
    direction,
    amount,
    source_type: "manual",
    description: description || null,
    transaction_date: transactionDate,
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
