/**
 * Module 4 — IntakeGateway (Quadrant C: inbound fax → specialist queue).
 * An inbound fax to an on-network office becomes a RECEIVED referral on that
 * specialist's queue, and the outside PCP becomes a prospect.
 */
import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '../src/db/client.js'
import { intakeGateway } from '../src/intake/intake-gateway.js'

async function makeSpecialistOrg(fax) {
  return prisma.organization.create({
    data: {
      name: `Specialist Center ${randomUUID().slice(0, 5)}`,
      npi: String(Math.floor(1000000000 + Math.random() * 8999999999)),
      type: 'SPECIALIST_PRACTICE',
      address: { city: 'Austin', state: 'TX' },
      phone: '+15125550000',
      email: `spec-${randomUUID().slice(0, 5)}@example.com`,
      faxNumber: fax,
    },
  })
}

describe('IntakeGateway (inbound fax)', () => {
  it('ingests a fax to a known office → RECEIVED referral on the specialist queue', async () => {
    const fax = '+1512' + Math.floor(1000000 + Math.random() * 8999999)
    const org = await makeSpecialistOrg(fax)
    const fromNpi = '6' + randomUUID().replace(/\D/g, '').slice(0, 9).padEnd(9, '0')

    const result = await intakeGateway.ingestFax({
      toFax: fax,
      fromFax: '+15129990000',
      fromName: 'Dr Outside PCP',
      fromNpi,
      patientFirstName: 'Jane',
      patientLastName: 'Doe',
      specialty: 'Cardiology',
      reason: 'Chest pain workup',
      diagnosisCodes: ['R07.9'],
    })

    expect(result.accepted).toBe(true)
    const ref = await prisma.referral.findUnique({ where: { id: result.referralId } })
    expect(ref.receivingOrgId).toBe(org.id)
    expect(ref.sendingOrgId).toBeNull()
    expect(ref.status).toBe('RECEIVED')
    expect(ref.source).toBe('fax')
    expect(ref.sourceNpi).toBe(fromNpi)

    // Outside PCP became a prospect via the growth loop.
    const prospect = await prisma.prospect.findUnique({ where: { npi_source: { npi: fromNpi, source: 'inbound_fax' } } })
    expect(prospect).toBeTruthy()
  })

  it('rejects a fax to an unknown office (we only intake for customers)', async () => {
    const result = await intakeGateway.ingestFax({ toFax: '+1000NOTACUSTOMER', fromNpi: '1234567890' })
    expect(result.accepted).toBe(false)
    expect(result.reason).toBe('no_matching_org')
  })
})
