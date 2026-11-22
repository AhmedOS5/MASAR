// One-off: replaces the hard-coded slate/emerald hex colours in the CSS modules with the design tokens of
// src/app/globals.css (--brand-*, --ds-*). Safe to re-run (already-converted files have no hex left to match).
// Usage (from frontend/):  node scripts/tokenize-css.mjs          -> converts in place
//                          node scripts/tokenize-css.mjs --dry    -> only lists what would change
import fs from "node:fs";
import path from "node:path";

const MAP = {
  "#064e3b": "var(--brand-900)", "#065f46": "var(--brand-800)", "#047857": "var(--brand-700)", "#059669": "var(--brand-600)",
  "#10b981": "var(--brand-500)", "#d1fae5": "var(--brand-100)", "#ecfdf5": "var(--brand-50)", "#a7f3d0": "var(--brand-200)",
  "#64748b": "var(--ds-muted)", "#e2e8f0": "var(--ds-line)", "#f1f5f9": "var(--ds-surface-2)", "#94a3b8": "var(--ds-subtle)",
  "#f8fafc": "var(--ds-surface)", "#334155": "var(--ds-ink-2)", "#cbd5e1": "var(--ds-line-strong)", "#1e293b": "var(--ds-ink)",
  "#0f172a": "var(--ds-ink)",
  // pass 2: neutrals / teal
  "#475569": "var(--ds-ink-3)", "#dbe2ea": "var(--ds-line)", "#fcfdff": "var(--ds-card)", "#fbfdff": "var(--ds-card)",
  "#f4f6fa": "var(--ds-surface-2)", "#f4f7fb": "var(--ds-surface-2)", "#eef2f7": "var(--ds-surface-2)",
  "#edf2f7": "var(--ds-surface-2)", "#edf5f4": "var(--ds-surface-2)",
  "#0f766e": "var(--brand-700)", "#026960": "var(--brand-800)", "#ccfbf1": "var(--brand-100)", "#f0fdfa": "var(--brand-50)",
  "#043629": "var(--brand-900)", "#044e3a": "var(--brand-900)", "#024843": "var(--brand-900)", "#00a86b": "var(--brand-600)",
  // status: danger / warning / success / info
  "#dc2626": "var(--ds-danger-fg)", "#ef4444": "var(--ds-danger-fg)", "#b91c1c": "var(--ds-danger-fg)", "#991b1b": "var(--ds-danger-fg)",
  "#fb7185": "var(--ds-danger-fg)", "#fee2e2": "var(--ds-danger-bg)", "#fef2f2": "var(--ds-danger-bg)",
  "#fecaca": "var(--ds-danger-line)", "#fca5a5": "var(--ds-danger-line)",
  "#d97706": "var(--ds-warning-fg)", "#b45309": "var(--ds-warning-fg)", "#92400e": "var(--ds-warning-fg)",
  "#f59e0b": "var(--ds-warning-fg)", "#ea580c": "var(--ds-warning-fg)",
  "#fef3c7": "var(--ds-warning-bg)", "#fffbeb": "var(--ds-warning-bg)", "#fff7ed": "var(--ds-warning-bg)",
  "#ffedd5": "var(--ds-warning-bg)", "#fef9c3": "var(--ds-warning-bg)", "#fde68a": "var(--ds-warning-line)", "#fed7aa": "var(--ds-warning-line)",
  "#16a34a": "var(--ds-success-fg)", "#166534": "var(--ds-success-fg)", "#4ade80": "var(--ds-success-fg)", "#34d399": "var(--ds-success-fg)",
  "#f0fdf4": "var(--ds-success-bg)", "#dcfce7": "var(--ds-success-bg)", "#bbf7d0": "var(--ds-success-line)",
  "#e0f2fe": "var(--ds-info-bg)", "#0369a1": "var(--ds-info-fg)", "#0284c7": "var(--ds-info-fg)", "#bae6fd": "var(--ds-info-line)",
  // category accent (violet / pink / indigo)
  "#7c3aed": "var(--ds-violet-fg)", "#6366f1": "var(--ds-violet-fg)", "#db2777": "var(--ds-violet-fg)",
  "#ede9fe": "var(--ds-violet-bg)", "#f5f3ff": "var(--ds-violet-bg)", "#f3e8ff": "var(--ds-violet-bg)", "#fdf2f8": "var(--ds-violet-bg)",
  "#e0d7ff": "var(--ds-violet-line)",
};
// The retired blue accent. [default token, token inside a status-like selector (status/badge/pill/chip/tag/priority)]
const BLUE = {
  "#2563eb": ["var(--brand-600)", "var(--ds-info-fg)"], "#1d4ed8": ["var(--brand-700)", "var(--ds-info-fg)"],
  "#0056b3": ["var(--brand-700)", "var(--ds-info-fg)"], "#1e6ae6": ["var(--brand-600)", "var(--ds-info-fg)"],
  "#1e40af": ["var(--brand-900)", "var(--ds-info-fg)"],
  "#eff6ff": ["var(--brand-50)", "var(--ds-info-bg)"], "#f0f7ff": ["var(--brand-50)", "var(--ds-info-bg)"],
  "#f8fbff": ["var(--brand-50)", "var(--ds-info-bg)"], "#dbeafe": ["var(--brand-100)", "var(--ds-info-bg)"],
  "#bfdbfe": ["var(--brand-200)", "var(--ds-info-line)"], "#bee3f8": ["var(--brand-200)", "var(--ds-info-line)"],
};
const STATUS_LIKE = /status|badge|pill|chip|tag|priority|tone/i;
// translucent versions of the retired blue / old emerald -> brand teal / deep green
const RGBA = [[/rgba\(\s*37\s*,\s*99\s*,\s*235\s*,/g, "rgba(13, 148, 136,"], [/rgba\(\s*30\s*,\s*64\s*,\s*175\s*,/g, "rgba(15, 81, 50,"],
  [/rgba\(\s*16\s*,\s*185\s*,\s*129\s*,/g, "rgba(13, 148, 136,"]];
const SRC = path.resolve(import.meta.dirname, "..", "src");
const dry = process.argv.includes("--dry");

function* css(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* css(p);
    else if (e.name.endsWith(".css") && e.name !== "globals.css") yield p; // globals.css defines the tokens: keep its hex
  }
}

const scope = (process.argv.find((a) => a.startsWith("--scope=")) || "--scope=app").slice(8);
const rel = (f) => path.relative(SRC, f).replaceAll("\\", "/");
const AUTH = /^app\/(login|register|verify-email|set-password|reset-password|forgot-password|onboarding|activation-success)\/|^components\/auth\//;
const inScope = (r) => {
  if (r.startsWith("app/_components/")) return false; // landing page keeps its own theme
  if (scope === "all") return true;
  return scope === "auth" ? AUTH.test(r) : !AUTH.test(r);
};

// Rule-aware: the selector decides whether a blue becomes brand teal or the "info" tone.
function convert(text) {
  let n = 0;
  const out = text.replace(/([^{}]+)\{([^{}]*)\}/g, (_whole, selector, body) => {
    const statusLike = STATUS_LIKE.test(selector);
    let b = body
      .replace(/#[0-9a-fA-F]{3,6}\b/g, (hex) => {
        let h = hex.toLowerCase();
        if (h === "#fff") h = "#ffffff";
        const v = BLUE[h]?.[statusLike ? 1 : 0] ?? MAP[h];
        if (v) n++;
        return v ?? hex;
      })
      .replace(/(^|[\s;])(color\s*:\s*)#fff(?:fff)?\b/gi, (_m, pre, prop) => { n++; return `${pre}${prop}var(--ds-on-brand)`; })
      .replace(/#fff(?:fff)?\b/gi, () => { n++; return "var(--ds-card)"; });
    for (const [re, to] of RGBA) b = b.replace(re, () => { n++; return to; });
    return `${selector}{${b}}`;
  });
  return { out, n };
}

let files = 0, colours = 0;
for (const file of css(SRC)) {
  if (!inScope(rel(file))) continue;
  const { out, n } = convert(fs.readFileSync(file, "utf8"));
  if (!n) continue;
  files++; colours += n;
  console.log(`${dry ? "would change" : "changed"} ${rel(file)} (${n})`);
  if (!dry) fs.writeFileSync(file, out);
}
console.log(`${files} files, ${colours} colours${dry ? " (dry run)" : ""} [scope=${scope}]`);
