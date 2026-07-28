"use client";

import { useState } from "react";

// بيانات المورد — القلم بيفتح التعديل في مكانه
export function SupplierInfo({
  id,
  name,
  phone,
  notes,
  canEdit,
  updateAction,
  deleteAction,
}: {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  canEdit: boolean;
  updateAction: (fd: FormData) => Promise<void>;
  deleteAction: (fd: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const waPhone = (phone ?? "").replace(/\D/g, "").replace(/^0/, "20");

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
      {!editing ? (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold text-gray-900">{name}</h2>
            {phone ? (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm text-gray-500" dir="ltr">
                  {phone}
                </span>
                <a
                  href={`https://wa.me/${waPhone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="واتساب"
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-50 text-green-600"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.2 1.2-1.7 1.2-.5.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1-1.4-1-2.6s.6-1.8.9-2.1c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2 0 .4-.1.5l-.3.4c-.1.1-.3.3-.1.6.1.3.6 1.1 1.3 1.7.9.8 1.6 1 1.9 1.2.2.1.4.1.5-.1l.7-.8c.2-.2.3-.2.6-.1l1.8.8c.3.1.4.2.5.3 0 .1 0 .6-.2 1.1z" />
                  </svg>
                </a>
              </div>
            ) : (
              <p className="mt-1 text-sm text-gray-400">بدون تليفون</p>
            )}
            {notes && (
              <p className="mt-2 text-sm text-gray-600">{notes}</p>
            )}
          </div>

          {canEdit && (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setEditing(true)}
                title="تعديل"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-600"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
              <form action={deleteAction}>
                <input type="hidden" name="supplier_id" value={id} />
                <button
                  type="submit"
                  title="مسح المورد"
                  onClick={(e) => {
                    if (
                      !confirm(
                        "هيتمسح المورد وكل حركاته ودفعاته من الخزنة كمان. متأكد؟"
                      )
                    )
                      e.preventDefault();
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                  >
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                  </svg>
                </button>
              </form>
            </div>
          )}
        </div>
      ) : (
        <form
          action={async (fd) => {
            await updateAction(fd);
            setEditing(false);
          }}
          className="minis-in space-y-2"
        >
          <input type="hidden" name="supplier_id" value={id} />
          <input
            name="name"
            defaultValue={name}
            required
            placeholder="اسم المورد"
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
          <input
            name="phone"
            defaultValue={phone ?? ""}
            inputMode="tel"
            placeholder="التليفون"
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
          <input
            name="notes"
            defaultValue={notes ?? ""}
            placeholder="ملاحظات"
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white"
            >
              حفظ
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-600"
            >
              إلغاء
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
