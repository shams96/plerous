import { prisma } from '../../db/client.js'
import { AppError } from '../../middleware/error-handler.js'
import { AIService } from '../ai/ai.service.js'
import { PriorAuthService } from '../auth/auth.service.js'
import { NotifyService } from '../notifications/notify.service.js'
import { prisma as db } from '../../db/client.js'
import { paia } from '../../agents/paia.agent.js'

const ai = new AIService()
const authSvc = new PriorAuthService()
const notify = new NotifyService()

const INCLUDES = {
  patient: true,
  referringProvider: { include: { organization: true } },
  receivingProvider: { include: { organization: true } },
  receivingOrg: true,
  insurancePlan: { include: { payer: true } },
  authorization: true,
  notifications: { orderBy: { createdAt: 'desc' }, take: 3 },
  paiaAnalyses: { orderBy: { createdAt: 'desc' }, take: 5 },
}

export class ReferralService {
  async create(data, user) {
    const patient = await prisma.patient.findUnique({
      where: { id: data.patientId },
      include: { primaryInsurance: { include: { payer: true } } },
    })
    if (!patient) throw new AppError(404, 'Patient not found')

    const plan = patient.primaryInsurance
    const requiresAuth = plan?.requiresPriorAuth ?? false

    // AI risk scoring (non-blocking — runs in parallel with DB write)
    const [aiScores] = await Promise.all([
      ai.scoreReferral({
        specialty: data.specialty,
        diagnosisCodes: data.diagnosisCodes || [],
        insurancePlanType: plan?.planType,
        patientAge: calcAge(patient.dateOfBirth),
        urgency: data.urgency || 'ROUTINE',
      }),
    ])

    const referral = await prisma.referral.create({
      data: {
        sendingOrgId: user.organizationId,
        referringProviderId: user.providerId,
        patientId: data.patientId,
        receivingOrgId: data.receivingOrgId ?? null,
        insurancePlanId: patient.primaryInsuranceId,
        specialty: data.specialty,
        subSpecialty: data.subSpecialty,
        diagnosisCodes: data.diagnosisCodes || [],
        procedureCodes: data.procedureCodes || [],
        clinicalNotes: data.clinicalNotes,
        urgency: data.urgency || 'ROUTINE',
        reason: data.reason,
        requestedDate: data.requestedDate ? new Date(data.requestedDate) : null,
        requiresAuth,
        riskScore: aiScores.riskScore,
        approvalProbability: aiScores.approvalProbability,
        leakageRisk: aiScores.leakageRisk,
        estimatedRevenue: data.estimatedRevenue,
        source: data.source || 'portal',
        externalId: data.externalId,
        ehrSystemId: data.ehrSystemId,
        statusHistory: [{
          status: 'DRAFT',
          timestamp: new Date().toISOString(),
          userId: user.id,
          note: 'Referral created',
        }],
      },
      include: INCLUDES,
    })

    await audit(user.id, 'CREATE_REFERRAL', referral.id, { specialty: data.specialty })

    // STAT/EMERGENCY → auto-submit immediately
    if (['STAT', 'EMERGENCY'].includes(data.urgency)) {
      return this.submit(referral.id, user)
    }

    return referral
  }

  async submit(id, user) {
    const referral = await this._get(id, user)

    const allowedStatuses = ['DRAFT', 'AUTH_DENIED']
    if (user.paiaOverride) allowedStatuses.push('PAIA_REVIEW')

    if (!allowedStatuses.includes(referral.status)) {
      throw new AppError(400, `Cannot submit a referral with status '${referral.status}'`)
    }

    // ── PAIA pre-flight ────────────────────────────────────────────────────
    // Skip PAIA re-run when human already resolved the human window
    if (user.paiaOverride && referral.status === 'PAIA_REVIEW') {
      // Persist resolution on the most recent PAIAAnalysis
      const latestAnalysis = await prisma.pAIAAnalysis.findFirst({
        where: { referralId: id },
        orderBy: { createdAt: 'desc' },
      })
      if (latestAnalysis) {
        await prisma.pAIAAnalysis.update({
          where: { id: latestAnalysis.id },
          data: {
            resolution: user.paiaResolution,
            resolutionNote: user.paiaNote || null,
            resolvedAt: new Date(),
            resolvedBy: user.id,
          },
        })
      }
    }

    // Run before any status change. If PAIA flags issues, stop here and
    // return the human window brief instead of proceeding to submission.
    if (referral.requiresAuth && !user.paiaOverride) {
      const paiaResult = await paia.analyze(id)

      if (paiaResult.decision === 'human_window') {
        // Update referral status to reflect PAIA hold
        await updateStatus(id, 'PAIA_REVIEW', user,
          `PAIA flagged ${paiaResult.humanWindowItems.length} issue(s) requiring review before submission. Denial risk: ${paiaResult.denialProbability}%`)

        return {
          referral: await this._get(id, user),
          paiaResult,
          blocked: true,
          message: `Submission paused — ${paiaResult.humanWindowItems.length} issue(s) need your review to prevent denial`,
        }
      }

      // PAIA cleared — log what was auto-fixed
      if (paiaResult.autoFixed?.length > 0) {
        await updateStatus(id, referral.status, user,
          `PAIA auto-fixed ${paiaResult.autoFixed.length} documentation issue(s): ${paiaResult.autoFixed.map(f => f.formatted || f.description).join(', ')}`)
      }
    }
    // ── End PAIA ───────────────────────────────────────────────────────────

    // Generate FedEx-style tracking token on first submission
    const trackingToken = referral.trackingToken ?? generateTrackingToken()
    await prisma.referral.update({
      where: { id },
      data: { trackingToken },
    })

    await updateStatus(id, 'SUBMITTED', user, 'Referral submitted to specialist')

    if (referral.requiresAuth) {
      await updateStatus(id, 'AUTH_PENDING', user, 'Prior authorization initiated')
      await authSvc.submit({
        referralId: referral.id,
        payerId: referral.insurancePlan?.payer?.id,
        diagnosisCodes: referral.diagnosisCodes,
        procedureCodes: referral.procedureCodes,
        urgency: referral.urgency,
        referringProviderNpi: referral.referringProvider.npi,
      })
    }

    // Patient SMS — include tracking link so they can always check status
    if (referral.patient.smsOptIn) {
      await notify.sms(
        referral.patient.phone,
        `Hi ${referral.patient.firstName}, your referral to a ${referral.specialty} specialist has been submitted. Track it anytime: ${process.env.DASHBOARD_URL ?? 'http://localhost:5001'}/track/${trackingToken} — Reply STOP to opt out.`,
        id, 'REFERRAL_CREATED',
      )
    }

    // Receiving provider email
    if (referral.receivingProvider?.email) {
      await notify.email(
        referral.receivingProvider.email,
        `New Referral — ${referral.patient.firstName} ${referral.patient.lastName}`,
        providerEmailHtml(referral),
        id, 'REFERRAL_CREATED',
      )
    }

    await audit(user.id, 'SUBMIT_REFERRAL', id)
    return prisma.referral.findUnique({ where: { id }, include: INCLUDES })
  }

  async schedule(id, { appointmentDate, notes }, user) {
    await this._get(id, user)

    const updated = await prisma.referral.update({
      where: { id },
      data: {
        appointmentDate: new Date(appointmentDate),
        appointmentConfirmed: true,
        status: 'SCHEDULED',
        statusHistory: { push: { status: 'SCHEDULED', timestamp: new Date().toISOString(), userId: user.id, note: notes || 'Appointment scheduled' } },
      },
      include: INCLUDES,
    })

    const apptStr = new Date(appointmentDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    const timeStr = new Date(appointmentDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

    await notify.sms(
      updated.patient.phone,
      `✅ Confirmed! ${updated.patient.firstName}, your ${updated.specialty} appointment is ${apptStr} at ${timeStr}. Auth #: ${updated.authorization?.authNumber || 'Pending'}.`,
      id, 'APPOINTMENT_CONFIRMED',
    )

    await notify.scheduleReminder(updated, new Date(appointmentDate))
    await audit(user.id, 'SCHEDULE_REFERRAL', id, { appointmentDate })
    return updated
  }

  async getStatus(id, user) {
    const referral = await this._get(id, user)
    let liveAuth = null
    if (referral.authorizationId) {
      liveAuth = await authSvc.getStatus(referral.authorizationId)
    }
    return {
      referralId: referral.id,
      referralNumber: referral.referralNumber,
      status: referral.status,
      urgency: referral.urgency,
      specialty: referral.specialty,
      patient: `${referral.patient.firstName} ${referral.patient.lastName}`,
      appointmentDate: referral.appointmentDate,
      appointmentConfirmed: referral.appointmentConfirmed,
      authorization: liveAuth ?? {
        status: referral.authorization?.status,
        authNumber: referral.authorization?.authNumber,
        expiresAt: referral.authorization?.expiresAt,
      },
      riskScore: referral.riskScore,
      leakageRisk: referral.leakageRisk,
      timeline: referral.statusHistory,
      nextAction: nextAction(referral.status),
    }
  }

  async list(query, user) {
    const { page = 1, limit = 20, status, specialty, urgency, search } = query
    const skip = (page - 1) * limit

    const where = {
      OR: [{ sendingOrgId: user.organizationId }, { receivingOrgId: user.organizationId }],
      ...(status && { status }),
      ...(specialty && { specialty: { contains: specialty, mode: 'insensitive' } }),
      ...(urgency && { urgency }),
      ...(search && {
        OR: [
          { referralNumber: { contains: search, mode: 'insensitive' } },
          { patient: { firstName: { contains: search, mode: 'insensitive' } } },
          { patient: { lastName: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    }

    const [data, total] = await Promise.all([
      prisma.referral.findMany({ where, skip, take: parseInt(limit), orderBy: { createdAt: 'desc' }, include: INCLUDES }),
      prisma.referral.count({ where }),
    ])

    return { data, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) } }
  }

  /**
   * Public tracking — no auth required. Returns only what a patient needs to see.
   * The "FedEx tracking page" — anyone with the token can check status.
   */
  async getByTrackingToken(token) {
    const referral = await prisma.referral.findUnique({
      where: { trackingToken: token },
      include: {
        patient:           { select: { firstName: true } },
        referringProvider: { select: { firstName: true, lastName: true } },
        receivingProvider: { select: { firstName: true, lastName: true } },
        receivingOrg:      { select: { name: true, phone: true } },
        sendingOrg:        { select: { name: true, phone: true } },
        authorization:     { select: { status: true, authNumber: true, expiresAt: true } },
      },
    })
    if (!referral) return null

    // Build FedEx-style timeline from statusHistory
    const timeline = (referral.statusHistory ?? []).map(h => ({
      status:    h.status,
      label:     TRACKING_LABELS[h.status] ?? h.status,
      timestamp: h.timestamp,
      note:      h.note,
      icon:      TRACKING_ICONS[h.status] ?? '●',
    }))

    return {
      trackingToken:  token,
      referralNumber: referral.referralNumber,
      specialty:      referral.specialty,
      urgency:        referral.urgency,
      status:         referral.status,
      statusLabel:    TRACKING_LABELS[referral.status] ?? referral.status,
      // Patient-safe info — no diagnosis codes, no clinical notes
      patientFirstName:   referral.patient?.firstName,
      referringPractice:  referral.sendingOrg?.name,
      referringPhone:     referral.sendingOrg?.phone,
      specialist:         referral.receivingProvider
        ? `Dr. ${referral.receivingProvider.firstName} ${referral.receivingProvider.lastName}`
        : referral.receivingOrg?.name ?? 'Specialist (being assigned)',
      specialistPhone:    referral.receivingOrg?.phone,
      appointmentDate:    referral.appointmentDate,
      authNumber:         referral.authorization?.authNumber,
      authExpires:        referral.authorization?.expiresAt,
      timeline,
      lastUpdated:        referral.updatedAt,
      // Next action for patient
      nextAction:         PATIENT_NEXT_ACTIONS[referral.status] ?? 'Contact your doctor\'s office for updates.',
    }
  }

  /**
   * Specialist acknowledges receipt — the "FedEx delivered" scan.
   * Transitions SUBMITTED → RECEIVED, notifies patient immediately.
   */
  async acknowledge(id, user) {
    const referral = await this._get(id, user)
    if (referral.status !== 'SUBMITTED') {
      throw new AppError(400, `Cannot acknowledge referral with status '${referral.status}' — only SUBMITTED referrals need acknowledgement`)
    }

    await updateStatus(id, 'RECEIVED', user, `Referral received by ${referral.receivingOrg?.name ?? 'specialist office'}`)

    // Patient notification — the most satisfying moment in the FedEx analogy
    if (referral.patient?.smsOptIn && referral.patient?.phone) {
      const specialistName = referral.receivingProvider
        ? `Dr. ${referral.receivingProvider.firstName} ${referral.receivingProvider.lastName}`
        : referral.receivingOrg?.name ?? 'the specialist'
      await notify.sms(
        referral.patient.phone,
        `✅ ${referral.patient.firstName}, your ${referral.specialty} referral has been RECEIVED by ${specialistName}. They will contact you to schedule your appointment. Track: ${process.env.DASHBOARD_URL ?? 'http://localhost:5001'}/track/${referral.trackingToken}`,
        id, 'REFERRAL_CREATED',
      )
    }

    await audit(user.id, 'ACKNOWLEDGE_REFERRAL', id)
    return prisma.referral.findUnique({ where: { id }, include: INCLUDES })
  }

  /**
   * Specialist confirms receipt via the public secure tracking link — no login.
   * This is what makes "confirmed receipt" real for the non-payer channel:
   * the office that received a faxed/secure-link referral clicks "Confirm
   * receipt", which records acknowledgedAt and flips SUBMITTED → RECEIVED.
   */
  async acknowledgeByToken(token) {
    const referral = await prisma.referral.findUnique({
      where: { trackingToken: token },
      include: { patient: true, receivingOrg: true, receivingProvider: true },
    })
    if (!referral) throw new AppError(404, 'Referral not found')

    // Idempotent: if already acknowledged or further along, just report current state.
    if (referral.status !== 'SUBMITTED') {
      return { alreadyAcknowledged: true, status: referral.status, acknowledgedAt: referral.acknowledgedAt }
    }

    const now = new Date()
    await prisma.referral.update({
      where: { id: referral.id },
      data: {
        status: 'RECEIVED',
        deliveredAt: referral.deliveredAt ?? now,
        acknowledgedAt: now,
        statusHistory: { push: { status: 'RECEIVED', timestamp: now.toISOString(), userId: 'specialist-link', note: 'Receipt confirmed via secure link' } },
      },
    })

    if (referral.patient?.smsOptIn && referral.patient?.phone) {
      const specialistName = referral.receivingProvider
        ? `Dr. ${referral.receivingProvider.firstName} ${referral.receivingProvider.lastName}`
        : referral.receivingOrg?.name ?? 'the specialist'
      await notify.sms(
        referral.patient.phone,
        `✅ ${referral.patient.firstName}, your ${referral.specialty} referral has been RECEIVED by ${specialistName}. They will contact you to schedule. Track: ${process.env.DASHBOARD_URL ?? 'http://localhost:3000'}/track/${token}`,
        referral.id, 'REFERRAL_CREATED',
      ).catch(() => {})
    }

    return { acknowledged: true, status: 'RECEIVED', acknowledgedAt: now }
  }

  async cancel(id, reason, user) {
    const referral = await this._get(id, user)
    if (['COMPLETED', 'CANCELLED'].includes(referral.status)) {
      throw new AppError(400, 'Cannot cancel a completed or already-cancelled referral')
    }
    await updateStatus(id, 'CANCELLED', user, reason || 'Cancelled by provider')
    await notify.sms(
      referral.patient.phone,
      `Your referral to a ${referral.specialty} specialist has been cancelled. Please contact your doctor's office for more information.`,
      id, 'REFERRAL_CANCELLED',
    )
    await audit(user.id, 'CANCEL_REFERRAL', id, { reason })
  }

  async _get(id, user) {
    const referral = await prisma.referral.findUnique({ where: { id }, include: INCLUDES })
    if (!referral) throw new AppError(404, 'Referral not found')
    if (referral.sendingOrgId !== user.organizationId && referral.receivingOrgId !== user.organizationId) {
      throw new AppError(403, 'Access denied to this referral')
    }
    return referral
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Generates a FedEx-style public tracking token — human-readable, URL-safe.
 * Format: RC-XXXXXX (6 alphanumeric chars, ~2.2B combinations)
 */
function generateTrackingToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I ambiguity
  let token = 'RC-'
  for (let i = 0; i < 6; i++) token += chars[Math.floor(Math.random() * chars.length)]
  return token
}

function calcAge(dob) {
  return Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000))
}

async function updateStatus(id, status, user, note) {
  return prisma.referral.update({
    where: { id },
    data: {
      status,
      statusHistory: { push: { status, timestamp: new Date().toISOString(), userId: user.id, note } },
    },
  })
}

async function audit(userId, action, resourceId, metadata = {}) {
  await prisma.auditLog.create({
    data: { userId, action, resource: 'Referral', resourceId, metadata },
  })
}

// Patient-facing status labels (FedEx-style plain English)
const TRACKING_LABELS = {
  DRAFT:         'Being prepared',
  PAIA_REVIEW:   'Under review by your doctor',
  SUBMITTED:     'Sent to specialist',
  RECEIVED:      'Received by specialist ✅',
  AUTH_PENDING:  'Waiting on insurance approval',
  AUTH_APPROVED: 'Insurance approved',
  AUTH_DENIED:   'Insurance denied — appeal in progress',
  SCHEDULED:     'Appointment scheduled',
  COMPLETED:     'Visit completed',
  CANCELLED:     'Cancelled',
  EXPIRED:       'Expired — please contact your doctor',
  NO_SHOW:       'Missed appointment',
}

const TRACKING_ICONS = {
  DRAFT:         '📋',
  PAIA_REVIEW:   '🔍',
  SUBMITTED:     '📤',
  RECEIVED:      '✅',
  AUTH_PENDING:  '⏳',
  AUTH_APPROVED: '✅',
  AUTH_DENIED:   '⚠️',
  SCHEDULED:     '📅',
  COMPLETED:     '🎉',
  CANCELLED:     '❌',
  EXPIRED:       '⚠️',
  NO_SHOW:       '📋',
}

const PATIENT_NEXT_ACTIONS = {
  SUBMITTED:     'Your referral has been sent. The specialist office will contact you within 2-3 business days to schedule.',
  RECEIVED:      'The specialist has received your referral. Expect a call to schedule your appointment soon.',
  AUTH_PENDING:  'Your insurance is reviewing the request. This typically takes 3-7 business days. We will notify you when there is a decision.',
  AUTH_APPROVED: 'Your insurance approved the referral! Call the specialist to schedule your appointment before the authorization expires.',
  AUTH_DENIED:   'Your insurance denied this request. Your doctor is reviewing options and may file an appeal. Contact their office for next steps.',
  SCHEDULED:     'Your appointment is scheduled. You will receive a reminder 48 hours before.',
  COMPLETED:     'Your visit is complete. Follow up with your referring doctor if needed.',
}

const NEXT_ACTIONS = {
  DRAFT:         'Submit referral to activate authorization check',
  SUBMITTED:     'Awaiting prior authorization from payer',
  AUTH_PENDING:  'Authorization under review — typically 72h urgent, 7 days standard',
  AUTH_APPROVED: 'Schedule appointment with specialist',
  AUTH_DENIED:   'Review denial reason and submit appeal via /v1/ai/generate-appeal',
  SCHEDULED:     'Patient appointment confirmed — 48h reminder will be sent automatically',
  COMPLETED:     'Referral complete — request clinical notes from specialist',
  EXPIRED:       'Re-submit referral — previous authorization expired',
  CANCELLED:     null,
  NO_SHOW:       'Contact patient to reschedule',
}

function nextAction(status) { return NEXT_ACTIONS[status] ?? null }

function providerEmailHtml(referral) {
  return `
    <h2>New Patient Referral — Plerous</h2>
    <table style="border-collapse:collapse;width:100%">
      <tr><td><strong>Patient</strong></td><td>${referral.patient.firstName} ${referral.patient.lastName}</td></tr>
      <tr><td><strong>DOB</strong></td><td>${new Date(referral.patient.dateOfBirth).toLocaleDateString()}</td></tr>
      <tr><td><strong>Specialty</strong></td><td>${referral.specialty}</td></tr>
      <tr><td><strong>Urgency</strong></td><td>${referral.urgency}</td></tr>
      <tr><td><strong>Referring Provider</strong></td><td>Dr. ${referral.referringProvider.lastName} — ${referral.referringProvider.organization.name}</td></tr>
      <tr><td><strong>Diagnosis</strong></td><td>${referral.diagnosisCodes.join(', ')}</td></tr>
      <tr><td><strong>Auth Status</strong></td><td>${referral.authorization?.status ?? 'Pending'}</td></tr>
    </table>
    <br/>
    <p style="font-size:12px;color:#666">Clinical Notes: ${referral.clinicalNotes || 'See attached documentation'}</p>
    <a href="${process.env.API_BASE_URL}/dashboard/referrals/${referral.id}"
       style="background:#5C2D8E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:16px">
      View in Plerous
    </a>
  `
}
