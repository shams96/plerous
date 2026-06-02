/**
 * E2E: the payer prior-auth loop, end to end, against the partner simulator.
 *
 * Exercises the REAL pipeline — PriorAuthService → PayerGateway → FHIR adapter
 * → HTTP → simulator → decision applied to auth+referral → patient notification.
 * Async paths (poll + signed webhook) are covered too.
 *
 * Requires: Postgres + Redis up, and global-setup's simulator (:4011) +
 * webhook API (:3091) running.
 */
import { describe, it, expect } from 'vitest'
import { prisma } from '../src/db/client.js'
import { PriorAuthService } from '../src/modules/auth/auth.service.js'
import { pollAuthOnce } from '../src/workers/auth-poller.worker.js'
import { makeReferral, waitFor } from './helpers/fixtures.js'

const svc = new PriorAuthService()

async function authForReferral(referralId) {
  const r = await prisma.referral.findUnique({ where: { id: referralId }, include: { authorization: true } })
  return r?.authorization
}
async function notif(referralId, type) {
  return prisma.notification.findFirst({ where: { referralId, type } })
}

describe('Payer prior-auth loop (real gateway → simulator)', () => {
  it('Scenario 2: synchronous APPROVE → referral AUTH_APPROVED + patient notified', async () => {
    const { referral, payer } = await makeReferral('APPROVE001')

    await svc.submit({ referralId: referral.id, payerId: payer.id, procedureCodes: ['95810'], urgency: 'ROUTINE' })

    const auth = await authForReferral(referral.id)
    expect(auth.status).toBe('APPROVED')
    expect(auth.authNumber).toMatch(/^SIM-/)

    const r = await prisma.referral.findUnique({ where: { id: referral.id } })
    expect(r.status).toBe('AUTH_APPROVED')

    expect(await notif(referral.id, 'AUTH_APPROVED')).toBeTruthy()
  })

  it('Scenario 2b: synchronous DENY → referral AUTH_DENIED + denial reason + patient notified', async () => {
    const { referral, payer } = await makeReferral('DENY001')

    await svc.submit({ referralId: referral.id, payerId: payer.id, procedureCodes: ['95810'], urgency: 'ROUTINE' })

    const auth = await authForReferral(referral.id)
    expect(auth.status).toBe('DENIED')
    expect(auth.denialReason).toBeTruthy()

    const r = await prisma.referral.findUnique({ where: { id: referral.id } })
    expect(r.status).toBe('AUTH_DENIED')
    expect(await notif(referral.id, 'AUTH_DENIED')).toBeTruthy()
  })

  it('Scenario 3 (poll): PEND → status poll resolves to APPROVED', async () => {
    const { referral, payer } = await makeReferral('PENDPOLL001')

    await svc.submit({ referralId: referral.id, payerId: payer.id, procedureCodes: ['95810'], urgency: 'ROUTINE' })

    // Pending after submit.
    let auth = await authForReferral(referral.id)
    expect(['SUBMITTED', 'IN_REVIEW', 'PENDING']).toContain(auth.status)

    // Wait past the sim's pend delay, then drive one poll cycle deterministically.
    await new Promise((r) => setTimeout(r, 900))
    const result = await pollAuthOnce(auth.id)
    expect(result.status).toBe('APPROVED')

    const r = await prisma.referral.findUnique({ where: { id: referral.id } })
    expect(r.status).toBe('AUTH_APPROVED')
  })

  it('Scenario 3b (webhook): PEND → async signed webhook resolves to APPROVED', async () => {
    const { referral, payer } = await makeReferral('PENDWEBHOOK001')

    await svc.submit({ referralId: referral.id, payerId: payer.id, procedureCodes: ['95810'], urgency: 'ROUTINE' })

    // The simulator posts an HMAC-signed webhook to the :3091 API after its delay.
    const r = await waitFor(async () => {
      const ref = await prisma.referral.findUnique({ where: { id: referral.id } })
      return ref.status === 'AUTH_APPROVED' ? ref : null
    }, { timeout: 8000 })

    expect(r).toBeTruthy()
    expect(r.status).toBe('AUTH_APPROVED')
  })

  it('Scenario 5: eligibility check returns coverage for an active member', async () => {
    const { payer } = await makeReferral('APPROVE001')
    const result = await svc.validateEligibility({ memberId: 'APPROVE001', payerId: payer.id, serviceDate: '2026-06-15' })
    expect(result.eligible).toBe(true)
    expect(result.coverageActive).toBe(true)
  })

  it('Scenario 5b: ineligible member returns not-covered', async () => {
    const { payer } = await makeReferral('APPROVE001')
    // Distinct cache key (different member id) avoids the previous test's cache.
    const result = await svc.validateEligibility({ memberId: 'INELIGIBLE001', payerId: payer.id, serviceDate: '2026-06-15' })
    expect(result.eligible).toBe(false)
  })

  it('Scenario 8: denial feeds the learning loop (PolicyRule denial stats update)', async () => {
    const { referral, payer } = await makeReferral('DENY001', { procedureCodes: ['95999'] })
    // Seed a policy rule for this code so recordAuthOutcome has something to update.
    await prisma.policyRule.create({
      data: { payerId: payer.id, cptCode: '95999', paRequired: true, criteria: {}, denialCount: 0, submissionCount: 0 },
    }).catch(() => {})

    await svc.submit({ referralId: referral.id, payerId: payer.id, procedureCodes: ['95999'], urgency: 'ROUTINE' })

    const rule = await waitFor(async () => {
      const r = await prisma.policyRule.findFirst({ where: { payerId: payer.id, cptCode: '95999' } })
      return r && r.submissionCount > 0 ? r : null
    }, { timeout: 4000 })

    expect(rule).toBeTruthy()
    expect(rule.submissionCount).toBeGreaterThan(0)
  })

})
