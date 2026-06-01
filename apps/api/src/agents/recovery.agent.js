/**
 * Referral Recovery Agent — Agent 5
 *
 * Upgrades Sentinel from "alert and wait" to "act and report."
 * Takes autonomous action on stalled referrals, then tells humans what it did.
 *
 * Actions by stall type:
 *   SPECIALIST_NO_ACK  → re-sends referral packet + offers alternate routing
 *   POST_ACK_NO_SCHED  → sends patient scheduling SMS if opt-in, else flags
 *   AUTH_STUCK         → drafts P2P review request to provider
 *   STALE_DRAFT        → surfaces incomplete fields to coordinator
 */

import { prisma }        from '../db/client.js'
import { redis }         from '../db/client.js'
import { NotifyService } from '../modules/notifications/notify.service.js'
import Anthropic         from '@anthropic-ai/sdk'
import { config }        from '../config/index.js'

const anthropic = config.anthropic?.apiKey
  ? new Anthropic({ apiKey: config.anthropic.apiKey })
  : null

const COOLDOWN_HOURS    = 6
const NO_ACK_HOURS      = 72
const NO_SCHED_DAYS     = 3
const AUTH_STUCK_DAYS   = 3
const STALE_DRAFT_HOURS = 48

const DASHBOARD_URL = process.env.DASHBOARD_URL ?? 'http://localhost:5001'

function dedupeKey(referralId, actionType) {
  return `recovery:action:${actionType}:${referralId}`
}

async function shouldAct(referralId, actionType) {
  const key    = dedupeKey(referralId, actionType)
  const exists = await redis.get(key)
  if (exists) return false
  await redis.setex(key, COOLDOWN_HOURS * 3600, '1')
  return true
}

export class RecoveryAgent {
  async run() {
    const now     = new Date()
    const notify  = new NotifyService()
    const actions = []

    // ── 1. SPECIALIST_NO_ACK — re-send referral packet ────────────────────────
    const noAckReferrals = await prisma.referral.findMany({
      where: {
        status:    'SUBMITTED',
        updatedAt: { lt: new Date(now - NO_ACK_HOURS * 3600000) },
      },
      include: {
        patient:           true,
        referringProvider: { include: { organization: true } },
        receivingOrg:      true,
        receivingProvider: true,
      },
    })

    for (const r of noAckReferrals) {
      if (!await shouldAct(r.id, 'NO_ACK_RESEND')) continue

      const specialistEmail = r.receivingProvider?.email ?? r.receivingOrg?.email
      const specialistName  = r.receivingProvider
        ? `Dr. ${r.receivingProvider.lastName}`
        : r.receivingOrg?.name ?? 'Specialist'
      const hoursElapsed = Math.round((now - new Date(r.updatedAt)) / 3600000)

      if (specialistEmail) {
        try {
          await notify.email(
            specialistEmail,
            `[Action Required] Referral for ${r.patient?.firstName ?? 'Patient'} — ${r.specialty}`,
            `<p>Hi ${specialistName},</p>
            <p>A referral for <strong>${r.patient?.firstName ?? 'a patient'}</strong> (${r.specialty}) was sent ${hoursElapsed}h ago and has not yet been acknowledged.</p>
            <p><strong>Referral #:</strong> ${r.referralNumber}<br>
            <strong>Reason:</strong> ${r.reason}</p>
            <p>Please acknowledge receipt at your earliest convenience. If this patient is not appropriate for your practice, please decline so the referring provider can redirect.</p>
            <p><small>Plerous Care Completion Platform</small></p>`,
            r.id,
            'SPECIALIST_NO_ACK'
          )
        } catch { /* non-blocking */ }
      }

      // Append to statusHistory
      await prisma.referral.update({
        where: { id: r.id },
        data:  {
          statusHistory: {
            push: {
              status:    r.status,
              timestamp: now.toISOString(),
              userId:    'system:recovery-agent',
              note:      `Auto-recovery: referral re-sent to ${specialistName} after ${hoursElapsed}h without acknowledgement`,
            },
          },
        },
      })

      actions.push({
        referralId:   r.id,
        type:         'NO_ACK_RESEND',
        actionTaken:  `Re-sent referral packet to ${specialistName} (${hoursElapsed}h elapsed)`,
        specialist:   specialistName,
        patientName:  `${r.patient?.firstName} ${r.patient?.lastName}`,
      })
    }

    // ── 2. POST_ACK_NO_SCHEDULE — nudge patient to book ──────────────────────
    const noSchedReferrals = await prisma.referral.findMany({
      where: {
        status:          { in: ['RECEIVED', 'AUTH_APPROVED'] },
        appointmentDate: null,
        updatedAt:       { lt: new Date(now - NO_SCHED_DAYS * 86400000) },
      },
      include: {
        patient:          true,
        receivingProvider: true,
        receivingOrg:      true,
      },
    })

    for (const r of noSchedReferrals) {
      if (!await shouldAct(r.id, 'NO_SCHED_NUDGE')) continue

      const patient         = r.patient
      const specialistName  = r.receivingProvider
        ? `Dr. ${r.receivingProvider.lastName}`
        : r.receivingOrg?.name ?? 'the specialist'
      const specialistPhone = r.receivingProvider?.phone ?? r.receivingOrg?.phone ?? null
      const daysSince       = Math.round((now - new Date(r.updatedAt)) / 86400000)

      if (patient?.smsOptIn && patient?.phone) {
        const msg = specialistPhone
          ? `Hi ${patient.firstName}, your ${r.specialty} referral has been approved. Please call ${specialistName} at ${specialistPhone} to schedule your appointment.`
          : `Hi ${patient.firstName}, your ${r.specialty} referral has been approved. Please contact the specialist's office to schedule your appointment.`

        try {
          await notify.sms(patient.phone, msg, r.id, 'REFERRAL_STALLED')
        } catch { /* non-blocking */ }

        actions.push({
          referralId:  r.id,
          type:        'NO_SCHED_NUDGE',
          actionTaken: `Sent scheduling SMS to ${patient.firstName} (${daysSince} days since ${r.status})`,
          patientName: `${patient.firstName} ${patient.lastName}`,
        })
      } else {
        // No SMS — create internal alert for coordinator
        await prisma.notification.create({
          data: {
            referralId: r.id,
            type:       'REFERRAL_STALLED',
            channel:    'INTERNAL',
            recipient:  'coordinator',
            message:    `${patient?.firstName ?? 'Patient'} has not scheduled after ${daysSince} days (${r.status}) — no SMS opt-in`,
            status:     'dev_logged',
          },
        })
        actions.push({
          referralId:  r.id,
          type:        'NO_SCHED_FLAG',
          actionTaken: `Flagged for coordinator — patient no SMS opt-in (${daysSince} days since ${r.status})`,
        })
      }
    }

    // ── 3. AUTH_STUCK — generate P2P review draft ────────────────────────────
    const stuckAuths = await prisma.referral.findMany({
      where: {
        status:    'AUTH_PENDING',
        updatedAt: { lt: new Date(now - AUTH_STUCK_DAYS * 86400000) },
      },
      include: {
        patient:           true,
        referringProvider: { include: { organization: true } },
        insurancePlan:     { include: { payer: true } },
      },
    })

    for (const r of stuckAuths) {
      if (!await shouldAct(r.id, 'AUTH_STUCK_P2P')) continue

      const daysSince = Math.round((now - new Date(r.updatedAt)) / 86400000)
      const payer     = r.insurancePlan?.payer?.name ?? 'the payer'
      const provEmail = r.referringProvider?.email

      let p2pDraft = `Request for Peer-to-Peer Review\n\nPatient: ${r.patient?.firstName} ${r.patient?.lastName}\nSpecialty: ${r.specialty}\nPrior Auth pending: ${daysSince} days\nPayer: ${payer}\n\nPlease connect me with a medical reviewer to discuss medical necessity for this referral.`

      if (anthropic) {
        try {
          const resp = await anthropic.messages.create({
            model:      'claude-haiku-4-5',
            max_tokens: 250,
            messages: [{
              role:    'user',
              content: `Write a professional peer-to-peer review request for a prior authorization that has been pending ${daysSince} days.
Patient specialty: ${r.specialty}
Diagnosis codes: ${(r.diagnosisCodes || []).join(', ')}
Payer: ${payer}
Keep it under 100 words. Professional tone.`,
            }],
          })
          p2pDraft = resp.content[0]?.text ?? p2pDraft
        } catch { /* non-blocking */ }
      }

      if (provEmail) {
        try {
          await notify.email(
            provEmail,
            `[Action Needed] Prior Auth Stuck ${daysSince} Days — ${r.specialty} for ${r.patient?.firstName}`,
            `<p>The prior authorization for <strong>${r.patient?.firstName ?? 'your patient'}</strong> (${r.specialty}) has been pending for <strong>${daysSince} days</strong>.</p>
            <p>Consider requesting a peer-to-peer review. Here is a draft:</p>
            <blockquote style="border-left:3px solid #ddd;padding-left:12px;color:#555">${p2pDraft.replace(/\n/g, '<br>')}</blockquote>
            <p><small>Plerous — automated recovery notification</small></p>`,
            r.id,
            'AUTH_STUCK'
          )
        } catch { /* non-blocking */ }
      }

      actions.push({
        referralId:  r.id,
        type:        'AUTH_STUCK_P2P',
        actionTaken: `Sent P2P review draft to referring provider (${daysSince} days stuck)`,
        patientName: `${r.patient?.firstName} ${r.patient?.lastName}`,
        p2pDraft,
      })
    }

    // ── 4. STALE_DRAFT — surface incomplete fields ────────────────────────────
    const staleDrafts = await prisma.referral.findMany({
      where: {
        status:    'DRAFT',
        updatedAt: { lt: new Date(now - STALE_DRAFT_HOURS * 3600000) },
      },
      include: {
        patient:           true,
        referringProvider: { include: { organization: true } },
      },
    })

    for (const r of staleDrafts) {
      if (!await shouldAct(r.id, 'STALE_DRAFT_NUDGE')) continue

      const hoursOld = Math.round((now - new Date(r.updatedAt)) / 3600000)
      const missing  = []
      if (!r.receivingOrgId)            missing.push('specialist not selected')
      if (!r.diagnosisCodes?.length)    missing.push('no diagnosis codes')
      if (!r.procedureCodes?.length)    missing.push('no procedure codes')
      if (!r.clinicalNotes)             missing.push('no clinical notes')

      const provEmail = r.referringProvider?.email
      if (provEmail) {
        try {
          await notify.email(
            provEmail,
            `[Reminder] Draft Referral for ${r.patient?.firstName ?? 'Patient'} — ${r.specialty} (${hoursOld}h old)`,
            `<p>A draft ${r.specialty} referral for <strong>${r.patient?.firstName ?? 'your patient'}</strong> has been sitting for <strong>${hoursOld} hours</strong>.</p>
            ${missing.length ? `<p>Still needed before submission: <ul>${missing.map(m => `<li>${m}</li>`).join('')}</ul></p>` : ''}
            <p>Please submit or cancel to keep your referral queue clean.</p>`,
            r.id,
            'STALE_DRAFT'
          )
        } catch { /* non-blocking */ }
      }

      actions.push({
        referralId:  r.id,
        type:        'STALE_DRAFT_NUDGE',
        actionTaken: `Reminded referring provider — draft is ${hoursOld}h old${missing.length ? `, missing: ${missing.join(', ')}` : ''}`,
        missingFields: missing,
      })
    }

    return {
      runAt:        now.toISOString(),
      actionsCount: actions.length,
      actions,
      breakdown: {
        noAckResends:   actions.filter(a => a.type === 'NO_ACK_RESEND').length,
        schedNudges:    actions.filter(a => a.type === 'NO_SCHED_NUDGE').length,
        schedFlags:     actions.filter(a => a.type === 'NO_SCHED_FLAG').length,
        p2pDrafts:      actions.filter(a => a.type === 'AUTH_STUCK_P2P').length,
        draftNudges:    actions.filter(a => a.type === 'STALE_DRAFT_NUDGE').length,
      },
    }
  }
}
