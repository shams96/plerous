/**
 * IntakeGateway — the boundary for referrals arriving FROM the outside world
 * (Quadrant C: referrer off-network, specialist on-network). Normalizes an
 * inbound transmission into a Plerous referral on the receiving specialist's
 * queue, and emits party.off_network so the outside PCP becomes a prospect.
 *
 * Adapters by channel; fax_inbound first. Direct/FHIR-Task intake slot in here
 * later behind the same gateway — the core never changes.
 */
import { prisma } from '../db/client.js'
import { emitDomainEvent } from '../events/bus.js'

export const intakeGateway = {
  /**
   * Ingest an inbound fax referral.
   * @param {object} p
   *   toFax        the receiving (on-network) office fax — used to resolve the org
   *   fromFax/fromName/fromNpi   the external referring PCP
   *   patientFirstName/patientLastName/patientDob/patientPhone
   *   specialty, reason, diagnosisCodes[], procedureCodes[], clinicalNotes
   * @returns {Promise<{accepted:boolean, reason?:string, referralId?:string}>}
   */
  async ingestFax(p) {
    // 1. Resolve the receiving on-network org by its fax number. We only intake
    //    for our customers; an unknown destination is rejected.
    const org = p.toFax
      ? await prisma.organization.findFirst({ where: { faxNumber: p.toFax } })
      : null
    if (!org) return { accepted: false, reason: 'no_matching_org' }

    // 2. Minimal patient record (inbound patients aren't pre-registered).
    const patient = await prisma.patient.create({
      data: {
        firstName: p.patientFirstName || 'Unknown',
        lastName: p.patientLastName || 'Patient',
        dateOfBirth: p.patientDob ? new Date(p.patientDob) : new Date('1900-01-01'),
        gender: p.patientGender || 'unknown',
        phone: p.patientPhone || '',
        address: p.patientAddress || {},
        smsOptIn: false,
      },
    })

    // 3. Create the referral on the specialist's queue (already RECEIVED — it
    //    physically arrived; no on-network sender).
    const now = new Date()
    const referral = await prisma.referral.create({
      data: {
        receivingOrgId: org.id,
        patientId: patient.id,
        specialty: p.specialty || org.name,
        reason: p.reason || 'Inbound fax referral',
        diagnosisCodes: p.diagnosisCodes || [],
        procedureCodes: p.procedureCodes || [],
        clinicalNotes: p.clinicalNotes || null,
        source: 'fax',
        status: 'RECEIVED',
        deliveredAt: now,
        acknowledgedAt: now,
        sourceNpi: p.fromNpi || null,
        sourceName: p.fromName || null,
        sourceFax: p.fromFax || null,
        statusHistory: [{ status: 'RECEIVED', timestamp: now.toISOString(), userId: 'intake', note: 'Inbound fax ingested' }],
      },
    })

    // 4. Growth: the outside PCP who sent this is a qualified prospect.
    if (p.fromNpi || p.fromFax) {
      await emitDomainEvent('referral.party.off_network', {
        referralId: referral.id,
        tenantOrgId: org.id,
        role: 'referrer',
        npi: p.fromNpi || null,
        name: p.fromName || null,
        fax: p.fromFax || null,
        source: 'inbound_fax',
      })
    }

    return { accepted: true, referralId: referral.id, receivingOrg: org.name }
  },
}
