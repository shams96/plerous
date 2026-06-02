/**
 * E2E: SLA / expiry worker — a lapsed authorization is auto-expired and the
 * referral moves to EXPIRED unless it already progressed.
 */
import { describe, it, expect } from 'vitest'
import { prisma } from '../src/db/client.js'
import { runSla } from '../src/workers/sla.worker.js'
import { makeReferral } from './helpers/fixtures.js'

describe('SLA / auth expiry', () => {
  it('expires an APPROVED auth past expiresAt and moves the referral to EXPIRED', async () => {
    const { referral, payer } = await makeReferral('APPROVE001')
    const yesterday = new Date(Date.now() - 86400000)
    const auth = await prisma.priorAuthorization.create({
      data: {
        payerId: payer.id,
        status: 'APPROVED',
        authNumber: 'SIM-EXPIRED-1',
        expiresAt: yesterday,
        requestedCodes: ['95810'],
        referrals: { connect: { id: referral.id } },
      },
    })
    await prisma.referral.update({ where: { id: referral.id }, data: { status: 'AUTH_APPROVED', authorizationId: auth.id } })

    const result = await runSla()
    expect(result.authsExpired).toBeGreaterThan(0)

    const a = await prisma.priorAuthorization.findUnique({ where: { id: auth.id } })
    expect(a.status).toBe('EXPIRED')
    const r = await prisma.referral.findUnique({ where: { id: referral.id } })
    expect(r.status).toBe('EXPIRED')
  })

  it('does NOT expire a referral that already progressed to SCHEDULED', async () => {
    const { referral, payer } = await makeReferral('APPROVE001')
    const auth = await prisma.priorAuthorization.create({
      data: {
        payerId: payer.id,
        status: 'APPROVED',
        authNumber: 'SIM-EXPIRED-2',
        expiresAt: new Date(Date.now() - 86400000),
        requestedCodes: ['95810'],
        referrals: { connect: { id: referral.id } },
      },
    })
    await prisma.referral.update({ where: { id: referral.id }, data: { status: 'SCHEDULED', authorizationId: auth.id } })

    await runSla()
    const r = await prisma.referral.findUnique({ where: { id: referral.id } })
    expect(r.status).toBe('SCHEDULED') // untouched
  })
})
