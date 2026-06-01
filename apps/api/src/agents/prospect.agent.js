/**
 * Prospect Intelligence Agent
 *
 * Turns any NPI into a complete outreach brief in <3 seconds.
 * Replaces Clay for healthcare lead enrichment — no external tool needed.
 *
 * Output:
 *   - Provider / org profile from NPPES (free, no key required)
 *   - Estimated monthly referral volume by specialty
 *   - Estimated monthly leakage cost
 *   - CMS-0057-F compliance urgency (is their payer mix high-risk?)
 *   - Personalized outreach paragraph (Claude-generated)
 *   - Whether they're already in Plerous DB
 */

import { lookupNPI } from '../lib/nppes.js'
import { prisma }    from '../db/client.js'
import Anthropic     from '@anthropic-ai/sdk'
import { config }    from '../config/index.js'

const anthropic = config.anthropic?.apiKey
  ? new Anthropic({ apiKey: config.anthropic.apiKey })
  : null

// Estimated monthly referral sends by specialty (conservative)
const REFERRAL_VOLUME_BY_SPECIALTY = {
  'Internal Medicine':     40,
  'Family Medicine':       35,
  'General Practice':      30,
  'Cardiology':            25,
  'Pulmonary Disease':     20,
  'Nephrology':            20,
  'Gastroenterology':      18,
  'Orthopedics':           15,
  'Neurology':             12,
  'Oncology':              10,
  'Rheumatology':          12,
  'Endocrinology':         12,
  'Urology':               15,
  'Dermatology':           10,
  'Ophthalmology':         8,
  default:                 15,
}

// Average revenue per patient by specialty (conservative estimates)
const REVENUE_PER_PATIENT = {
  'Orthopedics':           8000,
  'Cardiology':            3500,
  'Oncology':              5000,
  'Neurology':             2000,
  'Gastroenterology':      1800,
  'Urology':               2200,
  'Nephrology':            1500,
  'Pulmonary Disease':     1200,
  'Internal Medicine':     800,
  'Family Medicine':       600,
  default:                 1200,
}

// Specialties most impacted by CMS-0057-F (high prior auth volume)
const HIGH_AUTH_SPECIALTIES = [
  'Cardiology', 'Orthopedics', 'Oncology', 'Neurology',
  'Gastroenterology', 'Pulmonary Disease', 'Rheumatology',
]

export class ProspectAgent {
  async run(npi) {
    // ── 1. NPPES lookup ───────────────────────────────────────────────────────
    const profile = await lookupNPI(npi)
    if (!profile) return { error: 'NPI not found in NPPES registry' }

    const specialty  = profile.specialty ?? 'Unknown'
    const firstName  = profile.firstName ?? ''
    const lastName   = profile.lastName  ?? ''
    const fullName   = profile.orgName
      ?? (firstName || lastName ? `${firstName} ${lastName}`.trim() : 'Unknown Provider')

    // ── 2. Check if already in Plerous ──────────────────────────────────────
    const existingOrg = await prisma.organization.findFirst({
      where: { npi: { contains: npi } },
    })
    const alreadyInPlerous = !!existingOrg

    // ── 3. Estimate referral economics ───────────────────────────────────────
    const monthlyVolume   = REFERRAL_VOLUME_BY_SPECIALTY[specialty]   ?? REFERRAL_VOLUME_BY_SPECIALTY.default
    const revenuePerPt    = REVENUE_PER_PATIENT[specialty]            ?? REVENUE_PER_PATIENT.default
    const leakageRate     = 0.20   // industry average 20%
    const leakedPerMonth  = Math.round(monthlyVolume * leakageRate)
    const monthlyLeakage  = Math.round(leakedPerMonth * revenuePerPt)
    const annualLeakage   = monthlyLeakage * 12
    const monthlySubCost  = 99    // STARTER tier
    const roiMultiple     = Math.round(monthlyLeakage / monthlySubCost)

    // ── 4. CMS-0057-F urgency ─────────────────────────────────────────────────
    const complianceUrgent = HIGH_AUTH_SPECIALTIES.includes(specialty)
    const complianceNote   = complianceUrgent
      ? `${specialty} practices send high prior auth volume — CMS-0057-F (Jan 2027) requires FHIR-native PA compliance`
      : 'CMS-0057-F (Jan 2027) requires all practices to support FHIR prior auth APIs'

    // ── 5. Check nearby providers in Plerous network ────────────────────────
    const state          = profile.address?.state ?? ''
    const address         = profile.practiceAddress ?? {}
    const nearbyProviders = await prisma.provider.findMany({
      where:   { licenseState: state, specialty },
      include: { organization: { select: { name: true } } },
      take:    3,
    })

    // ── 6. Generate personalized outreach with Claude ────────────────────────
    let outreachParagraph = null
    let subjectLine       = null

    if (anthropic) {
      try {
        const providerName = fullName
        const resp = await anthropic.messages.create({
          model:      'claude-haiku-4-5',
          max_tokens: 300,
          messages: [{
            role:    'user',
            content: `Write a personalized cold outreach paragraph and subject line for this healthcare provider.
Tone: peer-to-peer, concise, specific numbers, no fluff. Reference their specialty and location.

Provider: ${providerName}
Specialty: ${specialty}
Location: ${address.city ?? ''}, ${state}
Monthly referral volume estimate: ${monthlyVolume}
Estimated monthly leakage: $${monthlyLeakage.toLocaleString()}
CMS-0057-F urgent for this specialty: ${complianceUrgent}
ROI multiple: ${roiMultiple}x

Format as JSON: { "subject": "...", "paragraph": "..." }`,
          }],
        })
        const match = resp.content[0]?.text?.match(/\{[\s\S]*\}/)
        if (match) {
          const parsed    = JSON.parse(match[0])
          subjectLine      = parsed.subject    ?? null
          outreachParagraph = parsed.paragraph ?? null
        }
      } catch { /* non-blocking */ }
    }

    return {
      npi,
      alreadyInPlerous,
      profile: {
        name:       fullName,
        firstName,
        lastName,
        specialty,
        address,
        phone:      profile.phone,
        fax:        profile.fax,
        email:      profile.email,
        credential: profile.credential,
      },
      economics: {
        estimatedMonthlyReferrals: monthlyVolume,
        leakageRateAssumed:        `${Math.round(leakageRate * 100)}%`,
        estimatedMonthlyLeakage:   monthlyLeakage,
        estimatedAnnualLeakage:    annualLeakage,
        monthlySubCost,
        roiMultiple,
        roiStatement: `At $${monthlySubCost}/month, Plerous pays for itself if it recovers just 1 of ${leakedPerMonth} leaked referrals.`,
      },
      compliance: {
        urgent:      complianceUrgent,
        note:        complianceNote,
        deadline:    'January 2027',
      },
      network: {
        nearbyProvidersInPlerous: nearbyProviders.map(p => ({
          name: `Dr. ${p.lastName}`,
          org:  p.organization?.name,
        })),
      },
      outreach: {
        subject:   subjectLine,
        paragraph: outreachParagraph,
      },
    }
  }
}
