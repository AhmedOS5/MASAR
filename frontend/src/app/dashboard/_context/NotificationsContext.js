"use client";

import React, { createContext, useContext, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/services/workspace.service";
import { timeAgo } from "@/lib/format";

const NotificationsContext = createContext(null);
const KEY = ["notifications"];

/** Backend (snake_case) -> UI model. */
export function normalizeNotification(n) {
  return {
    id: n.id,
    title: n.title,
    message: n.message ?? n.body ?? "",
    type: n.type || "system",
    isRead: Boolean(n.is_read ?? n.read_at),
    time: timeAgo(n.created_at),
    link: n.link || null,
  };
}

export function NotificationsProvider({ children }) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: KEY,
    queryFn: () => listNotifications({ per_page: 50 }),
    refetchInterval: 60_000,
  });

  const notifications = useMemo(
    () => (query.data?.items ?? []).map(normalizeNotification),
    [query.data],
  );
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const patchLocal = (updater) =>
    queryClient.setQueryData(KEY, (old) =>
      old ? { ...old, items: old.items.map(updater) } : old,
    );

  const readOne = useMutation({
    mutationFn: markNotificationRead,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const previous = queryClient.getQueryData(KEY);
      patchLocal((n) => (n.id === id ? { ...n, is_read: true, read_at: n.read_at ?? "now" } : n));
      return { previous };
    },
    onError: (_e, _id, ctx) => ctx?.previous && queryClient.setQueryData(KEY, ctx.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });

  const readAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const previous = queryClient.getQueryData(KEY);
      patchLocal((n) => ({ ...n, is_read: true, read_at: n.read_at ?? "now" }));
      return { previous };
    },
    onError: (_e, _v, ctx) => ctx?.previous && queryClient.setQueryData(KEY, ctx.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });

  const value = {
    notifications,
    unreadCount,
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    handleRead: (id) => readOne.mutate(id),
    handleMarkAllRead: () => readAll.mutate(),
  };

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used inside <NotificationsProvider>");
  return ctx;
}
