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
    <tr className="border-b border-line last:border-0 hover:bg-sunken">
      <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
      <td className="px-4 py-3 text-ink-body" dir="ltr">
        {row.phone ?? "—"}
      </td>
      <td className="max-w-48 truncate px-4 py-3 text-ink-body">
        {row.address ?? "—"}
      </td>
      <td className="px-4 py-3 text-ink-body">{row.ordersCount}</td>
      <td className="px-4 py-3 font-medium text-ink">
        {formatMoney(row.total)}
      </td>
      <td className="px-4 py-3 text-ink-body">{formatDate(row.lastOrderDate)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/customers/${row.id}`}
            className="rounded-control bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary-dark"
          >
            صفحته
          </Link>
          <Link
            href={`/orders?q=${encodeURIComponent(row.phone ?? row.name)}`}
            className="rounded-control bg-sunken px-3 py-1 text-xs font-medium text-ink-body hover:bg-line"
          >
            أوردراته
          </Link>
        </div>
      </td>
    </tr>
  );
}
