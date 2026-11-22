// Dark-mode pass (run AFTER scripts/tokenize-css.mjs). Every rule leaves the LIGHT theme exactly as it is — the tokens
// it introduces have the same value there — and only lets dark mode re-colour the surface:
//   - brand colours used as a BACKGROUND -> var(--fill-*)   (stay dark enough for white text in dark mode)
//   - `background: #fff`            -> var(--ds-card)         (white card surfaces)
//   - `color|fill|stroke: #fff`     -> var(--ds-on-brand)     (white text/icons on coloured fills stay white)
//   - glassy `rgba(255,255,255,>=0.5)` backgrounds and borders -> translucent card surface (faint white overlays are left alone)
// Safe to re-run. Usage (from frontend/):  node scripts/tokenize-css-dark.mjs [--dry]
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(import.meta.dirname, "..", "src");
const dry = process.argv.includes("--dry");
const WHITE = "#fff(?:fff)?\\b";

const glass = (_m, p, a) => (Number(a) >= 0.5 ? `${p}color-mix(in srgb, var(--ds-card) ${Math.round(Number(a) * 100)}%, transparent)` : _m);

const RULES = [
  // whole background declarations (gradients included): brand shades become fill tokens
  [/(?<![\w-])background(?:-color|-image)?\s*:[^;{}]*;/gi, (decl) =>
    decl.replace(/var\(--brand-(900|800|700|600)\)/g, "var(--fill-$1)")],
  [new RegExp(`(background(?:-color)?\\s*:\\s*)(?:${WHITE}|white\\b)`, "gi"), "$1var(--ds-card)"],
  [new RegExp(`((?<![\\w-])(?:color|fill|stroke)\\s*:\\s*)${WHITE}`, "gi"), "$1var(--ds-on-brand)"],
  [/(background(?:-color)?\s*:\s*)rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)/gi, glass],
  [/((?<![\w-])border(?:-color)?\s*:[^;{}]*?)rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)/gi, glass],
];

function* css(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* css(p);
    else if (e.name.endsWith(".css") && e.name !== "globals.css") yield p; // globals.css defines the tokens
  }
}

let files = 0, changes = 0;
for (const file of css(SRC)) {
  const text = fs.readFileSync(file, "utf8");
  let out = text;
  for (const [re, to] of RULES) out = out.replace(re, to);
  if (out === text) continue;
  const n = text.split("\n").filter((l, i) => l !== out.split("\n")[i]).length;
  files++; changes += n;
  console.log(`${dry ? "would change" : "changed"} ${path.relative(SRC, file)} (~${n} lines)`);
  if (!dry) fs.writeFileSync(file, out);
}
console.log(`${files} files${dry ? " (dry run)" : ""}`);
