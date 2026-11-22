// Module-level bridge so non-React code (the QueryClient MutationCache) can raise toasts.
export const toastBus = { current: null };
