"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
