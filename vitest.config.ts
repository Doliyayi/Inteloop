import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "server-only": resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    passWithNoTests: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts"],
    exclude: ["node_modules", ".next", "tests/e2e/**", "tests/db/**"],
  },
});
