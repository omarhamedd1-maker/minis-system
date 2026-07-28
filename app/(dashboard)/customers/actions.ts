"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

// حفظ عنوان العميل بتقسيمة بوسطة (مدينة/منطقة/شارع/عمارة/دور/شقة/علامة)
export async function updateCustomerAddress(formData: FormData) {
  const me = await requirePermission("customers.edit");
  const id = String(formData.get("customer_id") ?? "");
  if (!id) redirect("/customers");

  const get = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v || null;
  };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("customers")
    .update({
      city: get("city"),
      zone: get("zone"),
      street: get("street"),
      building: get("building"),
      floor: get("floor"),
      apartment: get("apartment"),
      landmark: get("landmark"),
    })
    .eq("id", id);

  if (error) {
    redirect(
      `/customers/${id}?error=` +
        encodeURIComponent("معرفناش نحفظ العنوان: " + error.message)
    );
  }

  await logActivity(me, "customer.address", "عدّل عنوان عميل");
  revalidatePath(`/customers/${id}`);
  revalidatePath("/orders");
}

// دمج عميلين مكررين: بننقل أوردرات العميل المكرر للأساسي وبنمسح المكرر
export async function mergeCustomers(formData: FormData) {
  const me = await requirePermission("customers.edit");
  const keepId = String(formData.get("keep_id") ?? "");
  // بنبعت كل أعضاء المجموعة، واللي هيتمسح = الكل ما عدا اللي اخترته
  const dropIds = formData
    .getAll("all_ids")
    .map(String)
    .filter((id) => id && id !== keepId);

  if (!keepId || dropIds.length === 0) {
    redirect(
      "/customers?error=" + encodeURIComponent("اختار العميل اللي تسيبه")
    );
  }

  const supabase = createAdminClient();

  const { data: keep } = await supabase
    .from("customers")
    .select("full_name, phone, address")
    .eq("id", keepId)
    .maybeSingle()
    .overrideTypes<{
      full_name: string | null;
      phone: string | null;
      address: string | null;
    }>();

  // ننقل الأوردرات للعميل الأساسي
  const { error: moveErr } = await supabase
    .from("orders")
    .update({ customer_id: keepId })
    .in("customer_id", dropIds);
  if (moveErr) {
    redirect(
      "/customers?error=" +
        encodeURIComponent("معرفناش ننقل الأوردرات: " + moveErr.message)
    );
  }

  // لو الأساسي ناقص بيانات، نكمّلها من المكرر
  if (!keep?.phone || !keep?.address) {
    const { data: donor } = await supabase
      .from("customers")
      .select("phone, address")
      .in("id", dropIds)
      .not("phone", "is", null)
      .limit(1)
      .maybeSingle()
      .overrideTypes<{ phone: string | null; address: string | null }>();
    if (donor) {
      await supabase
        .from("customers")
        .update({
          phone: keep?.phone || donor.phone,
          address: keep?.address || donor.address,
        })
        .eq("id", keepId);
    }
  }

  const { error: delErr } = await supabase
    .from("customers")
    .delete()
    .in("id", dropIds);
  if (delErr) {
    redirect(
      "/customers?error=" +
        encodeURIComponent(
          "الأوردرات اتنقلت بس معرفناش نمسح المكرر: " + delErr.message
        )
    );
  }

  await logActivity(
    me,
    "customer.merge",
    `دمج ${dropIds.length} عميل مكرر في ${keep?.full_name ?? ""}`.trim()
  );
  revalidatePath("/customers");
  revalidatePath("/orders");
  redirect("/customers?saved=1");
}

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
