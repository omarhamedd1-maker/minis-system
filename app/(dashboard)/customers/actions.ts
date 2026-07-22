"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

export async function updateCustomer(formData: FormData) {
  const me = await requirePermission("customers.edit");
  const id = String(formData.get("customer_id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();

  if (!id || !fullName) {
    redirect(
      "/customers?error=" + encodeURIComponent("اسم العميل مينفعش يبقى فاضي")
    );
  }

  const supabase = createAdminClient();

  const { error, count } = await supabase
    .from("customers")
    .update(
      {
        full_name: fullName,
        phone: phone || null,
        address: address || null,
      },
      { count: "exact" }
    )
    .eq("id", id);

  if (error || count === 0) {
    redirect(
      `/customers/${id}?error=` +
        encodeURIComponent("معرفناش نعدل العميل — اتأكد إن عندك صلاحية تعديل")
    );
  }

  await logActivity(me, "customer.edit", `عدّل بيانات عميل ${fullName}`);
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  revalidatePath("/orders");
  redirect(`/customers/${id}?saved=1`);
}

export async function deleteCustomer(formData: FormData) {
  const me = await requirePermission("customers.edit");
  const id = String(formData.get("customer_id") ?? "");
  if (!id) {
    redirect("/customers");
  }

  const supabase = createAdminClient();

  // مينفعش نمسح عميل عليه أوردرات — التاريخ لازم يفضل سليم
  const { count: ordersCount } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", id);

  if ((ordersCount ?? 0) > 0) {
    redirect(
      "/customers?error=" +
        encodeURIComponent(
          "العميل ده عليه أوردرات مسجلة فمينفعش يتمسح — التاريخ لازم يفضل موجود"
        )
    );
  }

  const { error, count } = await supabase
    .from("customers")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error || count === 0) {
    redirect(
      "/customers?error=" +
        encodeURIComponent("معرفناش نمسح العميل — اتأكد إن عندك صلاحية تعديل")
    );
  }

  await logActivity(me, "customer.delete", "مسح عميل");
  revalidatePath("/customers");
  redirect("/customers?deleted=1");
}
