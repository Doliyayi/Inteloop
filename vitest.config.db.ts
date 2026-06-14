import { defineConfig } from "vitest/config";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(filename: string): Record<string, string> {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && match[1] && match[2] !== undefined) {
      env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

// Earlier entries take precedence (the spread overwrites with later sources).
const env = {
  ...loadEnvFile(".env"),
  ...loadEnvFile(".env.local"),
  ...loadEnvFile(".env.test"),
  ...loadEnvFile(".env.test.local"),
};

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // RLS tests share users created in beforeAll. Run sequentially to keep
    // setup/teardown deterministic.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    env,
  },
});
