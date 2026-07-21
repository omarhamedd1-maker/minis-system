"use client";

import { useEffect, useRef, useState } from "react";

// رقم بيعدّ بانيميشن من القيمة القديمة للجديدة لما تتغير
export function CountUp({
  value,
  format,
  baseline,
  duration = 700,
}: {
  value: number;
  format: (n: number) => string;
  baseline?: number;
  duration?: number;
}) {
  const [display, setDisplay] = useState(baseline ?? value);
  const displayRef = useRef(baseline ?? value);

  // نحتفظ بآخر قيمة معروضة عشان نبدأ منها لو اتغيرت وسط الانيميشن
  useEffect(() => {
    displayRef.current = display;
  });

  useEffect(() => {
    const start = displayRef.current;
    const end = value;
    if (Math.abs(end - start) < 0.5) {
      setDisplay(end);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // بيبطّأ في الآخر
      setDisplay(start + (end - start) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{format(Math.round(display))}</>;
}
