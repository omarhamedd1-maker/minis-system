"use client";

import { useState } from "react";

/**
 * اختيار المورد في فورم المصروف — والشرح بيظهر **لما تختار مورد بس**.
 * كان ٣ سطور ظاهرين دايمًا حتى لو المصروف مالوش علاقة بمورد.
 */
export function SupplierField({
  suppliers,
  className,
}: {
  suppliers: { id: string; name: string }[];
  className?: string;
}) {
  const [picked, setPicked] = useState("");
  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor="supplier_id" className="text-xs text-ink-muted">
          المورد (اختياري)
        </label>
        <select
          id="supplier_id"
          name="supplier_id"
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          className={className}
        >
          <option value="">مش على مورد</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {picked && (
        <p className="w-full text-xs text-ink-faint">
          المصروف ده بيتسجّل دفعة في حساب المورد وبيقلّل اللي عليك له. فواتير
          البضاعة بالأجل بتتسجّل من صفحة المورد نفسه ومابتتحسبش مصروف غير لما
          تحاسبه.
        </p>
      )}
    </>
  );
}
