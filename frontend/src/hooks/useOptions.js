"use client";

import { useQuery } from "@tanstack/react-query";
import { getOptions } from "@/services/workspace.service";

/**
 * Lookup lists for <select>s, served by GET /options:
 * { departments, request_types, task_types, projects, sectors, regions, activity_types,
 *   complaint_types, channels, report_types, periods, indicators, employees, quarters }
 * Each list item is a string or { value, label }.
 */
export default function useOptions() {
  const query = useQuery({
    queryKey: ["options"],
    queryFn: getOptions,
    staleTime: 10 * 60_000,
  });
  const o = query.data || {};
  const list = (k) => (Array.isArray(o[k]) ? o[k] : []);
  return { ...query, options: o, list };
}
