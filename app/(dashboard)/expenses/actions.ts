"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

export async function updateExpense(formData: FormData) {
  const me = await requirePermission("expenses.edit");
  const id = String(formData.get("expense_id") ?? "");
  const category = String(formData.get("category") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const expenseDate = String(formData.get("expense_date") ?? "");

  if (
    !id ||
    !category ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !expenseDate
  ) {
    redirect(
      "/expenses?error=" +
        encodeURIComponent("اكتب النوع والمبلغ والتاريخ — والمبلغ لازم يكون أكبر من صفر")
    );
  }

  const supabase = createAdminClient();

  const { error: updateError, count } = await supabase
    .from("expenses")
    .update(
      {
        category,
        description: description || null,
        amount,
        expense_date: expenseDate,
      },
      { count: "exact" }
    )
    .eq("id", id);

  if (updateError || count === 0) {
    redirect(
      "/expenses?error=" +
        encodeURIComponent("معرفناش نعدل المصروف — اتأكد إن عندك صلاحية تعديل")
    );
  }

  const { error: cashError } = await supabase
    .from("cash_transactions")
    .update({ amount, transaction_date: expenseDate })
    .eq("related_expense_id", id);

  if (cashError) {
    redirect(
      "/expenses?error=" +
        encodeURIComponent(
          "المصروف اتعدل لكن معرفناش نحدث الخزنة: " + cashError.message
        )
    );
  }

  await logActivity(me, "expense.edit", `عدّل مصروف ${category} (${amount})`);
  revalidatePath("/expenses");
  redirect("/expenses?saved=1");
}

export async function deleteExpense(formData: FormData) {
  const me = await requirePermission("expenses.edit");
  const id = String(formData.get("expense_id") ?? "");
  if (!id) {
    redirect("/expenses?error=" + encodeURIComponent("المصروف ده مش موجود"));
  }

  const supabase = createAdminClient();

  // نمسح حركة الخزنة المرتبطة الأول عشان مفيش حركة تفضل من غير مصروف
  const { error: cashError } = await supabase
    .from("cash_transactions")
    .delete()
    .eq("related_expense_id", id);

  if (cashError) {
    redirect(
      "/expenses?error=" +
        encodeURIComponent("معرفناش نمسح حركة الخزنة: " + cashError.message)
    );
  }

  const { error: deleteError, count } = await supabase
    .from("expenses")
    .delete({ count: "exact" })
    .eq("id", id);

  if (deleteError || count === 0) {
    redirect(
      "/expenses?error=" +
        encodeURIComponent("معرفناش نمسح المصروف — اتأكد إن عندك صلاحية تعديل")
    );
  }

  await logActivity(me, "expense.delete", "مسح مصروف");
  revalidatePath("/expenses");
  redirect("/expenses?deleted=1");
}

export async function addExpense(formData: FormData) {
  const me = await requirePermission("expenses.edit");
  const category = String(formData.get("category") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const expenseDate = String(formData.get("expense_date") ?? "");

  if (!category || !Number.isFinite(amount) || amount <= 0 || !expenseDate) {
    redirect(
      "/expenses?error=" +
        encodeURIComponent("اكتب النوع والمبلغ والتاريخ — والمبلغ لازم يكون أكبر من صفر")
    );
  }

  const supabase = createAdminClient();

  const { data: expense, error: expenseError } = await supabase
    .from("expenses")
    .insert({
      category,
      description: description || null,
      amount,
      expense_date: expenseDate,
    })
    .select("id")
    .single();

  if (expenseError || !expense) {
    redirect(
      "/expenses?error=" +
        encodeURIComponent(
          "معرفناش نسجل المصروف — اتأكد إن عندك صلاحية تعديل"
        )
    );
  }

  const { error: cashError } = await supabase.from("cash_transactions").insert({
    direction: "out",
    amount,
    source_type: "expense",
    related_expense_id: expense.id,
    transaction_date: expenseDate,
  });

  if (cashError) {
    redirect(
      "/expenses?error=" +
        encodeURIComponent(
          "المصروف اتسجل لكن معرفناش نسجله في الخزنة: " + cashError.message
        )
    );
  }

  await logActivity(me, "expense.add", `سجّل مصروف ${category} بمبلغ ${amount}`);
  revalidatePath("/expenses");
  redirect("/expenses?saved=1");
}
