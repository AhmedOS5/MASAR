import styles from "./CompareSection.module.css";
import CompareHeader from "./CompareHeader/CompareHeader";
import VisualGraph from "./VisualGraph/VisualGraph";

export default function CompareSection() {
  return (
    <section id="compare" className={styles.container}>
      <CompareHeader />
      <VisualGraph />
    </section>
  );
}
