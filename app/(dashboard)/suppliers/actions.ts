"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { EXPENSE_CATEGORIES } from "@/lib/format";

// الحسبة زي ما عمر حددها:
//   الفاتورة (purchase)  = بضاعة استلمتها → بتتسجل مصروف في صفحة المصاريف،
//                          وبتزوّد اللي عليك للمورد. الخزنة مابتتأثرش دلوقتي
//                          لأن الفلوس لسه ماطلعتش.
//   الدفعة (payment)     = فلوس طلعت فعلاً → بتخصم من الخزنة وبتقلّل اللي عليك.
//   تكلفة المنتج (cost_price) رقم إرشادي بيبيّن ربح الأوردر — مالوش حركة فلوس.

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

type InvoiceItem = {
  variant_id: string | null;
  item_name: string;
  quantity: number;
  unit_cost: number;
};

// بنود الفاتورة بتتبعت كصفوف متوازية (اسم/كمية/سعر لكل صف)
function readInvoiceItems(formData: FormData): InvoiceItem[] {
  const names = formData.getAll("item_name").map(String);
  const variants = formData.getAll("item_variant").map(String);
  const quantities = formData.getAll("item_qty").map(String);
  const costs = formData.getAll("item_cost").map(String);

  const items: InvoiceItem[] = [];
  for (let i = 0; i < names.length; i++) {
    const name = (names[i] ?? "").trim();
    const quantity = Number(quantities[i]);
    const unitCost = Number(costs[i]);
    if (!name) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    if (!Number.isFinite(unitCost) || unitCost < 0) continue;
    items.push({
      variant_id: (variants[i] ?? "").trim() || null,
      item_name: name,
      quantity,
      unit_cost: unitCost,
    });
  }
  return items;
}

// بتزوّد (sign=1) أو بترجّع (sign=-1) كميات البنود في المخزون
async function applyStock(items: InvoiceItem[], sign: 1 | -1, reason: string) {
  const admin = createAdminClient();
  for (const item of items) {
    if (!item.variant_id) continue;

    const { data: variant } = await admin
      .from("product_variants")
      .select("quantity_on_hand")
      .eq("id", item.variant_id)
      .maybeSingle()
      .overrideTypes<{ quantity_on_hand: number }>();
    if (!variant) continue;

    const change = sign * item.quantity;
    const patch: Record<string, unknown> = {
      quantity_on_hand: Math.max(0, Number(variant.quantity_on_hand) + change),
    };
    // سعر الشرا الجديد هو التكلفة الحقيقية للمنتج من دلوقتي
    if (sign === 1 && item.unit_cost > 0) patch.cost_price = item.unit_cost;

    await admin.from("product_variants").update(patch).eq("id", item.variant_id);
    await admin.from("stock_movements").insert({
      variant_id: item.variant_id,
      change_quantity: change,
      reason,
    });
  }
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
  const rawCategory = String(formData.get("category") ?? "").trim();
  const category = EXPENSE_CATEGORIES.includes(rawCategory)
    ? rawCategory
    : "بضاعة";
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

  const supplierLabel = `مورد ${supplier?.name ?? ""}${
    description ? ` — ${description}` : ""
  }`.trim();

  // بنود الفاتورة: البضاعة اللي جِت بالظبط (صنف/كمية/سعر القطعة)
  const items = readInvoiceItems(formData);
  const itemsTotal = items.reduce((s, i) => s + i.quantity * i.unit_cost, 0);
  // لو كتب البنود، الإجمالي بيتحسب منها — مش من الخانة
  const finalAmount = kind === "purchase" && items.length > 0 ? itemsTotal : amount;
  const updateStock = formData.get("update_stock") === "on";

  if (finalAmount <= 0) fail(back, "الإجمالي لازم يكون أكبر من صفر");

  // الفاتورة بتتسجل مصروف (من غير حركة خزنة — الفلوس بتطلع وقت الدفعة)
  let expenseId: string | null = null;
  if (kind === "purchase") {
    const { data: expense, error: expenseError } = await admin
      .from("expenses")
      .insert({
        category,
        description: supplierLabel,
        amount: finalAmount,
        expense_date: txnDate,
        supplier_id: supplierId,
      })
      .select("id")
      .single();

    if (expenseError || !expense) {
      fail(back, "معرفناش نسجل الفاتورة في المصاريف: " + (expenseError?.message ?? ""));
    }
    expenseId = expense.id;
  }

  // الدفعة بتطلع من الخزنة (لو اختار كده)
  let cashId: string | null = null;
  if (kind === "payment" && hitCash) {
    const { data: cash, error: cashError } = await admin
      .from("cash_transactions")
      .insert({
        direction: "out",
        amount: finalAmount,
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

  const stockApplied = kind === "purchase" && updateStock && items.length > 0;

  const { data: txn, error } = await admin
    .from("supplier_transactions")
    .insert({
      supplier_id: supplierId,
      kind,
      amount: finalAmount,
      description: description || null,
      txn_date: txnDate,
      related_cash_id: cashId,
      related_expense_id: expenseId,
      stock_applied: stockApplied,
    })
    .select("id")
    .single();

  if (error || !txn) {
    // لو الحركة فشلت بعد ما لمسنا الخزنة أو المصاريف، نرجّع اللي عملناه
    if (cashId) await admin.from("cash_transactions").delete().eq("id", cashId);
    if (expenseId) await admin.from("expenses").delete().eq("id", expenseId);
    fail(back, "معرفناش نسجل الحركة: " + (error?.message ?? ""));
  }

  if (items.length > 0 && kind === "purchase") {
    const { error: itemsError } = await admin
      .from("supplier_invoice_items")
      .insert(items.map((i) => ({ ...i, transaction_id: txn.id })));

    if (itemsError) {
      await admin.from("supplier_transactions").delete().eq("id", txn.id);
      if (cashId) await admin.from("cash_transactions").delete().eq("id", cashId);
      if (expenseId) await admin.from("expenses").delete().eq("id", expenseId);
      fail(back, "معرفناش نسجل بنود الفاتورة: " + itemsError.message);
    }

    // البضاعة دخلت المخزن: بنزوّد الكمية ونحدّث تكلفة المنتج بسعر الشرا الجديد
    if (stockApplied) await applyStock(items, 1, "شراء من مورد");
  }

  await logActivity(
    me,
    kind === "purchase" ? "supplier.purchase" : "supplier.payment",
    `${kind === "purchase" ? "فاتورة" : "دفعة"} ${finalAmount} للمورد ${supplier?.name ?? ""}${
      items.length > 0 ? ` (${items.length} صنف)` : ""
    }`
  );
  revalidatePath("/products");
  revalidatePath("/expenses");
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
    .select(
      "related_cash_id, related_expense_id, stock_applied, supplier_invoice_items(variant_id, item_name, quantity, unit_cost)"
    )
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<{
      related_cash_id: string | null;
      related_expense_id: string | null;
      stock_applied: boolean | null;
      supplier_invoice_items: InvoiceItem[];
    }>();

  // بنرجّع كل أثر الحركة: المخزون، المصروف، حركة الخزنة
  if (txn?.stock_applied && txn.supplier_invoice_items?.length) {
    await applyStock(txn.supplier_invoice_items, -1, "إلغاء فاتورة مورد");
  }
  if (txn?.related_cash_id) {
    await admin.from("cash_transactions").delete().eq("id", txn.related_cash_id);
  }
  if (txn?.related_expense_id) {
    await admin
      .from("cash_transactions")
      .delete()
      .eq("related_expense_id", txn.related_expense_id);
    await admin.from("expenses").delete().eq("id", txn.related_expense_id);
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
