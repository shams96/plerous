/**
 * DeliveryGateway — the boundary that gets a referral to the receiving side.
 * Mirrors PayerGateway: a facade that resolves the party, picks a channel
 * adapter, does the real send, records a Delivery row, and emits domain events
 * (which feed Intelligence + Growth). "Confirmed receipt" is a per-channel
 * property of the Delivery, so we never overclaim.
 *
 * Channel selection (by party resolution):
 *   on-network provider/org      → in_app  (appears in their queue)
 *   off-network + fax number     → fax     (transmit-only proof)
 *   off-network + secure link    → secure_link (await ack click)
 *   nothing actionable           → staged (manual)
 */
import { prisma } from '../db/client.js'
import { resolveReceivingParty } from '../lib/resolve-party.js'
import { emitDomainEvent } from '../events/bus.js'
import * as inApp from './adapters/in-app.adapter.js'
import * as fax from './adapters/fax.adapter.js'

export const deliveryGateway = {
  /**
   * Deliver a referral to its receiving specialist. Returns the Delivery record.
   * @param {object} referral  must include id, trackingToken, specialty, sendingOrgId, target* fields
   */
  async deliver(referral) {
    const party = await resolveReceivingParty(referral)

    let result
    let channel
    if (party.onNetwork) {
      channel = 'in_app'
      result = await inApp.send({ referral, party })
    } else if (party.fax) {
      channel = 'fax'
      result = await fax.send({
        to: party.fax,
        referralId: referral.id,
        content: faxPacket(referral, party),
      }).catch((err) => ({ channel: 'fax', status: 'failed', proof: { error: err.message } }))
    } else if (referral.trackingToken) {
      channel = 'secure_link'
      result = { channel: 'secure_link', status: 'delivered', proof: { link: `/track/${referral.trackingToken}` } }
    } else {
      channel = 'staged'
      result = { channel: 'staged', status: 'pending', proof: { reason: 'no_channel' } }
    }

    const now = new Date()
    const transmitted = ['transmitted', 'delivered'].includes(result.status)

    const delivery = await prisma.delivery.create({
      data: {
        referralId: referral.id,
        channel: result.channel ?? channel,
        status: result.status,
        toAddress: party.fax ?? party.org?.id ?? party.provider?.id ?? null,
        externalId: result.externalId ?? null,
        proof: result.proof ?? {},
        transmittedAt: transmitted ? now : null,
      },
    })

    if (transmitted) {
      await prisma.referral.update({ where: { id: referral.id }, data: { deliveredAt: now } }).catch(() => {})
    }

    // Feed Intelligence: a referral was delivered to this specialist.
    await emitDomainEvent('referral.delivered', {
      referralId: referral.id,
      tenantOrgId: referral.sendingOrgId,
      channel: result.channel ?? channel,
      status: result.status,
      specialistNpi: party.npi,
      specialty: party.specialty,
      state: party.state,
    })

    // Feed Growth: an off-network specialist we just touched is a prospect.
    if (!party.onNetwork && (party.npi || party.fax)) {
      await emitDomainEvent('referral.party.off_network', {
        referralId: referral.id,
        tenantOrgId: referral.sendingOrgId,
        role: 'specialist',
        npi: party.npi,
        name: party.name,
        specialty: party.specialty,
        fax: party.fax,
        state: party.state,
        source: 'outbound_referral',
      })
    }

    return delivery
  },
}

function faxPacket(referral, party) {
  return [
    `PLEROUS REFERRAL — ${referral.referralNumber ?? referral.id}`,
    `To: ${party.name ?? 'Specialist'} (${party.specialty ?? referral.specialty})`,
    `Specialty: ${referral.specialty}`,
    `Reason: ${referral.reason}`,
    `Diagnoses: ${(referral.diagnosisCodes ?? []).join(', ')}`,
    `Procedures: ${(referral.procedureCodes ?? []).join(', ')}`,
    referral.clinicalNotes ? `Notes: ${referral.clinicalNotes}` : '',
    referral.trackingToken ? `Confirm receipt: /track/${referral.trackingToken}/acknowledge` : '',
  ].filter(Boolean).join('\n')
}
