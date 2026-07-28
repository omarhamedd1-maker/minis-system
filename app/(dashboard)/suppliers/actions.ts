"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

// ملاحظة مهمة عن الحسبة:
// فاتورة المورد (purchase) = بضاعة استلمتها ولسه ما دفعتهاش → بتزوّد اللي عليك، ومابتلمسش الخزنة.
// تكلفة البضاعة دي بتتحسب في ربح الأوردر نفسه (تكلفة المنتج)، فلو سجّلناها مصروف كمان
// هتتحسب مرتين. عشان كده الدفعة (payment) بتخصم من الخزنة بس — مش بتتسجل في المصاريف.

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function addSupplier(formData: FormData) {
  const me = await requirePermission("suppliers.edit");
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name) fail("/suppliers", "اكتب اسم المورد");

  const admin = createAdminClient();
  const { error } = await admin.from("suppliers").insert({
    name,
    phone: phone || null,
    notes: notes || null,
  });

  if (error) fail("/suppliers", "معرفناش نضيف المورد: " + error.message);

  await logActivity(me, "supplier.add", `ضاف مورد ${name}`);
  revalidatePath("/suppliers");
}

export async function updateSupplier(formData: FormData) {
  const me = await requirePermission("suppliers.edit");
  const id = String(formData.get("supplier_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!id || !name) fail(`/suppliers/${id}`, "اكتب اسم المورد");

  const admin = createAdminClient();
  const { error } = await admin
    .from("suppliers")
    .update({ name, phone: phone || null, notes: notes || null })
    .eq("id", id);

  if (error) fail(`/suppliers/${id}`, "معرفناش نعدل المورد: " + error.message);

  await logActivity(me, "supplier.edit", `عدّل بيانات المورد ${name}`);
  revalidatePath(`/suppliers/${id}`);
  revalidatePath("/suppliers");
}

export async function deleteSupplier(formData: FormData) {
  const me = await requirePermission("suppliers.edit");
  const id = String(formData.get("supplier_id") ?? "");
  if (!id) fail("/suppliers", "المورد ده مش موجود");

  const admin = createAdminClient();

  // بنشيل حركات الخزنة المربوطة بدفعات المورد الأول
  const { data: txns } = await admin
    .from("supplier_transactions")
    .select("related_cash_id")
    .eq("supplier_id", id)
    .overrideTypes<{ related_cash_id: string | null }[]>();

  const cashIds = (txns ?? [])
    .map((t) => t.related_cash_id)
    .filter((v): v is string => Boolean(v));
  if (cashIds.length > 0) {
    await admin.from("cash_transactions").delete().in("id", cashIds);
  }

  await admin.from("supplier_transactions").delete().eq("supplier_id", id);

  const { error } = await admin.from("suppliers").delete().eq("id", id);
  if (error) fail(`/suppliers/${id}`, "معرفناش نمسح المورد: " + error.message);

  await logActivity(me, "supplier.delete", "مسح مورد وكل حركاته");
  revalidatePath("/suppliers");
  redirect("/suppliers");
}

export async function addSupplierTransaction(formData: FormData) {
  const me = await requirePermission("suppliers.edit");
  const supplierId = String(formData.get("supplier_id") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const amount = Number(formData.get("amount"));
  const description = String(formData.get("description") ?? "").trim();
  const txnDate = String(formData.get("txn_date") ?? "");
  const hitCash = formData.get("hit_cash") === "on";
  const back = `/suppliers/${supplierId}`;

  if (
    !supplierId ||
    (kind !== "purchase" && kind !== "payment") ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !txnDate
  ) {
    fail(back, "اختار النوع واكتب مبلغ أكبر من صفر والتاريخ");
  }

  const admin = createAdminClient();

  const { data: supplier } = await admin
    .from("suppliers")
    .select("name")
    .eq("id", supplierId)
    .maybeSingle()
    .overrideTypes<{ name: string }>();

  // الدفعة بتطلع من الخزنة (لو اختار كده) — الفاتورة لأ، دي بس بتسجّل اللي عليك
  let cashId: string | null = null;
  if (kind === "payment" && hitCash) {
    const { data: cash, error: cashError } = await admin
      .from("cash_transactions")
      .insert({
        direction: "out",
        amount,
        source_type: "manual",
        description: `دفعة للمورد ${supplier?.name ?? ""}${
          description ? ` — ${description}` : ""
        }`.trim(),
        transaction_date: txnDate,
      })
      .select("id")
      .single();

    if (cashError || !cash) {
      fail(back, "معرفناش نخصم الدفعة من الخزنة: " + (cashError?.message ?? ""));
    }
    cashId = cash.id;
  }

  const { error } = await admin.from("supplier_transactions").insert({
    supplier_id: supplierId,
    kind,
    amount,
    description: description || null,
    txn_date: txnDate,
    related_cash_id: cashId,
  });

  if (error) {
    // لو الحركة فشلت بعد ما خصمنا من الخزنة، نرجّع الخصم عشان الأرقام تفضل مظبوطة
    if (cashId) await admin.from("cash_transactions").delete().eq("id", cashId);
    fail(back, "معرفناش نسجل الحركة: " + error.message);
  }

  await logActivity(
    me,
    kind === "purchase" ? "supplier.purchase" : "supplier.payment",
    `${kind === "purchase" ? "فاتورة" : "دفعة"} ${amount} للمورد ${supplier?.name ?? ""}`
  );
  revalidatePath(back);
  revalidatePath("/suppliers");
  revalidatePath("/cash");
}

export async function deleteSupplierTransaction(formData: FormData) {
  const me = await requirePermission("suppliers.edit");
  const id = String(formData.get("transaction_id") ?? "");
  const supplierId = String(formData.get("supplier_id") ?? "");
  const back = `/suppliers/${supplierId}`;
  if (!id) fail(back, "الحركة دي مش موجودة");

  const admin = createAdminClient();

  const { data: txn } = await admin
    .from("supplier_transactions")
    .select("related_cash_id")
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<{ related_cash_id: string | null }>();

  if (txn?.related_cash_id) {
    await admin.from("cash_transactions").delete().eq("id", txn.related_cash_id);
  }

  const { error } = await admin
    .from("supplier_transactions")
    .delete()
    .eq("id", id);

  if (error) fail(back, "معرفناش نمسح الحركة: " + error.message);

  await logActivity(me, "supplier.txn.delete", "مسح حركة مورد");
  revalidatePath(back);
  revalidatePath("/suppliers");
  revalidatePath("/cash");
}
