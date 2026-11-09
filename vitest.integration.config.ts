import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Needs a disposable Postgres with the migrations applied, named *_test:
//   TEST_DATABASE_URL=postgresql://user@localhost:5432/courses_test npm run test:integration
export default defineConfig({
  resolve: {
    alias: { "@": here("./src"), "server-only": here("./test/server-only.ts") },
  },
  test: {
    include: ["src/**/*.int.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      SESSION_SECRET: "test-secret-test-secret-test-secret-1234",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
    },
  },
});
