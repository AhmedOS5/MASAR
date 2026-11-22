// MASAR 2027 appearance: light / dark / follow-the-system, for the workspace (/dashboard) and the operator console only.
// The landing page keeps its own `data-theme` switch (Navbar). The resolved theme lives on <html data-app-theme="dark">;
// light is the absence of the attribute, so every token in globals.css works without it.
export const THEME_KEY = "masar-theme"; // stored: "light" | "dark" | "system"
export const THEMES = ["light", "dark", "system"];
const ATTR = "data-app-theme";

export function readStoredTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return THEMES.includes(v) ? v : "light";
  } catch {
    return "light"; // storage blocked (private mode, policy): fall back to the default
  }
}

export function storeTheme(pref) {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* the choice still applies for this visit */
  }
}

const prefersDark = () => Boolean(window.matchMedia?.("(prefers-color-scheme: dark)")?.matches);
export const resolveTheme = (pref) => (pref === "dark" || (pref === "system" && prefersDark()) ? "dark" : "light");

export function applyTheme(pref) {
  const root = document.documentElement;
  if (resolveTheme(pref) === "dark") root.setAttribute(ATTR, "dark");
  else root.removeAttribute(ATTR);
}

export const clearTheme = () => document.documentElement.removeAttribute(ATTR);

// Runs in <head> before first paint (see app/layout.js) so a dark workspace never flashes light. Only the workspace and
// the operator console use it; keep it in step with readStoredTheme/resolveTheme above.
export const THEME_BOOT_SCRIPT = `(function(){try{var p=location.pathname;if(p.indexOf("/dashboard")!==0&&p.indexOf("/operator")!==0)return;var v=localStorage.getItem("${THEME_KEY}");var d=v==="dark"||(v==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.setAttribute("${ATTR}","dark")}catch(e){}})();`;
