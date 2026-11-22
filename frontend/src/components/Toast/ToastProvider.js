"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toastBus } from "./toastBus";
import styles from "./Toast.module.css";

const ToastContext = createContext(null);
const NOOP = { success() {}, error() {}, info() {} };

/** Fallback to a no-op outside the provider so components stay testable in isolation. */
export function useToast() {
  return useContext(ToastContext) ?? NOOP;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const timersRef = useRef(new Map()); // toast id -> auto-dismiss timer

  const dismiss = useCallback((id) => {
    clearTimeout(timersRef.current.get(id));
    timersRef.current.delete(id);
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (type, message) => {
      const id = ++idRef.current;
      setToasts((t) => [...t.slice(-3), { id, type, message }]);
      timersRef.current.set(id, setTimeout(() => dismiss(id), type === "error" ? 6000 : 3500));
    },
    [dismiss],
  );

  // A timer must never outlive the provider: it would call setState after unmount (and, in tests, after the DOM is gone).
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const api = useMemo(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
    }),
    [push],
  );

  useEffect(() => {
    toastBus.current = api;
    return () => {
      toastBus.current = null;
    };
  }, [api]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.viewport} aria-live="polite" role="region" aria-label="الإشعارات">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === "error" ? "alert" : "status"}
            className={`${styles.toast} ${styles[t.type]}`}
          >
            <span>{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="إغلاق">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
