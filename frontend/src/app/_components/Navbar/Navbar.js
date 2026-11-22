"use client";

import Image from "next/image";
import styles from "./Navbar.module.css";
import Logo from "./Logo";
import Link from "next/link";
import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";

export default function Navbar() {
  const navItems = [
    { id: "nav", name: "الرئيسية", href: "/" },
    { id: "security", name: "الأمان", href: "/security" },
    { id: "modules", name: "الوحدات", href: "/modules" },
    { id: "compare", name: "كيف يعمل", href: "/how-it-works" },
    { id: "contact", name: "تواصل معنا", href: "/footer" },
  ];

  const [activeTab, setActiveTab] = useState("nav");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [theme, setTheme] = useState("dark"); // Default is now dark

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 80);
    };
    window.addEventListener("scroll", handleScroll);

    // Theme initialization
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTheme(savedTheme);
      if (savedTheme === "light") {
        document.documentElement.setAttribute("data-theme", "light");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
    } else {
      // Default to dark unless user prefers light
      const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
      if (prefersLight) {
        setTheme("light");
        document.documentElement.setAttribute("data-theme", "light");
      } else {
        setTheme("dark");
        document.documentElement.removeAttribute("data-theme"); // :root handles dark
      }
    }

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    if (newTheme === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    localStorage.setItem("theme", newTheme);
  };

  return (
    <nav id="nav" className={styles.navbar}>
      <div className="container">
        <div className={styles.navWrapper}>
          {/* 1. أقصى اليمين: الشعار */}
          <div className={styles.logoContainer}>
            <Link href={"/"} className={styles.logoLink}>
              <Logo width={130} height={130} />
            </Link>
          </div>

          {/* 2. المنتصف: روابط التنقل */}
          <div
            className={`${styles.navLinksWrapper} ${isMenuOpen ? styles.menuOpen : ""} ${isScrolled ? styles.floatingScrolled : ""}`}
          >
            <ul className={styles.navLinks}>
              {navItems.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`#${item.id}`}
                    className={`${styles.navLink} ${activeTab === item.id ? styles.activeLink : ""}`}
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMenuOpen(false);
                    }}
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
            <div className={`${styles.underline} ${styles[activeTab]}`}></div>
          </div>

          {/* 3. أقصى الشمال: الأزرار وزر التبديل */}
          <div className={styles.navAction}>
            <button
              onClick={toggleTheme}
              className={styles.themeToggleBtn}
              aria-label="Toggle Theme"
            >
              {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
            </button>
            <Link href="/login" className={styles.loginBtn}>
              تسجيل الدخول
            </Link>
            <Link href="/register" className={styles.registerBtn}>
              سجّل مؤسستك
            </Link>
            <button
              className={`${styles.burgerMenu} ${isMenuOpen ? styles.burgerActive : ""}`}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="القائمة"
            >
              <span></span>
              <span></span>
              <span></span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
