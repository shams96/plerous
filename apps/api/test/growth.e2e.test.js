/**
 * Module 3 — Growth subscriber (the distribution engine).
 * An off-network party event must create a qualified Prospect. Wired purely as
 * an event subscriber — no coupling to the referral code.
 */
import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '../src/db/client.js'
import { emitDomainEvent } from '../src/events/bus.js'

describe('Growth subscriber (off-network → Prospect)', () => {
  it('creates a Prospect from an off-network specialist with an NPI', async () => {
    const npi = '8' + randomUUID().replace(/\D/g, '').slice(0, 9).padEnd(9, '0')
    await emitDomainEvent('referral.party.off_network', {
      referralId: randomUUID(), npi, name: 'Dr Offnet', specialty: 'Cardiology',
      fax: '+15125550000', state: 'TX', source: 'outbound_referral',
    })
    const p = await prisma.prospect.findUnique({ where: { npi_source: { npi, source: 'outbound_referral' } } })
    expect(p).toBeTruthy()
    expect(p.specialty).toBe('Cardiology')
    expect(['new', 'researched']).toContain(p.status)
  })

  it('is idempotent — same NPI+source does not duplicate', async () => {
    const npi = '7' + randomUUID().replace(/\D/g, '').slice(0, 9).padEnd(9, '0')
    const payload = { referralId: randomUUID(), npi, specialty: 'Neurology', source: 'outbound_referral' }
    await emitDomainEvent('referral.party.off_network', payload)
    await emitDomainEvent('referral.party.off_network', { ...payload, referralId: randomUUID() })
    const all = await prisma.prospect.findMany({ where: { npi, source: 'outbound_referral' } })
    expect(all.length).toBe(1)
  })

  it('creates a fax-only Prospect when no NPI is known', async () => {
    const fax = '+1512' + Math.floor(1000000 + Math.random() * 8999999)
    await emitDomainEvent('referral.party.off_network', {
      referralId: randomUUID(), npi: null, fax, source: 'outbound_referral', name: 'Unknown Specialist',
    })
    const p = await prisma.prospect.findFirst({ where: { faxNumber: fax, source: 'outbound_referral' } })
    expect(p).toBeTruthy()
  })
})
