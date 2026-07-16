import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Each test file boots its own in-memory MongoDB and imports a fresh
    // module graph, so files are fully isolated from each other (rate-limiter
    // counters, DB contents, env-dependent config like NODE_ENV).
    include: ["tests/**/*.test.ts"],
    // mongodb-memory-server downloads a mongod binary on first ever run;
    // generous hook timeout so that download doesn't fail the suite.
    hookTimeout: 120_000,
    testTimeout: 30_000,
    // Each test file spawns its own in-memory mongod for isolation. Running
    // files in parallel worker threads means several mongod processes start
    // at once and compete for CPU, which on a loaded machine pushes some past
    // mongodb-memory-server's 10s launch timeout. Sequential files keep each
    // mongod's startup uncontended — slower total wall-clock, but reliable.
    fileParallelism: false,
  },
});
