"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, Settings } from "lucide-react";
import { EmptyState } from "@/components/ui/QueryState";
import QueryState from "@/components/ui/QueryState";
import ui from "@/components/ui/ui.module.css";
import useOptions from "@/hooks/useOptions";
import usePermissions from "@/hooks/usePermissions";
import { updateOptionList } from "@/services/workspace.service";
import { useToast } from "@/components/Toast/ToastProvider";
import dashboardStyles from "../dashboard.module.css";
import styles from "../projects/projects.module.css";

// The select-box lists every form offers. (Projects are not here: they come from the Projects screen.)
const LISTS = [
  { kind: "departments", label: "الأقسام" },
  { kind: "request_types", label: "أنواع الطلبات" },
  { kind: "task_types", label: "أنواع المهام" },
  { kind: "sectors", label: "القطاعات" },
  { kind: "regions", label: "المناطق" },
  { kind: "activity_types", label: "أنواع الأنشطة" },
  { kind: "complaint_types", label: "أنواع الشكاوى" },
  { kind: "channels", label: "قنوات استقبال الشكاوى" },
  { kind: "report_types", label: "أنواع التقارير" },
  { kind: "periods", label: "فترات التقارير" },
];

const asText = (items) => items.map((o) => (typeof o === "object" ? o.label : o)).join("\n");

function ListEditor({ kind, label, items }) {
  const [text, setText] = useState(() => asText(items));
  const toast = useToast();
  const queryClient = useQueryClient();

  const values = [...new Set(text.split("\n").map((s) => s.trim()).filter(Boolean))];
  const dirty = values.join("\n") !== asText(items);

  const save = useMutation({
    mutationFn: () => updateOptionList(kind, values),
    meta: { silent: true },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["options"] });
      toast.success(`تم حفظ قائمة «${label}».`);
    },
    onError: (err) => toast.error(err.fieldErrors?.values || err.message),
  });

  return (
    <form
      className={styles.panel}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <label htmlFor={`list-${kind}`} className={styles.panelTitle}>{label}</label>
      <p className={styles.note}>اكتب قيمة واحدة في كل سطر. تظهر هذه القيم في القوائم المنسدلة داخل النماذج.</p>
      <textarea
        id={`list-${kind}`}
        className={ui.textarea}
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className={ui.actions}>
        <button type="submit" className={ui.primaryBtn} disabled={!dirty || save.isPending}>
          {save.isPending ? "جاري الحفظ..." : "حفظ القائمة"}
        </button>
        <span className={styles.note}>{values.length} قيمة</span>
      </div>
    </form>
  );
}

export default function SettingsPage() {
  const { can } = usePermissions();
  const options = useOptions();
  const [kind, setKind] = useState(LISTS[0].kind);
  const current = LISTS.find((l) => l.kind === kind);

  return (
    <main className={`${dashboardStyles.mainContainer} ${styles.page}`}>
      <div>
        <h1 className={styles.title}>
          <Settings size={22} aria-hidden="true" /> إعدادات القوائم
        </h1>
        <p className={styles.subtitle}>عدّل القيم التي تظهر في القوائم المنسدلة لنماذج المنظمة.</p>
      </div>

      {!can("settings.manage") ? (
        <EmptyState icon={Lock}>إدارة القوائم متاحة لمدير النظام فقط.</EmptyState>
      ) : (
        <>
          <div className={styles.tabs} role="tablist" aria-label="القوائم">
            {LISTS.map((l) => (
              <button
                key={l.kind}
                type="button"
                role="tab"
                aria-selected={kind === l.kind}
                className={`${styles.tab} ${kind === l.kind ? styles.tabActive : ""}`}
                onClick={() => setKind(l.kind)}
              >
                {l.label}
              </button>
            ))}
          </div>
          <QueryState query={options} isEmpty={() => false} rows={4} block>
            {() => <ListEditor key={`${kind}:${(options.options[kind] ?? []).length}`} kind={kind} label={current.label} items={options.list(kind)} />}
          </QueryState>
        </>
      )}
    </main>
  );
}
