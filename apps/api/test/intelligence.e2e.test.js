/**
 * Module 1 — Event bus + Intelligence seed.
 * Emitting domain events must (a) append to the ReferralEvent log and
 * (b) roll up de-identified specialist performance into ProviderStat.
 */
import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '../src/db/client.js'
import { emitDomainEvent } from '../src/events/bus.js'

describe('Event bus + Intelligence (ProviderStat)', () => {
  it('appends every event to the append-only ReferralEvent log', async () => {
    const referralId = randomUUID()
    await emitDomainEvent('referral.delivered', { referralId, tenantOrgId: 'org-x', specialistNpi: 'INTEL-' + referralId.slice(0, 6), channel: 'fax' })
    const rows = await prisma.referralEvent.findMany({ where: { referralId } })
    expect(rows.length).toBe(1)
    expect(rows[0].type).toBe('referral.delivered')
    expect(rows[0].tenantOrgId).toBe('org-x')
  })

  it('rolls referral.delivered/acknowledged/scheduled into ProviderStat', async () => {
    const npi = 'STAT-' + randomUUID().slice(0, 8)
    await emitDomainEvent('referral.delivered',   { referralId: randomUUID(), specialistNpi: npi, specialty: 'Cardiology', state: 'TX' })
    await emitDomainEvent('referral.acknowledged', { referralId: randomUUID(), specialistNpi: npi, ackMs: 1000 })
    await emitDomainEvent('referral.scheduled',    { referralId: randomUUID(), specialistNpi: npi })

    const stat = await prisma.providerStat.findUnique({ where: { npi } })
    expect(stat).toBeTruthy()
    expect(stat.referralsReceived).toBe(1)
    expect(stat.acknowledged).toBe(1)
    expect(stat.scheduled).toBe(1)
    expect(stat.specialty).toBe('Cardiology')
    expect(stat.ackTimeSumMs).toBe(1000)
    expect(stat.ackTimeCount).toBe(1)
  })

  it('accumulates across multiple referrals for the same specialist', async () => {
    const npi = 'ACC-' + randomUUID().slice(0, 8)
    await emitDomainEvent('referral.delivered', { referralId: randomUUID(), specialistNpi: npi })
    await emitDomainEvent('referral.delivered', { referralId: randomUUID(), specialistNpi: npi })
    const stat = await prisma.providerStat.findUnique({ where: { npi } })
    expect(stat.referralsReceived).toBe(2)
  })
})
