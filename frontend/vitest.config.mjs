import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  // The app keeps JSX in .js files (Next.js allows it); teach esbuild to parse it.
  esbuild: { loader: "jsx", include: /src\/.*\.jsx?$/, exclude: [], jsx: "automatic" },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node", // component tests opt in with `// @vitest-environment jsdom`
    setupFiles: ["./src/test/setup.js"],
    include: ["src/**/*.test.{js,jsx}"],
    css: { modules: { classNameStrategy: "non-scoped" } },
    restoreMocks: true,
  },
});
