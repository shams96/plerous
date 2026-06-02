/**
 * E2E: inbound payer webhook authentication (HMAC).
 * Hits the running API (:3091) directly — a forged/missing signature must be
 * rejected 401; a correctly signed request must be accepted 200.
 */
import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'

const WEBHOOK_URL = 'http://localhost:3091/v1/auth/webhook/sim'
const SECRET = 'test-secret'

function sign(body) {
  return 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex')
}

describe('Webhook HMAC verification', () => {
  const payload = JSON.stringify({ event: 'authorization.decision', authorizationNumber: 'SIM-DOESNOTEXIST', status: 'APPROVED' })

  it('rejects a missing signature with 401', async () => {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    })
    expect(res.status).toBe(401)
  })

  it('rejects a forged signature with 401', async () => {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Plerous-Signature': 'sha256=deadbeef' },
      body: payload,
    })
    expect(res.status).toBe(401)
  })

  it('accepts a correctly signed request with 200', async () => {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Plerous-Signature': sign(payload) },
      body: payload,
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })
})
