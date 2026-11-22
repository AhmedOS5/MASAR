"use client";

import { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import styles from "./ScrollToTop.module.css";

const SHOW_AFTER_PX = 400;

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      onClick={scrollToTop}
      className={`${styles.scrollTopBtn} ${visible ? styles.visible : ""}`}
      aria-label="العودة إلى أعلى الصفحة"
      tabIndex={visible ? 0 : -1}
    >
      <ArrowUp size={22} strokeWidth={2.5} />
    </button>
  );
}
