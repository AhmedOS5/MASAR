"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Bell, Menu } from "lucide-react";
import { useNotifications } from "../_context/NotificationsContext";
import useSession from "@/hooks/useSession";
import { initialOf } from "@/lib/format";
import styles from "./TopHeader.module.css";
import Logo from "../../_components/Navbar/Logo";
import ThemeToggle from "@/components/ui/ThemeToggle";
import Breadcrumbs from "./Breadcrumbs";

export default function TopHeader({ onMenuClick }) {
  const router = useRouter();
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [search, setSearch] = useState("");
  const notifRef = useRef(null);
  const { notifications, unreadCount, handleRead, isLoading, isError } = useNotifications();
  const { userName, user } = useSession();

  // إغلاق قائمة الإشعارات عند النقر خارجها
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNotifClick = (notif) => {
    if (!notif.isRead) handleRead(notif.id);
    if (notif.link) {
      setIsNotifOpen(false);
      router.push(notif.link);
    }
  };

  // Global search lands on the requests list, which supports ?search=
  const handleSearch = (e) => {
    e.preventDefault();
    const q = search.trim();
    if (q) router.push(`/dashboard/requests?search=${encodeURIComponent(q)}`);
  };

  return (
    <header className={styles.headerContainer}>
      <div className={styles.rightSection}>
        <button className={styles.mobileMenuBtn} onClick={onMenuClick} aria-label="القائمة">
          <Menu size={24} />
        </button>
        <div className={styles.logoWrapper}>
          <Logo width={260} height={75} />
        </div>
      </div>

      <div className={styles.centerSection}>
        <Breadcrumbs />
      </div>

      <div className={styles.leftSection}>
        <form className={styles.searchBox} onSubmit={handleSearch} role="search">
          <input
            type="text"
            placeholder="ابحث في الطلبات..."
            aria-label="بحث"
            className={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Search size={18} className={styles.searchIcon} />
        </form>

        <ThemeToggle />

        <div className={styles.notificationWrapper} ref={notifRef}>
          <button
            className={styles.notificationBtn}
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            aria-label="الإشعارات"
            aria-expanded={isNotifOpen}
          >
            <Bell size={20} />
            {unreadCount > 0 && <span className={styles.notificationDot} />}
          </button>

          {isNotifOpen && (
            <div className={styles.dropdownMenu}>
              <div className={styles.dropdownHeader}>
                <h4>الإشعارات</h4>
                {unreadCount > 0 && (
                  <span className={styles.unreadBadge}>{unreadCount} جديد</span>
                )}
              </div>
              <div className={styles.dropdownList}>
                {isLoading ? (
                  <div className={styles.dropdownItem}>جاري التحميل...</div>
                ) : isError ? (
                  <div className={styles.dropdownItem} role="alert">تعذر تحميل الإشعارات</div>
                ) : notifications.length === 0 ? (
                  <div className={styles.dropdownItem}>لا توجد إشعارات</div>
                ) : (
                  notifications.slice(0, 8).map((notif) => (
                    <div
                      key={notif.id}
                      role="button"
                      tabIndex={0}
                      className={`${styles.dropdownItem} ${!notif.isRead ? styles.unreadItem : ""}`}
                      onClick={() => handleNotifClick(notif)}
                      onKeyDown={(e) => e.key === "Enter" && handleNotifClick(notif)}
                    >
                      <p className={styles.notifTitle}>{notif.title}</p>
                      <span className={styles.notifTime}>{notif.time}</span>
                    </div>
                  ))
                )}
              </div>
              <Link
                href="/dashboard/notifications"
                className={styles.viewAllBtn}
                onClick={() => setIsNotifOpen(false)}
              >
                عرض كل الإشعارات
              </Link>
            </div>
          )}
        </div>

        <div className={styles.userProfile}>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{userName || "…"}</span>
            {user?.role && <span className={styles.userRole}>{user.role}</span>}
          </div>
          <div className={styles.avatar}>{initialOf(userName)}</div>
        </div>
      </div>
    </header>
  );
}
