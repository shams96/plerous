import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.js'],
    setupFiles: ['./test/setup-env.js'],
    // Inline domain-event dispatch + webhook secret, set before any module loads.
    env: { EVENTS_SYNC: '1', PAYER_WEBHOOK_SECRET: 'test-secret' },
    include: ['test/**/*.test.js'],
    testTimeout: 20000,
    hookTimeout: 40000,
    // Shared Postgres/Redis — run files serially to avoid cross-test interference.
    fileParallelism: false,
    pool: 'forks',
  },
})
