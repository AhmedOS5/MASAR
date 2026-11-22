"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Modal from "@/components/ui/Modal";
import { FormActions } from "@/components/ui/Form";
import QueryState from "@/components/ui/QueryState";
import ui from "@/components/ui/ui.module.css";
import { listEmployees } from "@/services/people.service";
import { setProjectMembers } from "@/services/projects.service";
import { useToast } from "@/components/Toast/ToastProvider";
import styles from "@/app/dashboard/projects/projects.module.css";

/** The system admin chooses the project's employees and which of them are supervisors. */
export default function TeamModal({ open, onClose, project }) {
  // user_id -> "member" | "supervisor"; absent = not on the team
  const [team, setTeam] = useState(() => new Map((project.members ?? []).map((m) => [m.user_id, m.project_role])));
  const toast = useToast();
  const queryClient = useQueryClient();
  const employees = useQuery({ queryKey: ["employees"], queryFn: () => listEmployees() });

  const save = useMutation({
    mutationFn: () => setProjectMembers(project.id, [...team].map(([user_id, project_role]) => ({ user_id, project_role }))),
    meta: { silent: true },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", String(project.id)] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("تم تحديث فريق المشروع.");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggle = (id) =>
    setTeam((t) => {
      const next = new Map(t);
      if (next.has(id)) next.delete(id);
      else next.set(id, "member");
      return next;
    });
  const setRole = (id, role) => setTeam((t) => new Map(t).set(id, role));

  return (
    <Modal open={open} onClose={onClose} title="فريق المشروع">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <p className={styles.note}>اختر الموظفين العاملين في المشروع، وحدّد المشرفين منهم (يوافق المشرف على طلبات المشروع ويوجّه مهامه).</p>
        <QueryState query={employees} isEmpty={(d) => d.length === 0} emptyText="لا يوجد موظفون. أضف موظفين أولاً من شاشة الموظفين.">
          {(all) =>
            all
              .filter((e) => e.status === "active")
              .map((e) => (
                <div key={e.id} className={styles.memberPick}>
                  <label>
                    <input type="checkbox" checked={team.has(e.id)} onChange={() => toggle(e.id)} />
                    <span>
                      {e.name}
                      {e.role?.title ? <span className={styles.rowSub}> — {e.role.title}</span> : null}
                    </span>
                  </label>
                  {team.has(e.id) && (
                    <select
                      className={ui.select}
                      aria-label={`دور ${e.name} في المشروع`}
                      value={team.get(e.id)}
                      onChange={(ev) => setRole(e.id, ev.target.value)}
                    >
                      <option value="member">عضو فريق</option>
                      <option value="supervisor">مشرف</option>
                    </select>
                  )}
                </div>
              ))
          }
        </QueryState>
        <FormActions onCancel={onClose} submitting={save.isPending} submitLabel="حفظ الفريق" />
      </form>
    </Modal>
  );
}
