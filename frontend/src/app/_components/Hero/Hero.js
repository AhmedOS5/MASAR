import Link from "next/link";
import Image from "next/image";
import styles from "./Hero.module.css";
import React from "react";
import { ArrowLeft, Dot, CircleCheck, Building2, Folder, CheckSquare, Blocks, BarChart2 } from "lucide-react";

const Hero = () => {
  return (
    <section id="hero" className={styles.hero}>
      <div className={styles.blurBlob1}></div>
      <div className={styles.blurBlob2}></div>
      <div className={styles.blurBlobCenter}></div>
      <div className={styles.blurBlob3}></div>
      <div className="container">
        <div className={styles.heroWrapper}>
          <div className={styles.heroContent}>
            <span className={styles.badge}>
              <span className={styles.bdg}>
                <Dot size={50} color={"#006A63"} />
                <p>مساحة عمل رقمية متكاملة</p>
              </span>
            </span>

            <h1 className={styles.title}>
              كل عمليات مؤسستك في <span className={styles.animatedText}>مَسَار</span> واحد
            </h1>

            <p className={styles.description}>
              مساحة عمل رقمية متكاملة تمكنك من تنظيم مهام فريقك، تتبع البيانات،
              وإدارة أصول مؤسستك في مكان واحد وبأعلى كفاءة.
            </p>
            <div className={styles.heroActions}>
              <Link href="/register" className={styles.primaryBtn}>
                <div className={styles.rgbtn}>
                  سجل مؤسستك
                  <ArrowLeft />
                </div>
              </Link>
            </div>
          </div>
          {/* الشق الأيسر: رسم توضيحي للعقد المترابطة (Nodes Diagram) */}
          <div className={styles.heroVisual}>
            <div className={styles.nodesDiagram}>
              {/* SVG للخطوط المتقطعة المنحنية */}
              <svg className={styles.connectionLines} viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* منحنى لأعلى اليسار */}
                <path d="M 250 250 Q 120 250, 120 120" stroke="#93C5FD" strokeWidth="2" strokeDasharray="6 6" />
                {/* منحنى لأعلى اليمين */}
                <path d="M 250 250 Q 380 250, 380 140" stroke="#D8B4FE" strokeWidth="2" strokeDasharray="6 6" />
                {/* منحنى لأسفل اليسار */}
                <path d="M 250 250 Q 120 250, 120 380" stroke="#FCA5A5" strokeWidth="2" strokeDasharray="6 6" />
                {/* منحنى لأسفل اليمين */}
                <path d="M 250 250 Q 380 250, 380 360" stroke="#86EFAC" strokeWidth="2" strokeDasharray="6 6" />
              </svg>

              {/* العقدة المركزية */}
              <div className={`${styles.nodeCenter}`}>
                <div className={styles.centerIconWrapper}>
                  <Building2 size={32} color="#ffffff" />
                </div>
                <h3>مساحة عمل المؤسسة</h3>
              </div>

              {/* العقد الفرعية */}
              <div className={`${styles.subNode} ${styles.nodeTopLeft}`}>
                <span>السجلات</span>
                <div className={`${styles.subNodeIcon} ${styles.iconBlue}`}>
                  <Folder size={20} />
                </div>
              </div>

              <div className={`${styles.subNode} ${styles.nodeTopRight}`}>
                <span>المهام</span>
                <div className={`${styles.subNodeIcon} ${styles.iconPurple}`}>
                  <CheckSquare size={20} />
                </div>
              </div>

              <div className={`${styles.subNode} ${styles.nodeBottomLeft}`}>
                <span>الوحدات</span>
                <div className={`${styles.subNodeIcon} ${styles.iconOrange}`}>
                  <Blocks size={20} />
                </div>
              </div>

              <div className={`${styles.subNode} ${styles.nodeBottomRight}`}>
                <span>التقارير</span>
                <div className={`${styles.subNodeIcon} ${styles.iconGreen}`}>
                  <BarChart2 size={20} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
