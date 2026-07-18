export function formatMoney(amount: number) {
  return (
    new Intl.NumberFormat("en-EG", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    }).format(amount) + " جنيه"
  );
}

export function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const ORDER_STATUS_LABELS: Record<string, { label: string; className: string }> =
  {
    new: { label: "جديد", className: "bg-blue-50 text-blue-700" },
    confirmed: { label: "مؤكد", className: "bg-sky-50 text-sky-700" },
    packed: { label: "تم التغليف", className: "bg-purple-50 text-purple-700" },
    shipped: { label: "تم الشحن", className: "bg-indigo-50 text-indigo-700" },
    delivered: { label: "تم التسليم", className: "bg-green-50 text-green-700" },
    cancelled: { label: "ملغي", className: "bg-red-50 text-red-700" },
    returned: { label: "مرتجع", className: "bg-orange-50 text-orange-700" },
  };

export const ORDER_STATUS_OPTIONS = Object.entries(ORDER_STATUS_LABELS).map(
  ([value, { label }]) => ({ value, label })
);

export const COST_COMPONENTS = [
  "ستانليس",
  "خشب",
  "حديد",
  "زجاج",
  "رخام",
  "دهان",
  "أخرى",
] as const;

export function orderStatusBadge(status: string | null) {
  if (!status) {
    return { label: "غير محدد", className: "bg-gray-100 text-gray-600" };
  }
  return (
    ORDER_STATUS_LABELS[status.toLowerCase()] ?? {
      label: status,
      className: "bg-gray-100 text-gray-600",
    }
  );
}
