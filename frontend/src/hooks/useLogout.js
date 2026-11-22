"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { logout } from "@/services/auth.service";

/** Clears the HttpOnly session cookie (server-side), drops cached data, goes to /login. */
export default function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return async () => {
    try {
      await logout();
    } finally {
      queryClient.clear();
      router.replace("/login");
    }
  };
}
