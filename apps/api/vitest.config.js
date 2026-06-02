import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.js'],
    include: ['test/**/*.test.js'],
    testTimeout: 20000,
    hookTimeout: 40000,
    // Shared Postgres/Redis — run files serially to avoid cross-test interference.
    fileParallelism: false,
    pool: 'forks',
  },
})
