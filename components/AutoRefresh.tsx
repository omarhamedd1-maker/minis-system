"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// بيجدد بيانات الصفحة من السيرفر كل شوية من غير ريفريش كامل —
// بيحافظ على مكان السكرول وحالة العناصر
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      // مانجددش والمستخدم سايب التاب — توفيراً
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);

  return null;
}
