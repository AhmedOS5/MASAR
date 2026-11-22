import React from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { toastBus } from "@/components/Toast/toastBus";

/** Same wiring as src/app/providers.js, but with retries off so failures surface immediately. */
export function renderWithProviders(ui) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    mutationCache: new MutationCache({
      onError: (error, _v, _c, mutation) => {
        if (mutation.meta?.silent) return;
        toastBus.current?.error(error?.message || "حدث خطأ غير متوقع.");
      },
    }),
  });
  const result = render(
    <ToastProvider>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </ToastProvider>,
  );
  return { ...result, client };
}
