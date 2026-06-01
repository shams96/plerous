import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../../db/client.js'
import { config } from '../../config/index.js'
import { getWeights } from './training-loop.js'

const anthropic = config.anthropic.apiKey
  ? new Anthropic({ apiKey: config.anthropic.apiKey })
  : null

export class AIService {
  // ── Risk Scoring (training-loop weight-aware) ───────────────────────────────
  async scoreReferral({ specialty, diagnosisCodes, insurancePlanType, patientAge, urgency }) {
    const w = await getWeights()
    let risk = w.base_risk

    // Insurance type risk
    const highRiskPlans = ['HMO', 'MEDICARE_ADVANTAGE', 'MEDICAID']
    if (highRiskPlans.includes(insurancePlanType)) risk += w.hmo_risk_bonus
    if (insurancePlanType === 'MEDICAID') risk += w.medicaid_extra

    // Specialty complexity
    const complexSpecialties = ['Neurology', 'Oncology', 'Cardiology', 'Transplant', 'Rheumatology', 'Neurosurgery']
    if (complexSpecialties.includes(specialty)) risk += w.complex_specialty_bonus

    // Age risk
    if (patientAge > 70) risk += w.age_over_70_bonus
    else if (patientAge < 18) risk += w.age_under_18_bonus

    // Urgency
    if (urgency === 'STAT') risk = Math.max(risk, 85)
    else if (urgency === 'URGENT') risk = Math.max(risk, 60)

    // Diagnosis risk (mental health, substance use = higher no-show)
    const highRiskPrefixes = ['F', 'Z71', 'Z72']
    if (diagnosisCodes?.some(c => highRiskPrefixes.some(p => c.startsWith(p)))) risk += w.mental_health_dx_bonus

    risk = Math.min(100, risk)

    return {
      riskScore: risk,
      approvalProbability: Math.max(10, Math.round(95 - risk * 0.65)),
      leakageRisk: risk >= 70 ? 'high' : risk >= 40 ? 'medium' : 'low',
    }
  }

  // ── Provider Matching ───────────────────────────────────────────────────────
  async matchProvider({ specialty, insurancePlanId, diagnosisCodes, patientZip }) {
    const providers = await prisma.provider.findMany({
      where: {
        specialty,
        acceptingNewPatients: true,
        ...(insurancePlanId && { insuranceNetworks: { has: insurancePlanId } }),
      },
      include: { organization: true },
      take: 20,
    })

    const scored = providers
      .map(p => ({ ...p, matchScore: scoreProvider(p, diagnosisCodes) }))
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5)

    return scored.map(p => ({
      providerId: p.id,
      name: `Dr. ${p.firstName} ${p.lastName}`,
      specialty: p.specialty,
      subSpecialty: p.subSpecialty,
      organization: p.organization.name,
      matchScore: p.matchScore,
      acceptingPatients: p.acceptingNewPatients,
      languages: p.languages,
    }))
  }

  // ── Approval Prediction ─────────────────────────────────────────────────────
  async predictApproval({ payerId, specialty, diagnosisCodes, procedureCodes }) {
    let base = 0.78

    // Historically difficult CPT codes
    const hardCodes = ['27447', '22612', '63047', '93306', '70553']
    if (procedureCodes?.some(c => hardCodes.includes(c))) base -= 0.15

    // High-denial specialties
    const hardSpecialties = ['Behavioral Health', 'Pain Management', 'Bariatric Surgery']
    if (hardSpecialties.includes(specialty)) base -= 0.12

    const probability = Math.min(0.98, Math.max(0.05, base))

    return {
      approvalProbability: Math.round(probability * 100),
      confidence: 'medium',
      recommendation: probability < 0.6
        ? 'High denial risk — attach comprehensive clinical documentation and peer-reviewed guidelines'
        : probability < 0.8
        ? 'Moderate risk — include detailed clinical notes and medical necessity statement'
        : 'Standard submission should succeed',
      factors: [
        { factor: 'Specialty approval rate', impact: hardSpecialties.includes(specialty) ? 'negative' : 'positive' },
        { factor: 'Procedure code history', impact: procedureCodes?.some(c => hardCodes.includes(c)) ? 'negative' : 'neutral' },
        { factor: 'Diagnosis alignment', impact: 'positive' },
      ],
    }
  }

  // ── Appeal Generation (Claude) ──────────────────────────────────────────────
  async generateAppeal({ referralId, denialReason, denialCode, additionalNotes }) {
    const referral = await prisma.referral.findUnique({
      where: { id: referralId },
      include: {
        patient: true,
        referringProvider: { include: { organization: true } },
        authorization: { include: { payer: true } },
      },
    })
    if (!referral) throw new Error('Referral not found')

    const age = Math.floor((Date.now() - new Date(referral.patient.dateOfBirth)) / (365.25 * 24 * 60 * 60 * 1000))

    const prompt = `You are a medical appeal specialist writing a formal prior authorization appeal letter.

DENIAL INFORMATION:
- Denial Reason: ${denialReason}
- Denial Code: ${denialCode || 'Not provided'}
- Service Requested: ${referral.specialty} consultation
- Diagnosis Codes: ${referral.diagnosisCodes.join(', ')}
- Procedure Codes: ${referral.procedureCodes.join(', ')}

CLINICAL CONTEXT:
- Patient Age: ${age} years
- Insurance: ${referral.authorization?.payer?.name || 'HMO'}
- Urgency: ${referral.urgency}
- Clinical Notes: ${referral.clinicalNotes || additionalNotes || 'Referral for specialist evaluation'}
- Referring Organization: ${referral.referringProvider.organization.name}

Write a compelling, professional appeal letter (3-4 paragraphs) that:
1. States the denial reference and formally requests reconsideration
2. Provides clinical justification with specific medical necessity criteria per CMS guidelines
3. Cites relevant clinical guidelines (use AHA, ACS, USPSTF, or specialty-specific guidelines as appropriate for the diagnosis)
4. Closes urgently with a request for expedited review given clinical needs

Format: Professional medical letter. Be specific, evidence-based, and clinically precise. Do not include patient PII beyond age and diagnosis codes.`

    let appealText

    if (anthropic) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })
      appealText = response.content[0].text
    } else {
      appealText = '[AI appeal generation requires ANTHROPIC_API_KEY — configure in .env]'
    }

    // Save to auth record
    if (referral.authorizationId) {
      await prisma.priorAuthorization.update({
        where: { id: referral.authorizationId },
        data: { appealText, appealSubmitted: false, status: 'APPEALED' },
      })
    }

    return {
      appealLetter: appealText,
      generatedAt: new Date().toISOString(),
      referralId,
      nextSteps: [
        'Review and add any specific patient details the letter references as placeholders',
        `Submit to ${referral.authorization?.payer?.name || 'payer'} within the appeal window (typically 30 days from denial)`,
        `Send via certified mail or payer secure portal — keep tracking number`,
        'Follow up in 5 business days if no acknowledgment',
      ],
    }
  }

  // ── Revenue Leakage Report ──────────────────────────────────────────────────
  async leakageReport(organizationId, { startDate, endDate }) {
    const referrals = await prisma.referral.findMany({
      where: {
        sendingOrgId: organizationId,
        createdAt: { gte: new Date(startDate), lte: new Date(endDate) },
      },
    })

    const total = referrals.length
    const byStatus = referrals.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1
      return acc
    }, {})

    const leaked = (byStatus.CANCELLED || 0) + (byStatus.NO_SHOW || 0) + (byStatus.AUTH_DENIED || 0) + (byStatus.EXPIRED || 0)
    const leakageRate = total > 0 ? parseFloat((leaked / total * 100).toFixed(1)) : 0

    const revenueAtRisk = referrals
      .filter(r => ['CANCELLED', 'NO_SHOW', 'AUTH_DENIED', 'EXPIRED'].includes(r.status))
      .reduce((sum, r) => sum + (r.estimatedRevenue || 0), 0)

    return {
      period: { startDate, endDate },
      summary: { total, completed: byStatus.COMPLETED || 0, leaked, leakageRate },
      revenue: {
        atRisk: revenueAtRisk,
        protected: referrals.filter(r => r.status === 'COMPLETED').reduce((s, r) => s + (r.estimatedRevenue || 0), 0),
      },
      breakdown: byStatus,
      benchmark: {
        industryAverage: 60,
        yourRate: leakageRate,
        vsIndustry: `${(60 - leakageRate).toFixed(1)}% ${leakageRate < 60 ? 'better' : 'worse'} than industry avg`,
      },
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function scoreProvider(provider, diagnosisCodes) {
  let score = 50
  if (provider.subSpecialty) score += 15
  if (provider.acceptingNewPatients) score += 20
  if (provider.languages?.length > 1) score += 10
  return score
}
