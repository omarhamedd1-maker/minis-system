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
    .eq("tenant_id", me.tenantId)
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
    .eq("tenant_id", me.tenantId)
    .eq("related_expense_id", id);

  if (cashError) {
    redirect(
      "/expenses?error=" +
        encodeURIComponent(
          "المصروف اتعدل لكن معرفناش نحدث الخزنة: " + cashError.message
        )
    );
  }

  // لو المصروف مربوط بمورد، حسابه لازم يتحدّث بنفس المبلغ والتاريخ
  await supabase
    .from("supplier_transactions")
    .update({
      amount,
      txn_date: expenseDate,
      description: description || category,
    })
    .eq("tenant_id", me.tenantId)
    .eq("related_expense_id", id);

  await logActivity(me, "expense.edit", `عدّل مصروف ${category} (${amount})`);
  revalidatePath("/expenses");
  revalidatePath("/suppliers");
}

export async function deleteExpense(formData: FormData) {
  const me = await requirePermission("expenses.edit");
  const id = String(formData.get("expense_id") ?? "");
  if (!id) {
    redirect("/expenses?error=" + encodeURIComponent("المصروف ده مش موجود"));
  }

  const supabase = createAdminClient();

  // لو المصروف كان فاتورة مورد، بنشيلها من حسابه كمان
  await supabase
    .from("supplier_transactions")
    .delete()
    .eq("tenant_id", me.tenantId)
    .eq("related_expense_id", id);

  // نمسح حركة الخزنة المرتبطة الأول عشان مفيش حركة تفضل من غير مصروف
  const { error: cashError } = await supabase
    .from("cash_transactions")
    .delete()
    .eq("tenant_id", me.tenantId)
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
    .eq("tenant_id", me.tenantId)
    .eq("id", id);

  if (deleteError || count === 0) {
    redirect(
      "/expenses?error=" +
        encodeURIComponent("معرفناش نمسح المصروف — اتأكد إن عندك صلاحية تعديل")
    );
  }

  await logActivity(me, "expense.delete", "مسح مصروف");
  revalidatePath("/expenses");
  revalidatePath("/suppliers");
}

export async function addExpense(formData: FormData) {
  const me = await requirePermission("expenses.edit");
  const category = String(formData.get("category") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const expenseDate = String(formData.get("expense_date") ?? "");
  const supplierId = String(formData.get("supplier_id") ?? "").trim() || null;

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
      // ⚠️ **مش زيادة** — من غيرها المصروف بينزل عند **مينيز**، لأن مفتاح
      // الأدمن مالوش مستخدم والقيمة الافتراضية بترجّع بيزنس عمر.
      tenant_id: me.tenantId,
      category,
      description: description || null,
      amount,
      expense_date: expenseDate,
      supplier_id: supplierId,
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

  // مصروف على مورد = فلوس دفعتها له، فبتتسجل دفعة في حسابه وبتقلّل اللي عليك.
  // (فواتير البضاعة بالأجل بتتسجل من صفحة المورد نفسه ومابتتحسبش مصروف)
  if (supplierId) {
    const { error: txnError } = await supabase
      .from("supplier_transactions")
      .insert({
        tenant_id: me.tenantId,
        supplier_id: supplierId,
        kind: "payment",
        amount,
        description: description || category,
        txn_date: expenseDate,
        related_expense_id: expense.id,
      });

    if (txnError) {
      await supabase.from("expenses").delete().eq("tenant_id", me.tenantId).eq("id", expense.id);
      redirect(
        "/expenses?error=" +
          encodeURIComponent(
            "معرفناش نسجل الدفعة في حساب المورد: " + txnError.message
          )
      );
    }
  }

  const { error: cashError } = await supabase.from("cash_transactions").insert({
    tenant_id: me.tenantId,
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
  revalidatePath("/suppliers");
}
