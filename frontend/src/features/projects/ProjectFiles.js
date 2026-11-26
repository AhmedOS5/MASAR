"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, ImagePlus, UploadCloud } from "lucide-react";
import QueryState from "@/components/ui/QueryState";
import DeleteButton from "@/components/ui/DeleteButton";
import ui from "@/components/ui/ui.module.css";
import usePermissions from "@/hooks/usePermissions";
import {
  createFolder,
  listProjectFiles,
  listProjectFolders,
  listProjectReports,
  moveReport,
  uploadFileTo,
  uploadReport,
} from "@/services/projects.service";
import { deleteFile, deleteFolder, deleteReport, fileDownloadUrl, reportDownloadUrl } from "@/services/workspace.service";
import { formatBytes, formatDate } from "@/lib/format";
import { useToast } from "@/components/Toast/ToastProvider";
import styles from "@/app/dashboard/projects/projects.module.css";

/**
 * A project's folders, files (images included) and reports. People with files.upload create folders and upload files and
 * photos; people with reports.manage upload reports and file them in the project's folders.
 */
export default function ProjectFiles({ project }) {
  const { can } = usePermissions();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [folderId, setFolderId] = useState(null); // null = the whole project
  const [newFolder, setNewFolder] = useState("");
  const fileRef = useRef(null);
  const imageRef = useRef(null);
  const reportRef = useRef(null);

  const folders = useQuery({ queryKey: ["files", "folders", project.id], queryFn: () => listProjectFolders(project.id) });
  const scope = folderId ? { folder_id: folderId } : { project_id: project.id };
  const files = useQuery({ queryKey: ["files", "list", project.id, folderId], queryFn: () => listProjectFiles({ ...scope, per_page: 50 }) });
  const reports = useQuery({
    queryKey: ["reports", project.id, folderId],
    queryFn: () => listProjectReports({ ...scope, per_page: 50 }),
    enabled: can("reports.view"),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["files"] });
    queryClient.invalidateQueries({ queryKey: ["reports"] });
  };

  const addFolder = useMutation({
    mutationFn: (name) => createFolder({ name, project_id: project.id }),
    meta: { silent: true },
    onSuccess: () => {
      setNewFolder("");
      refresh();
      toast.success("تم إنشاء المجلد.");
    },
    onError: (err) => toast.error(err.fieldErrors?.name || err.message),
  });
  const addFile = useMutation({
    mutationFn: (file) => uploadFileTo(file, { folderId }),
    onSuccess: () => {
      refresh();
      toast.success("تم رفع الملف.");
    },
  });
  const addReport = useMutation({
    mutationFn: (file) => uploadReport(file, { projectId: project.id, folderId }),
    onSuccess: () => {
      refresh();
      toast.success("تم رفع التقرير.");
    },
  });
  const move = useMutation({
    mutationFn: ({ id, to }) => moveReport(id, to),
    onSuccess: () => {
      refresh();
      toast.success("تم نقل التقرير.");
    },
  });

  const pick = (mutation) => (e) => {
    const f = e.target.files?.[0];
    if (f) mutation.mutate(f);
    e.target.value = "";
  };
  const folderName = (id) => (folders.data ?? []).find((f) => f.id === id)?.name;
  const selectedFolder = folderId ? (folders.data ?? []).find((f) => f.id === folderId) : null;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>المجلدات</h2>
        {can("files.upload") && (
          <form
            className={styles.inlineForm}
            onSubmit={(e) => {
              e.preventDefault();
              if (newFolder.trim()) addFolder.mutate(newFolder.trim());
            }}
          >
            <input className={ui.input} aria-label="اسم المجلد الجديد" placeholder="اسم مجلد جديد" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} />
            <button type="submit" className={ui.secondaryBtn} disabled={addFolder.isPending || !newFolder.trim()}>
              <FolderPlus size={14} aria-hidden="true" /> إنشاء مجلد
            </button>
          </form>
        )}
      </div>

      <QueryState query={folders} isEmpty={() => false}>
        {(items) => (
          <div className={styles.folderBar} role="group" aria-label="مجلدات المشروع">
            <button type="button" aria-pressed={folderId === null} className={`${styles.folderChip} ${folderId === null ? styles.folderChipActive : ""}`} onClick={() => setFolderId(null)}>
              كل المشروع
            </button>
            {items.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={folderId === f.id}
                className={`${styles.folderChip} ${folderId === f.id ? styles.folderChipActive : ""}`}
                onClick={() => setFolderId(folderId === f.id ? null : f.id)}
              >
                {f.name} ({f.items_count})
              </button>
            ))}
          </div>
        )}
      </QueryState>
      {selectedFolder && can("files.upload") && ["admin", "supervisor"].includes(project.my_role) && (
        <DeleteButton
          label={`حذف المجلد ${selectedFolder.name}`}
          text="حذف المجلد المحدد"
          title="حذف مجلد"
          message={`سيُحذف المجلد "${selectedFolder.name}" مع ${selectedFolder.items_count} ملف بداخله نهائياً. التقارير المحفوظة فيه تبقى لكن بلا مجلد. لا يمكن التراجع عن هذا الإجراء.`}
          successText="تم حذف المجلد."
          mutationFn={() => deleteFolder(selectedFolder.id)}
          onDone={() => {
            setFolderId(null);
            refresh();
          }}
        />
      )}

      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>الملفات والصور</h2>
        {can("files.upload") && (
          <div className={styles.headerActions}>
            <button type="button" className={ui.secondaryBtn} disabled={addFile.isPending} onClick={() => fileRef.current?.click()}>
              <UploadCloud size={14} aria-hidden="true" /> رفع ملف
            </button>
            <button type="button" className={ui.secondaryBtn} disabled={addFile.isPending} onClick={() => imageRef.current?.click()}>
              <ImagePlus size={14} aria-hidden="true" /> رفع صورة
            </button>
            <input ref={fileRef} type="file" hidden onChange={pick(addFile)} />
            <input ref={imageRef} type="file" accept="image/*" hidden onChange={pick(addFile)} />
          </div>
        )}
      </div>
      <QueryState query={files} isEmpty={(d) => d.items.length === 0} emptyText={folderId ? "المجلد فارغ." : "لا توجد ملفات في هذا المشروع بعد."}>
        {({ items }) => (
          <ul className={styles.list}>
            {items.map((f) => (
              <li key={f.id} className={styles.row}>
                <a href={fileDownloadUrl(f.id)} className={`${styles.rowMain} ${styles.rowLink}`}>
                  <span className={styles.rowTitle}>{f.name}</span>
                  <span className={styles.rowSub}>{formatBytes(f.size)} · {formatDate(f.created_at)}</span>
                </a>
                {f.folder_id && <span className={styles.rowSub}>{folderName(f.folder_id)}</span>}
                {can("files.upload") && (
                  <DeleteButton
                    label={`حذف الملف ${f.name}`}
                    title="حذف ملف"
                    message={`هل أنت متأكد من حذف "${f.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
                    successText="تم حذف الملف."
                    mutationFn={() => deleteFile(f.id)}
                    onDone={refresh}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryState>

      {can("reports.view") && (
        <>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>التقارير</h2>
            {can("reports.manage") && (
              <>
                <button type="button" className={ui.primaryBtn} disabled={addReport.isPending} onClick={() => reportRef.current?.click()}>
                  <UploadCloud size={14} aria-hidden="true" /> {addReport.isPending ? "جاري الرفع..." : "رفع تقرير"}
                </button>
                <input ref={reportRef} type="file" hidden onChange={pick(addReport)} />
              </>
            )}
          </div>
          <QueryState query={reports} isEmpty={(d) => d.items.length === 0} emptyText={folderId ? "لا توجد تقارير في هذا المجلد." : "لا توجد تقارير في هذا المشروع بعد."}>
            {({ items }) => (
              <ul className={styles.list}>
                {items.map((r) => (
                  <li key={r.id} className={styles.row}>
                    <a href={reportDownloadUrl(r.id)} className={`${styles.rowMain} ${styles.rowLink}`}>
                      <span className={styles.rowTitle}>{r.name}</span>
                      <span className={styles.rowSub}>{[r.type, r.period, r.size ? formatBytes(r.size) : null].filter(Boolean).join(" · ")}</span>
                    </a>
                    {can("reports.manage") && (
                      <select
                        className={ui.select}
                        aria-label={`نقل ${r.name} إلى مجلد`}
                        value={r.folder_id ?? ""}
                        disabled={move.isPending}
                        onChange={(e) => move.mutate({ id: r.id, to: e.target.value ? Number(e.target.value) : null })}
                      >
                        <option value="">بدون مجلد</option>
                        {(folders.data ?? []).map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    )}
                    {can("reports.manage") && (
                      <DeleteButton
                        label={`حذف التقرير ${r.name}`}
                        title="حذف تقرير"
                        message={`هل أنت متأكد من حذف التقرير "${r.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
                        successText="تم حذف التقرير."
                        mutationFn={() => deleteReport(r.id)}
                        onDone={refresh}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </>
      )}
    </div>
  );
}
