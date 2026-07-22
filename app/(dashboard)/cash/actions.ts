"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

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
  redirect("/cash?saved=1");
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
  redirect("/cash?deleted=1");
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
  redirect("/cash?saved=1");
}
