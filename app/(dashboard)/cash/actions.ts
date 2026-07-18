"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updateCashTransaction(formData: FormData) {
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

  const supabase = await createClient();

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

  revalidatePath("/cash");
  redirect("/cash?saved=1");
}

export async function deleteCashTransaction(formData: FormData) {
  const id = String(formData.get("transaction_id") ?? "");
  if (!id) {
    redirect("/cash?error=" + encodeURIComponent("الحركة دي مش موجودة"));
  }

  const supabase = await createClient();

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

  revalidatePath("/cash");
  redirect("/cash?deleted=1");
}

export async function addCashTransaction(formData: FormData) {
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

  const supabase = await createClient();

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

  revalidatePath("/cash");
  redirect("/cash?saved=1");
}
