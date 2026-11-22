"use client";

import { useQuery } from "@tanstack/react-query";
import { getDashboardSummary } from "@/services/workspace.service";

export const DASHBOARD_SUMMARY_KEY = ["dashboard", "summary"];

/**
 * GET /dashboard/summary ->
 * { stats:{ active_users, open_tasks, running_operations, important_alerts }  // each {value, trend_text?, trend?:'up'|'down'|'neutral'}
 *   weekly_activity:[{date, requests, tasks}],
 *   active_units:[{id,title,icon}],
 *   pending_approvals:[{id,title,amount,department,created_at}],
 *   recent_requests:[{id,code,title,status,priority,created_at}],
 *   open_tasks:[{id,code,title,status,assignee,due_date}] }
 */
export default function useDashboardSummary() {
  return useQuery({
    queryKey: DASHBOARD_SUMMARY_KEY,
    queryFn: getDashboardSummary,
    refetchInterval: 120_000,
  });
}
