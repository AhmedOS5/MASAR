"use client";

import { useState } from "react";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { toastBus } from "@/components/Toast/toastBus";

export function shouldRetry(failureCount, error) {
  // Never retry client errors (validation / auth / not-found); retry network & 5xx twice.
  if (error?.status >= 400 && error?.status < 500) return false;
  return failureCount < 2;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, refetchOnWindowFocus: false, staleTime: 30_000 },
    },
    // Every failed mutation surfaces a toast unless it opts out with meta: { silent: true }.
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        if (mutation.meta?.silent) return;
        toastBus.current?.error(error?.message || "حدث خطأ غير متوقع.");
      },
    }),
  });
}

export default function Providers({ children }) {
  const [client] = useState(createQueryClient);
  return (
    <ToastProvider>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ToastProvider>
  );
}
