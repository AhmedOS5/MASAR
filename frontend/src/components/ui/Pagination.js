"use client";

import styles from "./ui.module.css";

/** Real pagination driven by Laravel `meta.current_page` / `meta.last_page`. */
export default function Pagination({ page = 1, lastPage = 1, onChange, classes = {} }) {
  if (lastPage <= 1) return null;
  const pages = [];
  for (let p = 1; p <= lastPage; p++) {
    if (p === 1 || p === lastPage || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== "…") pages.push("…");
  }
  return (
    <nav className={classes.wrap || styles.pager} aria-label="الترقيم">
      <button
        type="button"
        className={classes.btn || styles.pageBtn}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        السابق
      </button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`}>…</span>
        ) : (
          <button
            key={p}
            type="button"
            aria-current={p === page ? "page" : undefined}
            className={`${classes.btn || styles.pageBtn} ${p === page ? classes.active || styles.pageActive : ""}`}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        className={classes.btn || styles.pageBtn}
        disabled={page >= lastPage}
        onClick={() => onChange(page + 1)}
      >
        التالي
      </button>
    </nav>
  );
}
