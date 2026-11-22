import Image from "next/image";
import styles from "./page.module.css";
import Navbar from "./_components/Navbar/Navbar";
import Hero from "./_components/Hero/Hero";
import Security from "./_components/Security/Security";
import RegistrationCompp from "./_components/reg/RegistrationCompp";
import ModulesSection from "./_components/ModulesSection/ModulesSection";
import CompareSection from "./_components/Compare/CompareSection";
import Footer from "./_components/Footer/Footer";
import InteractiveBackground from "./_components/InteractiveBackground/InteractiveBackground";
import ScrollToTop from "./_components/ScrollToTop/ScrollToTop";

const page = () => {
  return (
    <div className={styles.landingWrapper}>
      <InteractiveBackground />
      <ScrollToTop />
      <div className={styles.content}>
        <Navbar />
        <Hero />
        <ModulesSection />
        <Security />
        <RegistrationCompp />
        <CompareSection />
        <Footer />
      </div>
    </div>
  );
};

export default page;
