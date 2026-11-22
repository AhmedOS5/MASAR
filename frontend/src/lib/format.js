// Presentation helpers (no data lives here).

const NUM = "ar-u-nu-latn"; // Arabic month names, Latin digits (matches the original design)

export function formatDate(iso, opts = { day: "numeric", month: "long", year: "numeric" }) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat(NUM, opts).format(d);
}

export function formatDateTime(iso) {
  return formatDate(iso, {
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatIsoDay(iso) {
  if (!iso) return "—";
  return String(iso).slice(0, 10);
}

export function formatNumber(n) {
  if (n === null || n === undefined || n === "") return "—";
  return new Intl.NumberFormat(NUM).format(Number(n));
}

export function formatMoney(n, currency = "USD") {
  if (n === null || n === undefined || n === "") return "—";
  return new Intl.NumberFormat(NUM, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(n));
}

export function timeAgo(iso, now = Date.now()) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return String(iso);
  const diff = Math.round((t - now) / 1000); // seconds, negative = past
  const rtf = new Intl.RelativeTimeFormat("ar", { numeric: "auto" });
  const steps = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, secs] of steps) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return rtf.format(diff, "second");
}

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export const initialOf = (name) => (name ? String(name).trim().charAt(0) : "؟");

const AVATAR_PALETTE = [
  ["#d1fae5", "#065f46"],
  ["#e0f2fe", "#0369a1"],
  ["#f3e8ff", "#6b21a8"],
  ["#fee2e2", "#991b1b"],
  ["#ffedd5", "#9a3412"],
  ["#e2e8f0", "#475569"],
];

/** Deterministic avatar colours derived from the name (purely presentational). */
export function avatarColors(name = "") {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [bg, color] = AVATAR_PALETTE[h % AVATAR_PALETTE.length];
  return { backgroundColor: bg, color };
}

export function fileKind(name = "", mime = "") {
  const ext = String(name).split(".").pop().toLowerCase();
  if (["xls", "xlsx", "csv"].includes(ext) || mime.includes("sheet")) return "xls";
  if (["doc", "docx"].includes(ext) || mime.includes("word")) return "doc";
  if (ext === "pdf" || mime.includes("pdf")) return "pdf";
  return "other";
}

export const toPercent = (achieved, target) => {
  const t = Number(target);
  if (!t) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(achieved) / t) * 100)));
};
