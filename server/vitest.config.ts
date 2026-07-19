import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Each file gets its own in-memory DB and module state.
    include: ["tests/**/*.test.ts"],
    // The first run may need time to download the Mongo test binary.
    hookTimeout: 120_000,
    testTimeout: 30_000,
    // Starting several Mongo test processes together is flaky on slower machines.
    fileParallelism: false,
  },
});
