"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { OrderImportResult } from "@/lib/shopify/orders";
import { ImportShopifyOrders } from "./ImportShopifyOrders";

/**
 * زرار `+` في عنوان الأوردرات (ORDERS-PAGE-REDESIGN §١).
 *
 * «إضافة أوردر» و«جيب من شوبيفاي» كانوا زرارين جنب العنوان، وعلى الموبايل
 * كل واحد بينزل سطرين. دلوقتي زرار واحد بقايمة.
 *
 * ⚠️ **شاشة الاستيراد برّه القايمة** — القايمة بتتقفل أول ما تختار، ولو
 * الشاشة جوّاها كانت هتتقفل معاها.
 */
export function OrdersAddMenu({
  canCreate,
  importAction,
}: {
  canCreate: boolean;
  importAction: (dry: boolean) => Promise<OrderImportResult>;
}) {
  const [open, setOpen] = useState(false);
  const [importRun, setImportRun] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") setOpen(false);
      } else if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!canCreate) return null;

  const item =
    "flex min-h-11 w-full items-center px-4 text-start text-sm text-ink hover:bg-sunken";

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label="إضافة"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-11 items-center justify-center rounded-control bg-primary text-2xl leading-none text-white hover:bg-primary-dark"
      >
        +
      </button>
      {open && (
        <div
          role="menu"
          className="absolute end-0 top-12 z-30 w-48 overflow-hidden rounded-card bg-surface py-1 shadow-pop"
        >
          <Link role="menuitem" href="/orders/new" className={item} onClick={() => setOpen(false)}>
            أوردر جديد
          </Link>
          <button
            role="menuitem"
            type="button"
            className={item}
            onClick={() => {
              setOpen(false);
              setImportRun((n) => n + 1);
            }}
          >
            جيب من شوبيفاي
          </button>
        </div>
      )}
      <ImportShopifyOrders action={importAction} trigger={importRun} />
    </div>
  );
}
