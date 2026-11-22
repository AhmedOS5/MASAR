import { AlertTriangle, SearchX } from "lucide-react";
import styles from "./ErrorScreen.module.css";

/**
 * Shared look of the error / not-found screens.
 *   kind     "error" (default) | "notFound"
 *   inline   true inside the dashboard shell (keeps the sidebar), false = a full page
 *   digest   Next.js error id, shown as a reference the user can quote to support (never the raw error message)
 *   onRetry  renders the "try again" button
 *   actions  [{ href, label }] navigation links (plain anchors, so this also works inside global-error)
 */
export default function ErrorScreen({ kind = "error", title, message, digest, onRetry, actions = [], inline = false }) {
  const notFound = kind === "notFound";
  const Icon = notFound ? SearchX : AlertTriangle;
  return (
    <div className={inline ? styles.inline : styles.page}>
      <div className={styles.card} role={notFound ? undefined : "alert"}>
        {notFound ? (
          <div className={styles.code} aria-hidden="true">404</div>
        ) : (
          <div className={styles.icon} aria-hidden="true">
            <Icon size={28} />
          </div>
        )}
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.message}>{message}</p>
        {digest && <p className={styles.ref}>رمز المرجع: {digest}</p>}
        <div className={styles.actions}>
          {onRetry && (
            <button type="button" className={styles.primaryBtn} onClick={onRetry}>
              إعادة المحاولة
            </button>
          )}
          {actions.map((a, i) => (
            <a key={a.href} href={a.href} className={i === 0 && !onRetry ? styles.primaryBtn : styles.secondaryBtn}>
              {a.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
