import Link from "next/link";
import { formatDate, formatMoney } from "@/lib/format";

type Row = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  ordersCount: number;
  total: number;
  lastOrderDate: string | null;
};

export function CustomerRow({ row }: { row: Row }) {
  return (
    <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
      <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
      <td className="px-4 py-3 text-gray-700" dir="ltr">
        {row.phone ?? "—"}
      </td>
      <td className="max-w-48 truncate px-4 py-3 text-gray-700">
        {row.address ?? "—"}
      </td>
      <td className="px-4 py-3 text-gray-700">{row.ordersCount}</td>
      <td className="px-4 py-3 font-medium text-gray-900">
        {formatMoney(row.total)}
      </td>
      <td className="px-4 py-3 text-gray-700">{formatDate(row.lastOrderDate)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/customers/${row.id}`}
            className="rounded-lg bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700"
          >
            صفحته
          </Link>
          <Link
            href={`/orders?q=${encodeURIComponent(row.phone ?? row.name)}`}
            className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            أوردراته
          </Link>
        </div>
      </td>
    </tr>
  );
}
