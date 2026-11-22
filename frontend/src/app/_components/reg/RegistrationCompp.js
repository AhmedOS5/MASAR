import Link from "next/link";
import styles from "./RegistrationCompp.module.css";
import { Rocket, ArrowLeft } from "lucide-react";

const Registration = () => {
  return (
    <section className={styles.sectionWrapper}>
      <div className={styles.regWrapper}>
        <div className={styles.iconWrapper}>
          <Rocket size={40} />
        </div>
        <h2>ابدا بتنظيم مؤسستك في مَسَار</h2>
        <p className={styles.regT}>
          انشأ مساحة عمل، فعل الوحدات المناسبة وابدا ادارة العمليات من مكان واحد.
        </p>
        <Link href={"/register"} className={styles.btn}>
          <ArrowLeft />
          سجل مؤسستك
        </Link>
        <p className={styles.regp}>
          لا حاجة لبطاقة ائتمان. تسجيل في دقائق قليلة.
        </p>
      </div>
    </section>
  );
};

export default Registration;
