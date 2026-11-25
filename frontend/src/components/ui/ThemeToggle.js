"use client";

import { useEffect } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_KEY, applyTheme, clearTheme, parseTheme } from "@/lib/theme";
import useStoredPreference, { writeStoredPreference } from "@/hooks/useStoredPreference";
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
  // Server markup and hydration use "light"; the saved value takes over on the client, so both renders agree.
  const pref = useStoredPreference(THEME_KEY, parseTheme, "light");

  useEffect(() => {
    applyTheme(pref);
  }, [pref]);

  useEffect(() => clearTheme, []);

  useEffect(() => {
    if (pref !== "system" || !window.matchMedia) return undefined;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => applyTheme("system");
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, [pref]);

  function choose(value) {
    writeStoredPreference(THEME_KEY, value); // the effect above applies it
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
