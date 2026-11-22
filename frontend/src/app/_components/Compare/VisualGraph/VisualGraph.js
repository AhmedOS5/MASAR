import styles from "./VisualGraph.module.css";
import {
  ArrowLeft,
  FileText,
  MessageSquare,
  Copy,
  FileWarning,
  BarChart,
  Workflow,
} from "lucide-react";

export default function VisualGraph() {
  return (
    <div className={styles.graphWrapper}>
      <div className={styles.mainBoard}>
        {/* الأقراص العائمة المتشتتة في اليمين */}
        <div className={styles.blobsContainer}>
          <div className={`${styles.blob} ${styles.redBlob}`}>
            <FileText size={16} />
            <span>ملفات متفرقة</span>
          </div>

          <div className={`${styles.blob} ${styles.greenBlob}`}>
            <BarChart size={16} />
            <span>تقارير يدوية</span>
          </div>

          <div className={`${styles.blob} ${styles.blueBlob}`}>
            <MessageSquare size={16} />
            <span>رسائل كثيرة</span>
          </div>

          <div className={`${styles.blob} ${styles.purpleBlob}`}>
            <Copy size={16} />
            <span>سجلات مكررة</span>
          </div>

          <div className={`${styles.blob} ${styles.violetBlob}`}>
            <FileWarning size={16} />
            <span>مهام منسية</span>
          </div>
        </div>

        {/* سهم الانتقال الدائري في المنتصف مع الحلقات */}
        <div className={styles.arrowCircleContainer}>
          <div className={styles.rippleOuter}></div>
          <div className={styles.rippleMiddle}></div>
          <div className={styles.rippleInner}></div>
          <div className={styles.arrowCircle}>
            <ArrowLeft size={24} strokeWidth={2.5} />
          </div>
        </div>

        {/* الكرت الأيسر المستقر: مساحة عمل منظمة */}
        <div className={styles.organizedCard}>
          <div className={styles.iconBox}>
            <Workflow size={24} />
          </div>
          <h3>مساحة عمل منظمة</h3>
          <p>كل شيء في مكانه الصحيح</p>
        </div>
      </div>
    </div>
  );
}
