import { redirect } from "next/navigation";
import { expensesRedirectPath } from "@/lib/money-tabs";

/**
 * ⚠️ **المصاريف بقت تاب في `/cash`** (قرار عمر، ١٦ سبتمبر).
 * الصفحة دي بتفضل عشان اللينكات القديمة — المحفوظة والمبعوتة — ماتتكسرش،
 * وبتنقل **كل** الباراميترات زي ما هي (الفترة · النوع · رسايل الحفظ).
 */
export default async function ExpensesRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(expensesRedirectPath(await searchParams));
}
