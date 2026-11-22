"use client";

import { useEffect, useState } from "react";
import { formatNumber } from "@/lib/format";

/** Counts up to `value` (supports decimals and a suffix such as "%"). */
export default function AnimatedNumber({ value, decimals = 0, suffix = "", duration = 1200 }) {
  const end = Number(value);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!Number.isFinite(end)) return undefined;
    let start = null;
    let frame;
    const tick = (t) => {
      if (start === null) start = t;
      const p = Math.min((t - start) / duration, 1);
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setCurrent(end * eased);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [end, duration]);

  if (!Number.isFinite(end)) return <>—</>;
  const shown = decimals > 0 ? current.toFixed(decimals) : formatNumber(Math.floor(current));
  return (
    <>
      {shown}
      {suffix}
    </>
  );
}
