"use client";

import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, UserCircle } from "lucide-react";
import { Field, Input } from "@/components/ui/Form";
import { PasswordChecklist, checkPassword } from "@/components/auth/fields";
import ui from "@/components/ui/ui.module.css";
import useSession from "@/hooks/useSession";
import { changePassword } from "@/services/auth.service";
import { useToast } from "@/components/Toast/ToastProvider";
import dashboardStyles from "../dashboard.module.css";
import PageHeader from "@/components/ui/PageHeader";
import styles from "./account.module.css";

const EMPTY = { currentPassword: "", password: "", passwordConfirmation: "" };

/** Change-my-password form. Every signed-in user of the workspace has this screen (it needs no permission). */
function PasswordForm() {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const rules = checkPassword(form.password);
  const ready =
    form.currentPassword !== "" && rules.every((r) => r.ok) && form.password === form.passwordConfirmation;

  const save = useMutation({
    mutationFn: () => changePassword(form),
    meta: { silent: true }, // errors are shown inline below, not as a second toast
    onSuccess: () => {
      setForm(EMPTY);
      setErrors({});
      toast.success("تم تغيير كلمة المرور. أُنهيت جلساتك الأخرى على بقية الأجهزة.");
    },
    onError: (err) => {
      setErrors(err.fieldErrors && Object.keys(err.fieldErrors).length ? err.fieldErrors : { form: err.message });
    },
  });

  return (
    <form
      className={styles.panel}
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        save.mutate();
      }}
    >
      <h2 className={styles.panelTitle}>
        <KeyRound size={18} aria-hidden="true" /> تغيير كلمة المرور
      </h2>
      <p className={styles.note}>
        أدخل كلمة المرور الحالية ثم الجديدة. بعد التغيير تبقى جلستك هذه مفتوحة وتُنهى جلساتك على بقية الأجهزة.
      </p>

      <Field label="كلمة المرور الحالية" error={errors.current_password} required>
        <Input type="password" autoComplete="current-password" value={form.currentPassword} onChange={set("currentPassword")} />
      </Field>
      <Field label="كلمة المرور الجديدة" error={errors.password} required>
        <Input type="password" autoComplete="new-password" value={form.password} onChange={set("password")} />
      </Field>
      <PasswordChecklist rules={rules} />
      <Field
        label="تأكيد كلمة المرور الجديدة"
        error={form.passwordConfirmation && form.password !== form.passwordConfirmation ? "كلمتا المرور غير متطابقتين." : undefined}
        required
      >
        <Input
          type="password"
          autoComplete="new-password"
          value={form.passwordConfirmation}
          onChange={set("passwordConfirmation")}
        />
      </Field>

      {errors.form && (
        <p className={ui.fieldError} role="alert">
          {errors.form}
        </p>
      )}
      <div className={ui.actions}>
        <button type="submit" className={ui.primaryBtn} disabled={!ready || save.isPending}>
          {save.isPending ? "جاري الحفظ..." : "تغيير كلمة المرور"}
        </button>
      </div>
    </form>
  );
}

export default function AccountPage() {
  const { user, organizationName } = useSession();

  return (
    <main className={`${dashboardStyles.mainContainer} ${styles.page}`}>
      <PageHeader
        icon={UserCircle}
        title="حسابي"
        subtitle={
          <>
            {user?.name ? `${user.name}${user.email ? ` — ${user.email}` : ""}` : "بيانات حسابك وأمانه"}
            {organizationName ? ` · ${organizationName}` : ""}
          </>
        }
      />
      <PasswordForm />
    </main>
  );
}
