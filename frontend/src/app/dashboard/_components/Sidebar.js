"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Layers,
  Briefcase,
  Settings,
  FileText,
  CheckSquare,
  Users,
  ShieldCheck,
  FolderOpen,
  BarChart3,
  Bell,
  KeyRound,
  LogOut,
  ChevronDown,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  X,
} from "lucide-react";
import styles from "./Sidebar.module.css";
import { useNotifications } from "../_context/NotificationsContext";
import useLogout from "@/hooks/useLogout";
import usePermissions from "@/hooks/usePermissions";
import Logo from "../../_components/Navbar/Logo";

/** `collapsed` (desktop only) shrinks the sidebar to an icon rail; labels then appear as tooltips (Sidebar.module.css). */
export default function Sidebar({ isOpen, onClose, collapsed = false, onToggleCollapse }) {
  const pathname = usePathname();
  const { unreadCount } = useNotifications();
  const logout = useLogout();
  const { can, canAny } = usePermissions(); // كل مستخدم يرى فقط ما تسمح به صلاحيات مسماه الوظيفي

  // فحص هل الرابط الحالي نشط لملء الألوان برمجياً
  const isActive = (path) => pathname === path;

  // قائمة الوحدات الفرعية تبقى مفتوحة تلقائياً عند التواجد داخل إحدى شاشاتها
  const inUnitsArea =
    pathname.startsWith("/dashboard/units") ||
    pathname.startsWith("/dashboard/meal");
  const [unitsOpen, setUnitsOpen] = useState(inUnitsArea);

  return (
    <>
      {/* طبقة التعتيم الخلفية للجوال (Backdrop) */}
      {isOpen && <div className={styles.backdrop} onClick={onClose} />}

      <aside className={`${styles.sidebarContainer} ${isOpen ? styles.open : ""} ${collapsed ? styles.collapsed : ""}`}>
        {/* زر إغلاق يظهر فقط في الجوال */}
        <button className={styles.closeBtn} onClick={onClose}>
          <X size={20} />
        </button>

        <div className={styles.brand}>
          <Logo width={190} height={190} />
        </div>

        {/* قوائم الملاحة الروابط المباشرة */}
        <nav className={styles.navigation}>
          <Link
            href="/dashboard"
            onClick={onClose}
            className={
              isActive("/dashboard") ? styles.navLinkActive : styles.navLink
            }
          >
            <LayoutGrid size={18} />
            <span className={styles.linkText}>لوحة التحكم</span>
          </Link>

          {can("projects.view") && (
            <Link
              href="/dashboard/projects"
              onClick={onClose}
              className={pathname.startsWith("/dashboard/projects") ? styles.navLinkActive : styles.navLink}
            >
              <Briefcase size={18} />
              <span className={styles.linkText}>المشاريع</span>
            </Link>
          )}

          {can("units.view") && (
          <div className={styles.navGroupRow}>
            <Link
              href="/dashboard/units"
              onClick={onClose}
              className={
                isActive("/dashboard/units")
                  ? styles.navLinkActive
                  : styles.navLink
              }
            >
              <Layers size={18} />
              <span className={styles.linkText}>الوحدات</span>
            </Link>
            <button
              type="button"
              className={styles.chevronBtn}
              onClick={() => setUnitsOpen((open) => !open)}
              aria-label="توسيع قائمة الوحدات"
            >
              {unitsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
          )}

          {/* الشاشات الفرعية للوحدات المفعّلة */}
          {can("units.view") && unitsOpen && (
            <div className={styles.subMenu}>
              <span className={styles.subLinkDisabled} title="قيد التطوير">
                تقنية المعلومات والإدارة (قريباً)
              </span>
              <span className={styles.subLinkDisabled} title="قيد التطوير">
                العمليات الميدانية (قريباً)
              </span>
              <span className={styles.subLinkDisabled} title="قيد التطوير">
                الموارد البشرية (قريباً)
              </span>
              {can("meal.view") && (
                <Link
                  href="/dashboard/meal"
                  onClick={onClose}
                  className={
                    pathname.startsWith("/dashboard/meal")
                      ? styles.subLinkActive
                      : styles.subLink
                  }
                >
                  المتابعة والتقييم
                </Link>
              )}
            </div>
          )}

          {can("requests.view") && (
          <Link
            href="/dashboard/requests"
            onClick={onClose}
            className={
              isActive("/dashboard/requests")
                ? styles.navLinkActive
                : styles.navLink
            }
          >
            <FileText size={18} />
            <span className={styles.linkText}>الطلبات</span>
          </Link>
          )}

          {can("tasks.view") && (
          <Link
            href="/dashboard/tasks"
            onClick={onClose}
            className={
              isActive("/dashboard/tasks") ? styles.navLinkActive : styles.navLink
            }
          >
            <CheckSquare size={18} />
            <span className={styles.linkText}>المهام</span>
          </Link>
          )}

          {canAny("employees.view", "roles.view", "files.view", "reports.view", "settings.manage") &&<div className={styles.sectionHeader}>المنظمة</div>}

          {can("employees.view") && (
          <Link
            href="/dashboard/employees"
            onClick={onClose}
            className={
              isActive("/dashboard/employees")
                ? styles.navLinkActive
                : styles.navLink
            }
          >
            <Users size={18} />
            <span className={styles.linkText}>الموظفون</span>
          </Link>
          )}

          {can("roles.view") && (
          <Link
            href="/dashboard/roles"
            onClick={onClose}
            className={
              isActive("/dashboard/roles") ? styles.navLinkActive : styles.navLink
            }
          >
            <ShieldCheck size={18} />
            <span className={styles.linkText}>الأدوار والصلاحيات</span>
          </Link>
          )}

          {can("files.view") && (
          <Link
            href="/dashboard/files"
            onClick={onClose}
            className={
              isActive("/dashboard/files") ? styles.navLinkActive : styles.navLink
            }
          >
            <FolderOpen size={18} />
            <span className={styles.linkText}>الملفات</span>
          </Link>
          )}

          {can("reports.view") && (
          <Link
            href="/dashboard/reports"
            onClick={onClose}
            className={
              isActive("/dashboard/reports")
                ? styles.navLinkActive
                : styles.navLink
            }
          >
            <BarChart3 size={18} />
            <span className={styles.linkText}>التقارير</span>
          </Link>
          )}

          {can("settings.manage") && (
            <Link
              href="/dashboard/settings"
              onClick={onClose}
              className={isActive("/dashboard/settings") ? styles.navLinkActive : styles.navLink}
            >
              <Settings size={18} />
              <span className={styles.linkText}>إعدادات القوائم</span>
            </Link>
          )}

          <div className={styles.sectionHeader}>النظام</div>

          <Link
            href="/dashboard/notifications"
            onClick={onClose}
            className={
              isActive("/dashboard/notifications")
                ? styles.navLinkActive
                : styles.navLink
            }
          >
            {unreadCount > 0 && (
              <span className={styles.notificationBadge}>{unreadCount}</span>
            )}
            <Bell size={18} />
            <span className={styles.linkText}>الإشعارات</span>
          </Link>

          <Link
            href="/dashboard/account"
            onClick={onClose}
            className={isActive("/dashboard/account") ? styles.navLinkActive : styles.navLink}
          >
            <KeyRound size={18} />
            <span className={styles.linkText}>حسابي</span>
          </Link>
        </nav>

        {/* تسجيل الخروج */}
        <div className={styles.footerSection}>
          {onToggleCollapse && (
            <button
              type="button"
              className={styles.collapseBtn}
              onClick={onToggleCollapse}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "توسيع القائمة الجانبية" : "طي القائمة الجانبية"}
              title={collapsed ? "توسيع القائمة الجانبية" : "طي القائمة الجانبية"}
            >
              {collapsed ? <ChevronsLeft size={18} aria-hidden="true" /> : <ChevronsRight size={18} aria-hidden="true" />}
              <span className={styles.collapseText}>طي القائمة</span>
            </button>
          )}
          <button type="button" className={styles.logoutButton} onClick={logout}>
            <LogOut size={18} />
            <span className={styles.logoutText}>تسجيل الخروج</span>
          </button>
        </div>
      </aside>
    </>
  );
}
