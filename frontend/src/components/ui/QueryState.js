"use client";

import { Inbox } from "lucide-react";
import styles from "./ui.module.css";

export function Skeleton({ rows = 3, block = false }) {
  return (
    <div className={styles.skeletonWrap} aria-busy="true" aria-label="جاري التحميل">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`${styles.skeleton} ${block ? styles.skeletonBlock : ""}`} />
      ))}
    </div>
  );
}

export function ErrorBanner({ error, onRetry }) {
  return (
    <div className={styles.errorBox} role="alert">
      <span>{error?.message || "تعذر تحميل البيانات."}</span>
      {onRetry && (
        <button type="button" className={styles.retryBtn} onClick={onRetry}>
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}

/** Icon + message (+ an optional call to action, e.g. "clear filters"). */
export function EmptyState({ children = "لا توجد بيانات لعرضها.", icon: Icon = Inbox, action = null }) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon} aria-hidden="true">
        <Icon size={22} />
      </span>
      <div className={styles.emptyText}>{children}</div>
      {action}
    </div>
  );
}

/**
 * Renders loading / error / empty states for a TanStack query, else children(data).
 *   <QueryState query={q} isEmpty={(d) => d.length === 0}>{(data) => ...}</QueryState>
 */
export default function QueryState({
  query,
  isEmpty,
  emptyText,
  emptyIcon,
  rows = 3,
  block = false,
  children,
}) {
  if (query.isPending) return <Skeleton rows={rows} block={block} />;
  if (query.isError) {
    return <ErrorBanner error={query.error} onRetry={() => query.refetch()} />;
  }
  if (isEmpty?.(query.data)) return <EmptyState icon={emptyIcon}>{emptyText}</EmptyState>;
  return <>{children(query.data)}</>;
}
