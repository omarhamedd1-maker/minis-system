"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readRememberedStore } from "@/lib/store-cookie";

/**
 * الخروج بيرجّعك لباب متجرك، مش لصفحة عامة.
 *
 * كوكي المتجر بتفضل بقصد — هي مش جلسة، هي بس اسم المتجر عشان الرجوع
 * يبقى لباب فيه اسمك.
 */
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const slug = await readRememberedStore();
  redirect(slug ? `/login/${slug}` : "/login");
}
