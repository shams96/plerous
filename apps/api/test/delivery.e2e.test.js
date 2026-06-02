/**
 * E2E: specialist "confirmed receipt" via the public secure link.
 * This is what makes the "confirmed receipt" claim honest for the
 * fax / secure-link channel (no payer, no specialist login).
 */
import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '../src/db/client.js'
import { ReferralService } from '../src/modules/referrals/referral.service.js'
import { makeReferral } from './helpers/fixtures.js'

const svc = new ReferralService()

describe('Secure-link receipt confirmation', () => {
  it('acknowledgeByToken flips SUBMITTED → RECEIVED and stamps acknowledgedAt', async () => {
    const token = 'TRK-' + randomUUID().slice(0, 8).toUpperCase()
    const { referral } = await makeReferral('APPROVE001')
    await prisma.referral.update({ where: { id: referral.id }, data: { trackingToken: token } })

    const result = await svc.acknowledgeByToken(token)
    expect(result.acknowledged).toBe(true)
    expect(result.status).toBe('RECEIVED')

    const r = await prisma.referral.findUnique({ where: { id: referral.id } })
    expect(r.status).toBe('RECEIVED')
    expect(r.acknowledgedAt).toBeTruthy()
    expect(r.deliveredAt).toBeTruthy()
  })

  it('is idempotent — a second confirmation reports already acknowledged', async () => {
    const token = 'TRK-' + randomUUID().slice(0, 8).toUpperCase()
    const { referral } = await makeReferral('APPROVE001')
    await prisma.referral.update({ where: { id: referral.id }, data: { trackingToken: token } })

    await svc.acknowledgeByToken(token)
    const second = await svc.acknowledgeByToken(token)
    expect(second.alreadyAcknowledged).toBe(true)
    expect(second.status).toBe('RECEIVED')
  })
})
