"use client";

import React, { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, FolderPlus, UploadCloud, Folder, FileText, Download } from "lucide-react";
import { useWorkProjects } from "@/features/projects/ProjectField";
import { createFolder } from "@/services/projects.service";
import QueryState from "@/components/ui/QueryState";
import PageHeader from "@/components/ui/PageHeader";
import ui from "@/components/ui/ui.module.css";
import { fileDownloadUrl, listFiles, listFolders, uploadFile } from "@/services/workspace.service";
import { fileKind, formatBytes, formatDate } from "@/lib/format";
import { useToast } from "@/components/Toast/ToastProvider";
import usePermissions from "@/hooks/usePermissions";
import styles from "./files.module.css";
import dashboardStyles from "../dashboard.module.css";

const ICON_CLASS = { pdf: styles.iconPdf, xls: styles.iconXls, doc: styles.iconDoc };

export default function FilesPage() {
  const [folderId, setFolderId] = useState(null);
  const fileRef = useRef(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const { can } = usePermissions();

  const folders = useQuery({ queryKey: ["files", "folders"], queryFn: listFolders });
  const files = useQuery({
    queryKey: ["files", "list", folderId],
    queryFn: () => listFiles({ folder_id: folderId ?? undefined, per_page: 24 }),
  });

  // Every folder belongs to a project and every file lives in a folder.
  const projects = useWorkProjects();
  const projectName = new Map((projects.data ?? []).map((p) => [p.id, p.name]));
  const [newFolder, setNewFolder] = useState("");
  const [folderProject, setFolderProject] = useState("");
  const addFolder = useMutation({
    mutationFn: ({ name, project_id }) => createFolder({ name, project_id: Number(project_id) }),
    meta: { silent: true },
    onSuccess: () => {
      setNewFolder("");
      queryClient.invalidateQueries({ queryKey: ["files"] });
      toast.success("تم إنشاء المجلد.");
    },
    onError: (err) => toast.error(err.fieldErrors?.name || err.fieldErrors?.project_id || err.message),
  });

  const upload = useMutation({
    mutationFn: (file) => uploadFile(file, folderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      toast.success("تم رفع الملف.");
    },
  });

  const onPick = (e) => {
    const file = e.target.files?.[0];
    if (file) upload.mutate(file);
    e.target.value = "";
  };

  return (
    <main className={dashboardStyles.mainContainer}>
      <PageHeader
        icon={FolderOpen}
        title="مدير الملفات"
        subtitle="إدارة المستندات والمرفقات الخاصة بمساحة العمل"
        primary={
          can("files.upload") && (
            <>
              <button
                type="button"
                className={ui.primaryBtn}
                disabled={upload.isPending || !folderId}
                title={folderId ? undefined : "اختر مجلداً أولاً: كل ملف يُرفع داخل مجلد تابع لمشروع"}
                onClick={() => fileRef.current?.click()}
              >
                <UploadCloud size={16} aria-hidden="true" />
                {upload.isPending ? "جاري الرفع..." : folderId ? "رفع ملف جديد" : "اختر مجلداً لرفع ملف"}
              </button>
              <input ref={fileRef} type="file" hidden onChange={onPick} />
            </>
          )
        }
      />

      <h2 className={styles.sectionTitle}>المجلدات الرئيسية</h2>
      {can("files.upload") && (
        <form
          className={ui.inlineForm}
          onSubmit={(e) => {
            e.preventDefault();
            if (newFolder.trim() && folderProject) addFolder.mutate({ name: newFolder.trim(), project_id: folderProject });
          }}
        >
          <select
            aria-label="مشروع المجلد"
            value={folderProject}
            onChange={(e) => setFolderProject(e.target.value)}
            className={ui.control}
          >
            <option value="">اختر المشروع</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input
            aria-label="اسم المجلد الجديد"
            placeholder="اسم مجلد جديد"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            className={ui.control}
          />
          <button type="submit" className={ui.secondaryBtn} disabled={addFolder.isPending || !newFolder.trim() || !folderProject}>
            <FolderPlus size={16} />
            إنشاء مجلد
          </button>
        </form>
      )}
      <QueryState query={folders} isEmpty={(d) => d.length === 0} emptyText="لا توجد مجلدات.">
        {(items) => (
          <div className={styles.foldersGrid}>
            {items.map((folder) => (
              <button
                key={folder.id}
                type="button"
                aria-pressed={folderId === folder.id}
                className={`${styles.folderCard} ${folderId === folder.id ? styles.folderActive : ""}`}
                onClick={() => setFolderId(folderId === folder.id ? null : folder.id)}
              >
                <div className={styles.folderIconWrapper}>
                  <Folder size={20} fill="currentColor" />
                </div>
                <div className={styles.folderInfo}>
                  <h3 className={styles.folderName}>{folder.name}</h3>
                  <p className={styles.folderCount}>
                    {folder.items_count ?? 0} عنصر{projectName.get(folder.project_id) ? ` · ${projectName.get(folder.project_id)}` : ""}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </QueryState>

      <h2 className={styles.sectionTitle}>{folderId ? "ملفات المجلد" : "الملفات الأخيرة"}</h2>
      <QueryState query={files} isEmpty={(d) => d.items.length === 0} emptyText="لا توجد ملفات بعد.">
        {({ items }) => (
          <div className={styles.filesGrid}>
            {items.map((file) => (
              <div key={file.id} className={styles.fileCard}>
                <div className={styles.fileHeader}>
                  <div className={`${styles.fileIconWrapper} ${ICON_CLASS[fileKind(file.name, file.mime)] || styles.iconDoc}`}>
                    <FileText size={24} />
                  </div>
                  <a
                    className={styles.downloadBtn}
                    title="تحميل"
                    aria-label={`تحميل ${file.name}`}
                    href={fileDownloadUrl(file.id)}
                    download={file.name}
                  >
                    <Download size={18} />
                  </a>
                </div>
                <h3 className={styles.fileName}>{file.name}</h3>
                <div className={styles.fileMeta}>
                  <span>{formatDate(file.created_at)}</span>
                  <span>{formatBytes(file.size)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </QueryState>
    </main>
  );
}
