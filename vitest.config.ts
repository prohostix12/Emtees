import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "src"),
      "@/pages": path.resolve(templateRoot, "src/lms-pages"),
      "@contracts": path.resolve(templateRoot, "contracts"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
      "@db": path.resolve(templateRoot, "db"),
      "db": path.resolve(templateRoot, "db"),
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 60000,
    include: [
      "api/**/*.test.ts",
      "api/**/*.spec.ts",
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.spec.ts",
      "tests/property/**/*.test.ts",
      "tests/property/**/*.spec.ts",
      "tests/integration/**/*.test.ts",
      "tests/integration/**/*.spec.ts",
    ],
  },
});
