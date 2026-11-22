"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { applyTheme, clearTheme, readStoredTheme, storeTheme } from "@/lib/theme";
import styles from "./ThemeToggle.module.css";

const OPTIONS = [
  { value: "light", label: "المظهر الفاتح", Icon: Sun },
  { value: "dark", label: "المظهر الداكن", Icon: Moon },
  { value: "system", label: "مظهر النظام", Icon: Monitor },
];

/**
 * Light / dark / system switch. Mounting it activates the saved appearance (the boot script in <head> already did on a
 * full page load); unmounting restores the default so the public pages are never affected.
 */
export default function ThemeToggle() {
  const [pref, setPref] = useState("light"); // the saved value is read after mount, so server and client markup agree

  useEffect(() => {
    const saved = readStoredTheme();
    setPref(saved);
    applyTheme(saved);
    return clearTheme;
  }, []);

  useEffect(() => {
    if (pref !== "system" || !window.matchMedia) return undefined;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => applyTheme("system");
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, [pref]);

  function choose(value) {
    setPref(value);
    storeTheme(value);
    applyTheme(value);
  }

  return (
    <div className={styles.group} role="group" aria-label="مظهر الواجهة">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          className={`${styles.option} ${pref === value ? styles.active : ""}`}
          aria-label={label}
          aria-pressed={pref === value}
          title={label}
          onClick={() => choose(value)}
        >
          <Icon size={15} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
