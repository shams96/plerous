/**
 * Scheduling Completion Agent — Agent 6
 *
 * Closes the loop between specialist acknowledgement and booked appointment.
 * Monitors RECEIVED/AUTH_APPROVED referrals with no appointmentDate and
 * escalates in tiers based on how long the gap has been open.
 *
 * Tier thresholds (configurable per urgency):
 *   ROUTINE:   Day 3 → patient SMS | Day 5 → coordinator flag | Day 7 → specialist email
 *   URGENT:    Day 1 → patient SMS | Day 2 → coordinator flag | Day 3 → specialist email
 *   STAT:      Day 0 → immediate coordinator flag
 */

import { prisma }        from '../db/client.js'
import { redis }         from '../db/client.js'
import { NotifyService } from '../modules/notifications/notify.service.js'

const notify = new NotifyService()

const TIERS = {
  ROUTINE:   { patientSmsDay: 3, coordinatorDay: 5, specialistDay: 7 },
  URGENT:    { patientSmsDay: 1, coordinatorDay: 2, specialistDay: 3 },
  STAT:      { patientSmsDay: 0, coordinatorDay: 0, specialistDay: 1 },
  EMERGENCY: { patientSmsDay: 0, coordinatorDay: 0, specialistDay: 0 },
}

async function dedupe(referralId, tier) {
  const key = `sched:nudge:${tier}:${referralId}`
  const ex  = await redis.get(key)
  if (ex) return false
  await redis.setex(key, 12 * 3600, '1')  // 12h cooldown per tier
  return true
}

export class SchedulingAgent {
  async run() {
    const now     = new Date()
    const actions = []

    const referrals = await prisma.referral.findMany({
      where: {
        status:          { in: ['RECEIVED', 'AUTH_APPROVED'] },
        appointmentDate: null,
      },
      include: {
        patient:          true,
        receivingProvider: { include: { organization: true } },
        receivingOrg:      true,
      },
    })

    for (const r of referrals) {
      const daysSince   = (now - new Date(r.updatedAt)) / 86400000
      const urgency     = r.urgency ?? 'ROUTINE'
      const thresholds  = TIERS[urgency] ?? TIERS.ROUTINE
      const patient     = r.patient
      const specialist  = r.receivingProvider
        ? `Dr. ${r.receivingProvider.lastName}`
        : r.receivingOrg?.name ?? 'specialist'
      const specPhone   = r.receivingProvider?.phone ?? r.receivingOrg?.phone ?? null
      const specEmail   = r.receivingProvider?.email ?? r.receivingOrg?.email ?? null

      // Tier 1 — patient SMS nudge
      if (daysSince >= thresholds.patientSmsDay && patient?.smsOptIn && patient?.phone) {
        if (await dedupe(r.id, 'patient_sms')) {
          const msg = specPhone
            ? `Hi ${patient.firstName}, your ${r.specialty} referral is ready. Please call ${specialist} at ${specPhone} to schedule your appointment.`
            : `Hi ${patient.firstName}, your ${r.specialty} referral is ready. Please contact the specialist's office to schedule.`
          try {
            await notify.sms(patient.phone, msg, r.id, 'REFERRAL_STALLED')
            actions.push({ referralId: r.id, tier: 'patient_sms', daysSince: Math.round(daysSince), action: `SMS sent to ${patient.firstName}` })
          } catch { /* non-blocking */ }
        }
      }

      // Tier 2 — coordinator internal flag
      if (daysSince >= thresholds.coordinatorDay) {
        if (await dedupe(r.id, 'coordinator_flag')) {
          await prisma.notification.create({
            data: {
              referralId: r.id,
              type:       'REFERRAL_STALLED',
              channel:    'INTERNAL',
              recipient:  'coordinator',
              message:    `${patient?.firstName ?? 'Patient'} has not scheduled ${r.specialty} appointment after ${Math.round(daysSince)} days (urgency: ${urgency})`,
              status:     'pending',
            },
          })
          actions.push({ referralId: r.id, tier: 'coordinator_flag', daysSince: Math.round(daysSince), action: 'Flagged in coordinator queue' })
        }
      }

      // Tier 3 — specialist email nudge
      if (daysSince >= thresholds.specialistDay && specEmail) {
        if (await dedupe(r.id, 'specialist_email')) {
          try {
            await notify.email(
              specEmail,
              `[Follow-up] Patient ${patient?.firstName ?? ''} has not yet scheduled — ${r.specialty}`,
              `<p>Hi ${specialist},</p>
              <p>Patient <strong>${patient?.firstName ?? ''} ${patient?.lastName ?? ''}</strong> was referred to your practice for <strong>${r.specialty}</strong> but has not yet scheduled an appointment (${Math.round(daysSince)} days since acknowledgement).</p>
              <p>Urgency level: <strong>${urgency}</strong></p>
              <p>Please reach out to the patient to schedule${patient?.phone ? ` at ${patient.phone}` : ''}.</p>`,
              r.id,
              'REFERRAL_STALLED'
            )
            actions.push({ referralId: r.id, tier: 'specialist_email', daysSince: Math.round(daysSince), action: `Email sent to ${specialist}` })
          } catch { /* non-blocking */ }
        }
      }
    }

    return {
      runAt:        now.toISOString(),
      checked:      referrals.length,
      actionsCount: actions.length,
      actions,
    }
  }
}
