/**
 * Vitest global setup — boots the controllable counterparty + a webhook-
 * receiving API instance, so E2E tests exercise the real pipeline:
 *   - payer simulator on :4011 (deterministic, signs webhooks with test-secret)
 *   - Plerous API on :3091 (receives async webhooks, verifies HMAC)
 * Both share the same Postgres + Redis as the in-process test code.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const apiDir = resolve(__dirname, '..') // apps/api
const appsDir = resolve(apiDir, '..') // apps

let sim, api

async function waitHttp(url, timeout = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

export async function setup() {
  const childEnv = {
    ...process.env,
    PAYER_WEBHOOK_SECRET: 'test-secret',
    PAYER_SIM_BASE: 'http://localhost:4011',
  }

  sim = spawn(process.execPath, [resolve(appsDir, 'payer-sim/server.js')], {
    env: { ...childEnv, PORT: '4011', WEBHOOK_SECRET: 'test-secret', PLEROUS_WEBHOOK_URL: 'http://localhost:3091/v1/auth/webhook/sim', PEND_DELAY_MS: '600' },
    stdio: 'inherit',
  })

  api = spawn(process.execPath, [resolve(apiDir, 'src/server.js')], {
    env: { ...childEnv, PORT: '3091' },
    stdio: 'inherit',
  })

  await waitHttp('http://localhost:4011/health')
  await waitHttp('http://localhost:3091/health')
}

export async function teardown() {
  for (const p of [sim, api]) {
    try { p?.kill('SIGTERM') } catch { /* ignore */ }
  }
}
