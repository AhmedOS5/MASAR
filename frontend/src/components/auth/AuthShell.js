import React from "react";
import Image from "next/image";
import styles from "./auth.module.css";

/** Header + card used by the public account-recovery screens. */
export default function AuthShell({ title, subtitle, cardTitle, cardSub, children }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <Image src="/logo.png" alt="شعار مَسَار" width={200} height={200} priority />
        </div>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </header>

      <main className={styles.card}>
        <h2 className={styles.cardTitle}>{cardTitle}</h2>
        {cardSub && <p className={styles.cardSub}>{cardSub}</p>}
        {children}
      </main>
    </div>
  );
}
