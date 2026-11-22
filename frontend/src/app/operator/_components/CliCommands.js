"use client";

import { Terminal } from "lucide-react";
import styles from "../operator.module.css";

// The same decisions from the backend's command line (backend/scripts/cli.mjs), for scripting or when the web console is
// unreachable. Run on the machine that hosts the API.
const COMMANDS = [
  { label: "المؤسسات التي تنتظر الاعتماد", cmd: "npm run cli -- orgs --status pending_approval" },
  { label: "تفاصيل مؤسسة ووثائقها", cmd: "npm run cli -- show <رقم المؤسسة>" },
  { label: "اعتماد مؤسسة", cmd: "npm run cli -- approve <رقم المؤسسة>" },
  { label: "رفض مؤسسة (السبب مطلوب)", cmd: 'npm run cli -- reject <رقم المؤسسة> --reason "السبب"' },
  { label: "تعليق مؤسسة معتمدة", cmd: 'npm run cli -- suspend <رقم المؤسسة> --reason "السبب"' },
];

export default function CliCommands() {
  return (
    <section className={styles.panel} aria-labelledby="cli-title">
      <div className={styles.panelHead}>
        <h2 id="cli-title" className={styles.panelTitle}>
          <Terminal size={18} aria-hidden="true" /> أوامر المشغّل
        </h2>
        <p className={styles.panelHint}>
          بديل سطر الأوامر للقرارات نفسها. نفّذها من مجلد <code dir="ltr">backend/</code> على خادم الواجهة الخلفية.
        </p>
      </div>
      <ul className={styles.commands} aria-label="أوامر المشغّل">
        {COMMANDS.map((c) => (
          <li key={c.cmd}>
            <span className={styles.cmdLabel}>{c.label}</span>
            <code className={styles.cmd} dir="ltr">
              {c.cmd}
            </code>
          </li>
        ))}
      </ul>
    </section>
  );
}
