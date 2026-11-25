import styles from "./pageHeader.module.css";

/**
 * Shared page header: title (+ optional subtitle / meta / leading badge), a primary action and secondary
 * actions on the inline-end side, and an optional contextual toolbar underneath.
 * Layout is logical (works in RTL and LTR) and collapses to a single column on narrow screens.
 * The title is always the page's single <h1>; pass `as="h2"` only for a nested page.
 */
export default function PageHeader({
  title,
  subtitle,
  meta,
  badge,
  icon: Icon,
  primary,
  secondary,
  toolbar,
  as: Heading = "h1",
  className = "",
}) {
  const hasActions = Boolean(primary || secondary);
  return (
    <header className={`${styles.header} ${className}`}>
      <div className={styles.row}>
        <div className={styles.intro}>
          <div className={styles.titleRow}>
            {Icon && (
              <span className={styles.icon} aria-hidden="true">
                <Icon size={18} />
              </span>
            )}
            <Heading className={styles.title}>{title}</Heading>
            {badge}
          </div>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          {meta && <div className={styles.meta}>{meta}</div>}
        </div>
        {hasActions && (
          <div className={styles.actions}>
            {secondary}
            {primary}
          </div>
        )}
      </div>
      {toolbar && <div className={styles.toolbar}>{toolbar}</div>}
    </header>
  );
}
