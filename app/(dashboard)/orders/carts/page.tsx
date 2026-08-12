import { BackLink } from "@/components/BackLink";
import { AbandonedCarts } from "@/components/AbandonedCarts";
import { requirePagePermission } from "@/lib/permissions";
import { loadAbandonedCarts } from "./actions";

export const dynamic = "force-dynamic";

export default async function CartsPage() {
  await requirePagePermission("orders.view");

  return (
    <div className="space-y-4">
      <BackLink href="/orders" label="الأوردرات" />
      <h1 className="text-2xl font-bold text-gray-900">السلات المتروكة</h1>
      <AbandonedCarts action={loadAbandonedCarts} />
    </div>
  );
}
