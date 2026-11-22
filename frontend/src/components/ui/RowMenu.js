"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import styles from "./ui.module.css";

/** Kebab menu. items: [{ label, onSelect, href? }] */
export default function RowMenu({ items = [], label = "إجراءات", buttonClassName }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className={styles.menuWrap} ref={ref}>
      <button
        type="button"
        className={buttonClassName || styles.menuBtn}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className={styles.menuList} role="menu">
          {items.map((it) =>
            it.href ? (
              <a key={it.label} role="menuitem" className={styles.menuItem} href={it.href} onClick={() => setOpen(false)}>
                {it.label}
              </a>
            ) : (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={() => {
                  setOpen(false);
                  it.onSelect?.();
                }}
              >
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
