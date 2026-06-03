/**
 * Full HTTP MFA flow against the running API (:3091):
 * login → setup → verify(enable) → login(mfaRequired) → confirm(TOTP) → JWT works.
 * Also covers the backup-code path. This is the proof the auth path is real.
 */
import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { authenticator } from 'otplib'
import { prisma } from '../src/db/client.js'

const API = 'http://localhost:3091'
const PW = 'Str0ng!Pass9'

async function post(path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body || {}),
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

async function makeUser() {
  const email = `mfa-${randomUUID().slice(0, 8)}@example.com`
  await prisma.user.create({
    data: { email, password: await bcrypt.hash(PW, 10), role: 'ORG_ADMIN', firstName: 'Mfa', lastName: 'User', isActive: true },
  })
  return email
}

describe('MFA full HTTP flow', () => {
  it('enrolls and then requires a TOTP code at login', async () => {
    const email = await makeUser()

    // 1. Login (no MFA yet) → full JWT
    const login1 = await post('/v1/session/login', { email, password: PW })
    expect(login1.status).toBe(200)
    expect(login1.json.token).toBeTruthy()
    const token = login1.json.token

    // 2. Setup → secret
    const setup = await post('/v1/session/mfa/setup', {}, token)
    expect(setup.status).toBe(200)
    const secret = setup.json.secret
    expect(secret).toBeTruthy()

    // 3. Verify with a valid TOTP code → MFA enabled + backup codes
    const verify = await post('/v1/session/mfa/verify', { code: authenticator.generate(secret) }, token)
    expect(verify.status).toBe(200)
    expect(Array.isArray(verify.json.backupCodes)).toBe(true)
    expect(verify.json.backupCodes.length).toBe(8)

    // 4. Login again → now gated by MFA
    const login2 = await post('/v1/session/login', { email, password: PW })
    expect(login2.json.mfaRequired).toBe(true)
    expect(login2.json.mfaToken).toBeTruthy()
    expect(login2.json.token).toBeFalsy()

    // 5. Confirm with TOTP → full JWT
    const confirm = await post('/v1/session/mfa/confirm', { mfaToken: login2.json.mfaToken, code: authenticator.generate(secret) })
    expect(confirm.status).toBe(200)
    expect(confirm.json.token).toBeTruthy()

    // 6. The issued JWT actually works
    const me = await fetch(`${API}/v1/session/me`, { headers: { Authorization: `Bearer ${confirm.json.token}` } })
    expect(me.status).toBe(200)
    expect((await me.json()).email).toBe(email)
  })

  it('rejects a wrong TOTP code at verify', async () => {
    const email = await makeUser()
    const token = (await post('/v1/session/login', { email, password: PW })).json.token
    await post('/v1/session/mfa/setup', {}, token)
    const bad = await post('/v1/session/mfa/verify', { code: '000000' }, token)
    expect(bad.status).toBe(401)
  })

  it('accepts a one-time backup code at login', async () => {
    const email = await makeUser()
    const token = (await post('/v1/session/login', { email, password: PW })).json.token
    const secret = (await post('/v1/session/mfa/setup', {}, token)).json.secret
    const backupCodes = (await post('/v1/session/mfa/verify', { code: authenticator.generate(secret) }, token)).json.backupCodes

    const login = await post('/v1/session/login', { email, password: PW })
    const confirm = await post('/v1/session/mfa/confirm', { mfaToken: login.json.mfaToken, code: backupCodes[0] })
    expect(confirm.status).toBe(200)
    expect(confirm.json.token).toBeTruthy()
  })
})
