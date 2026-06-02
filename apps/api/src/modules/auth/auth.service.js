import { prisma } from '../../db/client.js'
import { redis } from '../../db/client.js'
import { payerGateway } from '../../payers/payer-gateway.js'
import { scheduleAuthPoll } from '../../workers/auth-poller.worker.js'
import { recordAuthOutcome } from '../../agents/paia/feedback/denial-feedback.js'

export class PriorAuthService {
  async submit({ referralId, payerId, diagnosisCodes, procedureCodes, urgency, referringProviderNpi }) {
    if (!payerId) {
      // No payer linked — mark not required
      await prisma.referral.update({ where: { id: referralId }, data: { requiresAuth: false } })
      return { status: 'NOT_REQUIRED' }
    }

    const payer = await prisma.payer.findUnique({ where: { id: payerId } })

    const auth = await prisma.priorAuthorization.create({
      data: {
        payerId,
        requestedCodes: procedureCodes || [],
        urgency: urgency?.toLowerCase() || 'standard',
        status: 'SUBMITTED',
        submittedAt: new Date(),
        referrals: { connect: { id: referralId } },
      },
    })

    await prisma.referral.update({ where: { id: referralId }, data: { authorizationId: auth.id } })

    // Cache initial status
    await redis.setex(`auth:${auth.id}:status`, 3600, JSON.stringify({ status: 'SUBMITTED', submittedAt: new Date() }))

    // ── Real outbound submission via the payer gateway ──────────────────────
    // Adapter chosen by payer.apiType (fhir_r4 | edi_x12 | availity). Makes a
    // genuine HTTP call to payer.fhirBaseUrl (simulator now, sandbox later).
    try {
      const result = await payerGateway.submitAuth({ auth: { ...auth, referrals: [{ id: referralId }] }, payer })

      // Persist claim id + any payer auth reference immediately so the poller
      // and inbound webhooks can correlate this auth even while it's pending.
      const correlate = {}
      if (result.fhirClaimId) correlate.fhirClaimId = result.fhirClaimId
      if (result.authNumber) correlate.authNumber = result.authNumber
      if (Object.keys(correlate).length) {
        await prisma.priorAuthorization.update({ where: { id: auth.id }, data: correlate }).catch(() => {})
      }

      if (result.pending) {
        // Async payer — poll until terminal (or a webhook arrives first).
        await scheduleAuthPoll(auth.id, payerId, urgency).catch((e) =>
          console.warn(`[Auth] Could not schedule poll for ${auth.id}: ${e.message}`),
        )
      } else if (['APPROVED', 'DENIED', 'PARTIALLY_APPROVED'].includes(result.status)) {
        // Synchronous decision — apply immediately.
        await this._applyDecision(auth.id, {
          status: result.status,
          authNumber: result.authNumber,
          expiresAt: result.expiresAt,
          denialReason: result.denialReason,
          denialCode: result.denialCode,
          rawResponse: result.rawResponse,
        })
      }
    } catch (err) {
      // Non-fatal — auth record exists; fall back to polling so a later webhook
      // or status poll can still resolve it.
      console.warn(`Payer submission warning for auth ${auth.id}:`, err.message)
      await scheduleAuthPoll(auth.id, payerId, urgency).catch(() => {})
    }

    return { authId: auth.id, status: 'SUBMITTED' }
  }

  async getStatus(authId) {
    const cached = await redis.get(`auth:${authId}:status`)
    if (cached) return JSON.parse(cached)

    const auth = await prisma.priorAuthorization.findUnique({ where: { id: authId } })
    return {
      status: auth?.status,
      authNumber: auth?.authNumber,
      expiresAt: auth?.expiresAt,
      denialReason: auth?.denialReason,
    }
  }

  async validateEligibility({ memberId, payerId, serviceDate }) {
    const cacheKey = `eligibility:${memberId}:${payerId}:${serviceDate}`
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached)

    const payer = await prisma.payer.findUnique({ where: { id: payerId } })
    // Real eligibility check via the payer gateway (CoverageEligibilityRequest).
    const result = await payerGateway.checkEligibility({ payer, memberId, serviceDate })

    await redis.setex(cacheKey, 14400, JSON.stringify(result))
    return result
  }

  async processWebhook(payerName, payload) {
    const authNumber = payload.authorizationNumber || payload.priorAuthNumber
    if (!authNumber) return { processed: false, reason: 'no_auth_number' }

    const status = normalizeStatus(payerName, payload.status)

    const auth = await prisma.priorAuthorization.findFirst({ where: { authNumber } })
    if (!auth) return { processed: false, reason: 'auth_not_found' }

    const referralId = await this._applyDecision(auth.id, {
      status,
      authNumber: payload.authorizationNumber,
      expiresAt: payload.expirationDate ? new Date(payload.expirationDate) : null,
      approvedCodes: payload.approvedCodes || [],
      denialReason: payload.denialReason || null,
      denialCode: payload.denialCode || null,
      rawResponse: payload,
    })

    return { processed: true, status, referralId }
  }

  /**
   * Apply a payer decision to an auth + its referral, notify the patient, and
   * feed the denial-learning loop. Shared by synchronous submit() responses,
   * the async poller, and inbound webhooks so all three paths behave identically.
   * Returns the referralId (or null).
   */
  async _applyDecision(authId, d) {
    const auth = await prisma.priorAuthorization.findUnique({
      where: { id: authId },
      include: { referrals: { include: { patient: true } } },
    })
    if (!auth) return null

    await prisma.priorAuthorization.update({
      where: { id: auth.id },
      data: {
        status: d.status,
        ...(d.authNumber ? { authNumber: d.authNumber } : {}),
        determinedAt: new Date(),
        ...(d.expiresAt ? { expiresAt: new Date(d.expiresAt) } : {}),
        ...(d.approvedCodes ? { approvedCodes: d.approvedCodes } : {}),
        denialReason: d.denialReason || null,
        denialCode: d.denialCode || null,
        ...(d.rawResponse ? { rawResponse: d.rawResponse } : {}),
      },
    })

    await redis.setex(
      `auth:${auth.id}:status`,
      3600,
      JSON.stringify({ status: d.status, authNumber: d.authNumber, expiresAt: d.expiresAt }),
    )

    const referral = auth.referrals?.[0]
    if (referral) {
      const newReferralStatus =
        d.status === 'APPROVED' ? 'AUTH_APPROVED' : d.status === 'DENIED' ? 'AUTH_DENIED' : 'AUTH_PENDING'
      await prisma.referral.update({
        where: { id: referral.id },
        data: {
          status: newReferralStatus,
          statusHistory: { push: { status: newReferralStatus, timestamp: new Date().toISOString(), note: `Payer decision: ${d.status}` } },
        },
      })

      // ── Patient notifications on auth decision ──────────────────────────────
      const patient = referral.patient
      if (patient?.smsOptIn && patient?.phone) {
        const { NotifyService } = await import('../notifications/notify.service.js')
        const notify = new NotifyService()
        if (d.status === 'APPROVED') {
          const authNum = d.authNumber ?? 'confirmed'
          const expiry = d.expiresAt
            ? new Date(d.expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            : null
          await notify.sms(
            patient.phone,
            `✅ Good news, ${patient.firstName}! Your ${referral.specialty} referral has been APPROVED by your insurance (Auth #${authNum})${expiry ? `, valid until ${expiry}` : ''}. Call the specialist to schedule your appointment now.`,
            referral.id, 'AUTH_APPROVED',
          ).catch(() => {})
        } else if (d.status === 'DENIED') {
          const reason = d.denialReason ?? 'See denial letter for details'
          await notify.sms(
            patient.phone,
            `⚠️ ${patient.firstName}, your ${referral.specialty} referral was denied by your insurance. Reason: ${reason}. You have the right to appeal — your doctor's office can help. Call them to discuss next steps.`,
            referral.id, 'AUTH_DENIED',
          ).catch(() => {})
        }
      }
    }

    // Denial feedback loop — update PolicyRule statistics so PAIA learns
    if (d.status === 'DENIED' || d.status === 'APPROVED') {
      recordAuthOutcome({
        procedureCodes: auth.requestedCodes ?? [],
        payerId: auth.payerId,
        outcome: d.status,
      }).catch((err) => console.warn('[DenialFeedback] Non-fatal update error:', err.message))
    }

    return referral?.id ?? null
  }

  /**
   * Generate-and-submit an appeal for a denied auth via the payer gateway.
   * The appeal letter text is produced upstream (ai.service) and passed in.
   */
  async submitAppeal({ authId, appealText }) {
    const auth = await prisma.priorAuthorization.findUnique({
      where: { id: authId },
      include: { referrals: true, payer: true },
    })
    if (!auth) throw new Error('auth_not_found')

    await prisma.priorAuthorization.update({
      where: { id: auth.id },
      data: { status: 'APPEALED', appealText, appealSubmitted: true },
    })

    try {
      const result = await payerGateway.submitAppeal({
        auth: { ...auth, referrals: auth.referrals.map((r) => ({ id: r.id })) },
        payer: auth.payer,
        appealText,
      })
      if (!result.pending && ['APPROVED', 'DENIED'].includes(result.status)) {
        await this._applyDecision(auth.id, {
          status: result.status === 'APPROVED' ? 'APPEAL_APPROVED' : 'APPEAL_DENIED',
          authNumber: result.authNumber,
          expiresAt: result.expiresAt,
          denialReason: result.denialReason,
          rawResponse: result.rawResponse,
        })
      } else {
        await scheduleAuthPoll(auth.id, auth.payerId, auth.urgency).catch(() => {})
      }
      return { submitted: true, status: result.status }
    } catch (err) {
      console.warn(`[Appeal] submission warning for auth ${auth.id}:`, err.message)
      return { submitted: true, status: 'APPEALED', pendingManual: true }
    }
  }

  async getRequirements(planId) {
    const plan = await prisma.insurancePlan.findUnique({
      where: { id: planId },
      include: { payer: true },
    })
    if (!plan) return null

    // Check cache
    const cacheKey = `auth_requirements:${planId}`
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached)

    const requirements = {
      planId,
      planName: plan.planName,
      planType: plan.planType,
      payer: plan.payer.name,
      requiresReferral: plan.requiresReferral,
      requiresPriorAuth: plan.requiresPriorAuth,
      // In Phase 2 this is pulled live from payer FHIR/API
      standardProcessingDays: 7,
      urgentProcessingHours: 72,
      appealWindowDays: 30,
      requiredDocumentation: ['clinical-notes', 'diagnosis-codes', 'procedure-codes'],
      authRules: plan.authRulesJson || {},
    }

    await redis.setex(cacheKey, 3600 * 4, JSON.stringify(requirements))
    return requirements
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const CANONICAL = new Set(['APPROVED', 'DENIED', 'IN_REVIEW', 'PENDING', 'PARTIALLY_APPROVED', 'EXPIRED', 'SUBMITTED'])

function normalizeStatus(payer, raw) {
  // Already-canonical statuses (our simulator, FHIR-normalized payers) pass through.
  if (CANONICAL.has(raw)) return raw

  const maps = {
    united:  { APPROVED: 'APPROVED', DENIED: 'DENIED', PENDED: 'IN_REVIEW', CANCELLED: 'EXPIRED' },
    bcbs:    { A: 'APPROVED', D: 'DENIED', P: 'IN_REVIEW', APPROVED: 'APPROVED', DENIED: 'DENIED' },
    kaiser:  { approved: 'APPROVED', denied: 'DENIED', 'in-review': 'IN_REVIEW' },
    aetna:   { APPROVED: 'APPROVED', DENIED: 'DENIED', PENDING: 'PENDING', RECEIVED: 'SUBMITTED', PARTIAL: 'PARTIALLY_APPROVED' },
    cigna:   { CERTIFIED: 'APPROVED', DENIED: 'DENIED', PENDING: 'IN_REVIEW' },
    humana:  { APPROVED: 'APPROVED', NOT_APPROVED: 'DENIED', IN_PROGRESS: 'IN_REVIEW' },
  }
  const key = Object.keys(maps).find(k => payer?.toLowerCase().includes(k))
  return (key && maps[key][raw]) || 'IN_REVIEW'
}
