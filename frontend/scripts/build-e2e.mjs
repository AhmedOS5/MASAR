// Production build into .next-e2e (used by `npm run e2e`).
import { spawnSync } from "node:child_process";
const r = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  stdio: "inherit",
  env: { ...process.env, NEXT_DIST_DIR: ".next-e2e", NEXT_TELEMETRY_DISABLED: "1" },
});
process.exit(r.status ?? 1);
