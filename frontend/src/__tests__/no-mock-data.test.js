import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Code-integrity proof: the application source must contain none of the original
// hard-coded mock data, fake credentials, token storage, or debug leftovers.

const SRC = path.resolve(import.meta.dirname, "..");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" || e.name === "test" ? [] : walk(full);
    return /\.(js|jsx)$/.test(e.name) && !/\.test\.jsx?$/.test(e.name) ? [full] : [];
  });
}

const FILES = walk(SRC).map((f) => ({
  file: path.relative(SRC, f).replaceAll("\\", "/"),
  text: fs.readFileSync(f, "utf8"),
}));
const DASHBOARD = FILES.filter((f) => f.file.startsWith("app/dashboard/"));

const lines = (text) => text.split("\n").map((l, i) => ({ l, n: i + 1 }));
const hits = (files, re, { skip } = {}) =>
  files.flatMap(({ file, text }) =>
    lines(text)
      .filter(({ l }) => re.test(l) && !(skip && skip.test(l)))
      .map(({ l, n }) => `${file}:${n}: ${l.trim().slice(0, 90)}`),
  );

describe("no hard-coded mock data remains", () => {
  it("scanned a meaningful number of source files", () => {
    expect(FILES.length).toBeGreaterThan(150);
    expect(DASHBOARD.length).toBeGreaterThan(70);
  });

  // Every distinctive literal that used to live in the original mock arrays / JSX.
  const MOCK_TOKENS = [
    // people
    "أحمد الراشد", "أحمد ر.", "ليلى م.", "عمر س.", "فاطمة خ.", "يوسف أ.", "سارة ج.", "محمود سالم",
    "سارة حسن", "عمر سعيد", "محمد علي", "فاطمة خليل", "ليلى محمود", "عمر صالح", "أحمد محمد", "نورة سعد",
    "منظمة سلام", "مؤسسة مَسَار الإنسانية",
    // ids / codes
    "REQ-00", "TSK-00", "FCRM-4", "WASH-1.1", "EDU-3.1", "SHE-5.1", "HEA-4.1", "لايف-2.1",
    // numbers
    "24,318", "24318", "8,500$", "3,200$", "1,800$", "74.2%", "+12% هذا الشهر",
    // dates
    "2026-07-0", "2026-06-", "٢٦ يونيو ٢٠٢٦", "4 يوليو 2026", "25 يونيو", "يونيو 2026",
    // row titles
    "شراء معدات مكتبية", "برنامج تدريب الموظفين", "صيانة المركبات", "توفير المستلزمات الطبية",
    "تجديد رخصة البرمجيات", "تحليل بيانات المجتمع", "تقرير متابعة شهر يونيو", "دعم الأسر المتضررة",
    "برنامج سبل العيش", "مشروع المياه والصرف الصحي", "التقرير المالي للربع الأول", "تقرير تقييم الربع الأول.pdf",
    "التقارير الميدانية", "بيانات_الاستطلاع.xlsx", "قائمة الحضور للمشروع",
    // credentials / hosts
    "masar@test.com", "password123", "onrender.com", "railway.app",
    // role / unit fixtures
    "محلل بيانات", "باحث ميداني", "مدير نظام",
  ];

  it.each(MOCK_TOKENS)("no occurrence of the mock literal %s", (token) => {
    // placeholders ("مثال: …") and descriptive comments are not data
    const found = hits(FILES, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), {
      skip: /placeholder=|^\s*(\/\/|\*|\{?\/\*)/,
    });
    expect(found).toEqual([]);
  });

  it("no dashboard component declares an inline fixture array/object of fake records", () => {
    // keys that only exist in fake rows (UI-config arrays use label/icon/href instead)
    const FIXTURE_KEYS = /\b(requester|assignee|owner|amount|price|usersCount|rolesCount|screensCount|achieved|avatarBg|avatarColor|statusType|prioType|badgeColor|valueColor)\s*:\s*["'\d]/;
    expect(hits(DASHBOARD, FIXTURE_KEYS)).toEqual([]);
  });

  it("no dashboard file defines a top-level data array of records with literal ids", () => {
    const re = /^\s*(const|let|var)\s+\w*(Data|data|List|list|rows|items|records)\w*\s*=\s*\[\s*(\{|$)/;
    expect(hits(DASHBOARD, re)).toEqual([]);
  });

  it("every dashboard data component imports a service/query (is wired to the API)", () => {
    const dataComponents = [
      "StatsGrid", "WeeklyActivity", "ActionPanels", "RequestsTable", "TasksTable", "UnitCard",
      "MealStats", "MealCharts", "MealActivityTable", "ComplaintsTable", "ComplaintsSidePanel",
      "IndicatorsTable", "IndicatorsSidePanel", "ReportsTable", "ReportsSidePanel",
      "FieldDataRecent", "FieldDataSummary", "FieldDataForm",
    ];
    const missing = dataComponents.filter((name) => {
      const f = DASHBOARD.find((x) => x.file.endsWith(`/${name}.js`));
      return !f || !/(@\/services|@\/hooks|@tanstack\/react-query|QueryState)/.test(f.text);
    });
    expect(missing).toEqual([]);
  });
});

describe("security & hygiene regressions", () => {
  it("no token handling in browser storage; the token name appears only in server/session code", () => {
    const allowed = ["lib/session.js", "proxy.js", "lib/access.js"];
    const offenders = hits(
      FILES.filter((f) => !allowed.includes(f.file) && !f.file.startsWith("app/api/")),
      /auth_token|userToken|localStorage\.(set|get)Item\(["']\w*token/i,
    );
    expect(offenders).toEqual([]);
  });

  it("no code writes a password into any storage", () => {
    const offenders = hits(FILES, /(session|local)Storage\.setItem\([^)]*password/i);
    expect(offenders).toEqual([]);
  });

  it("no console.log / alert() / confirm() left in app code", () => {
    expect(hits(FILES, /\bconsole\.log\(|(^|[^.\w])alert\(|(^|[^.\w])confirm\(/)).toEqual([]);
  });

  it("no hard-coded backend or third-party API hosts in client code", () => {
    expect(hits(FILES, /https?:\/\/[\w.-]+\.(app|com|io|dev)\b/, { skip: /^\s*(\/\/|\*)|xmlns|w3\.org|fonts\.|schema\.org|mail\.google\.com/ })).toEqual([]);
  });

  it("no direct fetch() outside the http client and server route handlers", () => {
    const offenders = hits(
      FILES.filter((f) => !["lib/http.js"].includes(f.file) && !f.file.startsWith("app/api/")),
      /\bfetch\(/,
    );
    expect(offenders).toEqual([]);
  });

  it("the root-level middleware.js and dead vercel rewrites are gone; src/proxy.js exists", () => {
    const root = path.resolve(SRC, "..");
    expect(fs.existsSync(path.join(root, "middleware.js"))).toBe(false);
    expect(fs.existsSync(path.join(root, "vercel.json"))).toBe(false);
    expect(fs.existsSync(path.join(SRC, "proxy.js"))).toBe(true);
  });

  it("the duplicate /under-review page and empty Stepper file are removed", () => {
    expect(fs.existsSync(path.join(SRC, "app/under-review"))).toBe(false);
    expect(fs.existsSync(path.join(SRC, "app/verify-email/_components/Stepper"))).toBe(false);
  });
});
