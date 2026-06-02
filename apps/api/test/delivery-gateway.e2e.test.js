/**
 * Module 2 — DeliveryGateway channel selection + Delivery records.
 * on-network → in_app delivered; off-network+fax → fax transmitted;
 * lost fax → failed (no deliveredAt). Each emits a referral.delivered event.
 */
import { describe, it, expect } from 'vitest'
import { prisma } from '../src/db/client.js'
import { deliveryGateway } from '../src/delivery/delivery-gateway.js'
import { makeReferral, createOrg, createProvider } from './helpers/fixtures.js'

async function refFor(id) {
  return prisma.referral.findUnique({ where: { id } })
}
async function deliveryFor(id) {
  return prisma.delivery.findFirst({ where: { referralId: id }, orderBy: { createdAt: 'desc' } })
}

describe('DeliveryGateway', () => {
  it('on-network specialist → in_app, delivered, deliveredAt stamped', async () => {
    const { referral } = await makeReferral('APPROVE001')
    const specOrg = await createOrg()
    const specialist = await createProvider(specOrg.id)
    await prisma.referral.update({ where: { id: referral.id }, data: { receivingProviderId: specialist.id } })

    const r = await refFor(referral.id)
    const delivery = await deliveryGateway.deliver(r)

    expect(delivery.channel).toBe('in_app')
    expect(delivery.status).toBe('delivered')
    expect((await refFor(referral.id)).deliveredAt).toBeTruthy()
    expect(await prisma.referralEvent.findFirst({ where: { referralId: referral.id, type: 'referral.delivered' } })).toBeTruthy()
  })

  it('off-network specialist with fax → fax transmitted', async () => {
    const { referral } = await makeReferral('APPROVE001')
    await prisma.referral.update({
      where: { id: referral.id },
      data: { targetNpi: '9999999990', targetName: 'Dr Offnet', targetSpecialty: 'Cardiology', targetFax: '+15125551234' },
    })

    const delivery = await deliveryGateway.deliver(await refFor(referral.id))
    expect(delivery.channel).toBe('fax')
    expect(delivery.status).toBe('transmitted')
    expect(delivery.externalId).toMatch(/^FAX-/)
    expect((await refFor(referral.id)).deliveredAt).toBeTruthy()
  })

  it('lost fax → failed, no deliveredAt', async () => {
    const { referral } = await makeReferral('APPROVE001')
    await prisma.referral.update({
      where: { id: referral.id },
      data: { targetNpi: '9999999991', targetFax: '+1555LOST000' },
    })

    const delivery = await deliveryGateway.deliver(await refFor(referral.id))
    expect(delivery.channel).toBe('fax')
    expect(delivery.status).toBe('failed')
    expect((await refFor(referral.id)).deliveredAt).toBeFalsy()
  })

  it('off-network delivery emits referral.party.off_network (for the growth loop)', async () => {
    const { referral } = await makeReferral('APPROVE001')
    await prisma.referral.update({
      where: { id: referral.id },
      data: { targetNpi: '9999999992', targetFax: '+15125559999' },
    })
    await deliveryGateway.deliver(await refFor(referral.id))
    const evt = await prisma.referralEvent.findFirst({ where: { referralId: referral.id, type: 'referral.party.off_network' } })
    expect(evt).toBeTruthy()
    expect(evt.payload.npi).toBe('9999999992')
  })
})
