import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    // `node` stays the default: most tests here are permission matrices, query
    // builders and pure rules, and giving them a DOM they never touch only
    // makes them slower. Component tests opt in with a
    // `@vitest-environment jsdom` docblock, which has the side benefit of
    // saying at the top of the file that this one renders something.
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", ".next", "e2e/**"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
