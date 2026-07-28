"use client";

import { useState } from "react";

export type AddressFields = {
  city: string | null;
  zone: string | null;
  street: string | null;
  building: string | null;
  floor: string | null;
  apartment: string | null;
  landmark: string | null;
  address: string | null; // العنوان القديم كنص واحد (من شوبيفاي)
};

// بيجمّع العنوان المقسّم في سطر واحد — ده اللي بيتبعت لبوسطة
export function joinAddress(a: AddressFields): string {
  const parts = [
    a.street,
    a.building ? `عمارة ${a.building}` : null,
    a.floor ? `الدور ${a.floor}` : null,
    a.apartment ? `شقة ${a.apartment}` : null,
    a.landmark ? `علامة: ${a.landmark}` : null,
    a.zone,
    a.city,
  ].filter((p) => p && String(p).trim());
  return parts.length > 0 ? parts.join(" — ") : (a.address ?? "");
}

// محافظات ومدن مصر — بنستخدمها نطلع المدينة من نص العنوان الحر
const EG_CITIES = [
  "القاهرة",
  "الجيزة",
  "الاسكندرية",
  "الإسكندرية",
  "القليوبية",
  "الشرقية",
  "الغربية",
  "المنوفية",
  "الدقهلية",
  "البحيرة",
  "كفر الشيخ",
  "دمياط",
  "بورسعيد",
  "الإسماعيلية",
  "الاسماعيلية",
  "السويس",
  "شمال سيناء",
  "جنوب سيناء",
  "بني سويف",
  "الفيوم",
  "المنيا",
  "أسيوط",
  "اسيوط",
  "سوهاج",
  "قنا",
  "الأقصر",
  "الاقصر",
  "أسوان",
  "اسوان",
  "البحر الأحمر",
  "الوادي الجديد",
  "مطروح",
];

// بنقسّم العنوان الحر (اللي جاي من شوبيفاي) لمدينة ومنطقة وباقي التفاصيل
export function splitAddress(raw: string | null): {
  city: string;
  zone: string;
  street: string;
} {
  const text = (raw ?? "").trim();
  if (!text) return { city: "", zone: "", street: "" };

  // بنقسّم على الفواصل الشائعة
  const parts = text
    .split(/[,،\-|/\n]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  let city = "";
  let cityIdx = -1;
  // بندوّر على اسم محافظة جوّه أي جزء
  for (let i = 0; i < parts.length; i++) {
    const hit = EG_CITIES.find((c) => parts[i].includes(c));
    if (hit) {
      city = hit;
      cityIdx = i;
      break;
    }
  }

  const rest = parts.filter((_, i) => i !== cityIdx);
  // آخر جزء متبقي عادةً بيكون المنطقة، والباقي تفاصيل الشارع
  const zone = rest.length > 1 ? rest[rest.length - 1] : "";
  const street = (zone ? rest.slice(0, -1) : rest).join(" — ");

  return { city, zone, street };
}

// خانة عنوان واحدة — برة الرندر عشان مايتعملش كومبوننت جديد كل مرة
function Box({
  name,
  label,
  value,
  placeholder,
}: {
  name: string;
  label: string;
  value: string | null;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500">{label}</label>
      <input
        name={name}
        defaultValue={value ?? ""}
        placeholder={placeholder}
        className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
      />
    </div>
  );
}

// عنوان العميل بتقسيمة بوسطة — كل خانة لوحدها عشان الشحنة تبقى واضحة
export function CustomerAddress({
  customerId,
  fields,
  canEdit,
  updateAction,
}: {
  customerId: string;
  fields: AddressFields;
  canEdit: boolean;
  updateAction: (fd: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const joined = joinAddress(fields);
  const isSplit = Boolean(fields.city || fields.zone || fields.street);
  // لو لسه مش مقسّم، بنقسّم النص الحر تلقائياً ونحطه كقيم مبدئية
  const auto = splitAddress(fields.address);
  const f = isSplit
    ? fields
    : {
        ...fields,
        city: auto.city || null,
        zone: auto.zone || null,
        street: auto.street || null,
      };

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-gray-900">العنوان</h2>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700"
          >
            تعديل
          </button>
        )}
      </div>

      {!editing ? (
        <>
          <p className="text-sm text-gray-800">{joined || "مفيش عنوان"}</p>
          {!isSplit && joined && (
            <p className="mt-1 text-xs text-amber-700">
              العنوان ده نص واحد جاي من شوبيفاي — دوس تعديل، هنقسّمه لك تلقائياً
              وتراجعه وتحفظ.
            </p>
          )}
        </>
      ) : (
        <form
          action={async (fd) => {
            await updateAction(fd);
            setEditing(false);
          }}
          className="space-y-3"
        >
          <input type="hidden" name="customer_id" value={customerId} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Box name="city" label="المدينة / المحافظة" value={f.city} placeholder="القاهرة" />
            <Box name="zone" label="المنطقة" value={f.zone} placeholder="مدينة نصر" />
          </div>
          <Box
            name="street"
            label="الشارع"
            value={f.street}
            placeholder="شارع عباس العقاد"
          />
          <div className="grid grid-cols-3 gap-2">
            <Box name="building" label="العمارة" value={fields.building} />
            <Box name="floor" label="الدور" value={fields.floor} />
            <Box name="apartment" label="الشقة" value={fields.apartment} />
          </div>
          <Box
            name="landmark"
            label="علامة مميزة (اختياري)"
            value={fields.landmark}
            placeholder="جنب صيدلية العزبي"
          />
          {/* العنوان القديم بنسيبه عشان مانخسرش بيانات */}
          <input type="hidden" name="address" value={fields.address ?? ""} />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white"
            >
              حفظ العنوان
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-700"
            >
              إلغاء
            </button>
          </div>
          {fields.address && (
            <p className="text-xs text-gray-400">
              العنوان الأصلي من شوبيفاي: {fields.address}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
