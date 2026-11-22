"use client";

import { useQuery } from "@tanstack/react-query";
import { getSession } from "@/services/auth.service";

/** Current user + organization from GET /api/auth/session (cached for the whole app). */
export default function useSession() {
  const query = useQuery({
    queryKey: ["session"],
    queryFn: getSession,
    staleTime: 5 * 60_000,
  });
  const user = query.data?.user ?? null;
  return {
    ...query,
    user,
    organization: query.data?.organization ?? null,
    userName: user?.name ?? user?.full_name ?? "",
    organizationName: query.data?.organization?.name ?? user?.organization_name ?? "",
  };
}
