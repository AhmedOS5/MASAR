"use client";

import { useSyncExternalStore } from "react";
import { formatDate } from "@/lib/format";

const subscribe = () => () => {};
// The visitor's local calendar day ("2026-11-15"): a string, so React sees a stable snapshot between renders.
const clientDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
const serverDay = () => null;

/**
 * Today's date in the visitor's own locale/time zone.
 *
 * Pages such as /dashboard are pre-rendered at BUILD time, so a `new Date()` in their markup freezes the build date into
 * the HTML and React reports a hydration mismatch (#418) on every later day. The server snapshot is empty and the real
 * date is filled in on the client right after hydration.
 */
export default function TodayDate({ options }) {
  const day = useSyncExternalStore(subscribe, clientDay, serverDay);
  if (!day) return null;
  const [y, m, d] = day.split("-").map(Number);
  return formatDate(new Date(y, m - 1, d, 12), options);
}
