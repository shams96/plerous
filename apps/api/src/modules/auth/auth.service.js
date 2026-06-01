import axios from 'axios'
import { prisma } from '../../db/client.js'
import { redis } from '../../db/client.js'
import { config } from '../../config/index.js'
import { buildPASBundle, parseClaimResponse } from '../../fhir/davinci-pas.js'
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

    // Route to payer integration
    try {
      if (payer?.name?.toLowerCase().includes('united')) {
        await this._submitUHC({ auth, payer, diagnosisCodes, procedureCodes, urgency, referringProviderNpi })
      } else {
        await this._submitFHIR({ auth, payer, diagnosisCodes, procedureCodes })
      }
    } catch (err) {
      // Non-fatal — auth record exists, webhook will update status
      console.warn(`Payer submission warning for auth ${auth.id}:`, err.message)
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

    // Sandbox response — replace with live payer API
    const result = {
      eligible: true,
      coverageActive: true,
      requiresReferral: true,
      requiresPriorAuth: true,
      copay: 40,
      deductible: { met: 1200, total: 2500 },
      outOfPocketMax: { met: 1200, total: 7500 },
      network: 'in-network',
      effectiveDate: '2026-01-01',
      terminationDate: '2026-12-31',
      planType: 'HMO',
    }

    await redis.setex(cacheKey, 14400, JSON.stringify(result))
    return result
  }

  async processWebhook(payerName, payload) {
    const authNumber = payload.authorizationNumber || payload.priorAuthNumber
    if (!authNumber) return { processed: false, reason: 'no_auth_number' }

    const status = normalizeStatus(payerName, payload.status)

    const auth = await prisma.priorAuthorization.findFirst({
      where: { authNumber },
      include: { referrals: { include: { patient: true } } },
    })
    if (!auth) return { processed: false, reason: 'auth_not_found' }

    await prisma.priorAuthorization.update({
      where: { id: auth.id },
      data: {
        status,
        authNumber: payload.authorizationNumber,
        determinedAt: new Date(),
        expiresAt: payload.expirationDate ? new Date(payload.expirationDate) : null,
        approvedCodes: payload.approvedCodes || [],
        denialReason: payload.denialReason || null,
        denialCode: payload.denialCode || null,
        rawResponse: payload,
      },
    })

    await redis.setex(`auth:${auth.id}:status`, 3600, JSON.stringify({ status, authNumber, expiresAt: payload.expirationDate }))

    const referral = auth.referrals?.[0]
    if (referral) {
      const newReferralStatus = status === 'APPROVED' ? 'AUTH_APPROVED' : status === 'DENIED' ? 'AUTH_DENIED' : 'AUTH_PENDING'
      await prisma.referral.update({
        where: { id: referral.id },
        data: { status: newReferralStatus, statusHistory: { push: { status: newReferralStatus, timestamp: new Date().toISOString(), note: `Payer decision: ${status}` } } },
      })

      // ── Patient notifications on auth decision (GAP 2) ─────────────────────
      // Business: patients currently discover auth outcomes by calling around.
      // We notify them immediately so they can act (schedule or appeal).
      const patient = referral.patient
      if (patient?.smsOptIn && patient?.phone) {
        const { NotifyService } = await import('../notifications/notify.service.js')
        const notify = new NotifyService()

        if (status === 'APPROVED') {
          const authNum = payload.authorizationNumber ?? 'confirmed'
          const expiry  = payload.expirationDate
            ? new Date(payload.expirationDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            : null
          await notify.sms(
            patient.phone,
            `✅ Good news, ${patient.firstName}! Your ${referral.specialty} referral has been APPROVED by your insurance (Auth #${authNum})${expiry ? `, valid until ${expiry}` : ''}. Call the specialist to schedule your appointment now.`,
            referral.id, 'AUTH_APPROVED',
          )
        } else if (status === 'DENIED') {
          const reason = payload.denialReason ?? 'See denial letter for details'
          await notify.sms(
            patient.phone,
            `⚠️ ${patient.firstName}, your ${referral.specialty} referral was denied by your insurance. Reason: ${reason}. You have the right to appeal — your doctor's office can help. Call them to discuss next steps.`,
            referral.id, 'AUTH_DENIED',
          )
        }
      }
    }

    // Denial feedback loop — update PolicyRule statistics so PAIA learns
    if (status === 'DENIED' || status === 'APPROVED') {
      recordAuthOutcome({
        procedureCodes: auth.requestedCodes ?? [],
        payerId:        auth.payerId,
        outcome:        status,
      }).catch((err) => console.warn('[DenialFeedback] Non-fatal update error:', err.message))
    }

    return { processed: true, status, referralId: referral?.id }
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

  // ── Private: Payer integrations ────────────────────────────────────────────
  async _submitUHC({ auth, payer, diagnosisCodes, procedureCodes, urgency, referringProviderNpi }) {
    // In production: real UHC Prior Auth API
    console.log(`[UHC] Submitting auth ${auth.id} to UHC sandbox`)
    // Simulate async payer processing — in prod this is a real API call
    return { submitted: true, estimatedDecision: urgency === 'URGENT' ? '72h' : '7 days' }
  }

  async _submitFHIR({ auth, payer }) {
    // Da Vinci PAS — build proper FHIR R4 bundle per HL7 IG
    const referral = await prisma.referral.findUnique({
      where: { id: auth.referrals?.[0]?.id ?? auth.id },
      include: {
        patient: true,
        referringProvider: true,
        sendingOrg: true,
      },
    }).catch(() => null)

    if (!referral) {
      console.log(`[PAS] No referral found for auth ${auth.id} — using minimal claim`)
      return { fhirClaimId: `fhir-${auth.id}` }
    }

    const bundle = buildPASBundle({
      referral,
      patient: referral.patient,
      payer,
      provider: referral.referringProvider,
      organization: referral.sendingOrg,
    })

    if (payer?.fhirBaseUrl) {
      try {
        const res = await axios.post(`${payer.fhirBaseUrl}/Claim/$submit`, bundle, {
          headers: { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json' },
          timeout: 10000,
        })
        const parsed = parseClaimResponse(res.data)
        if (parsed.authNumber) {
          await prisma.priorAuthorization.update({
            where: { id: auth.id },
            data: {
              authNumber: parsed.authNumber,
              status: parsed.status,
              expiresAt: parsed.expiresAt,
              fhirClaimId: bundle.id,
              rawResponse: res.data,
            },
          })
        }
        return { fhirClaimId: bundle.id, status: parsed.status }
      } catch (err) {
        console.warn(`[PAS] Payer FHIR submission failed: ${err.message} — async resolution expected`)
      }
    } else {
      console.log(`[PAS] Payer ${payer?.name} has no FHIR URL — bundle staged for manual/EDI submission`)
      console.log(`[PAS] Bundle ID: ${bundle.id}`)
    }

    await prisma.priorAuthorization.update({
      where: { id: auth.id },
      data: { fhirClaimId: bundle.id },
    }).catch(() => {})

    return { fhirClaimId: bundle.id }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizeStatus(payer, raw) {
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
