/**
 * Deal Asset Generator — Agent 7
 *
 * Generates custom sales collateral for any prospect in <30 seconds.
 * Replaces custom marketing requests and manual ROI spreadsheets.
 *
 * Asset types:
 *   roi_calculator — HTML page with their specific numbers
 *   one_pager      — executive summary for practice manager / CFO
 *   case_study     — comparison to a similar existing customer
 */

import { prisma }   from '../db/client.js'
import { lookupNPI } from '../lib/nppes.js'
import Anthropic    from '@anthropic-ai/sdk'
import { config }   from '../config/index.js'

const anthropic = config.anthropic?.apiKey
  ? new Anthropic({ apiKey: config.anthropic.apiKey })
  : null

const REVENUE_PER_PATIENT = {
  'Orthopedics': 8000, 'Cardiology': 3500, 'Oncology': 5000,
  'Neurology': 2000, 'Gastroenterology': 1800, 'Urology': 2200,
  'Nephrology': 1500, 'Pulmonary Disease': 1200, 'Internal Medicine': 800,
  'Family Medicine': 600, default: 1200,
}

const MONTHLY_VOLUME = {
  'Internal Medicine': 40, 'Family Medicine': 35, 'Cardiology': 25,
  'Pulmonary Disease': 20, 'Nephrology': 20, 'Gastroenterology': 18,
  'Orthopedics': 15, 'Neurology': 12, default: 15,
}

export class AssetAgent {
  async run({ npi, assetType = 'roi_calculator', customContext = '' }) {
    if (!anthropic) return { error: 'Anthropic API key not configured' }

    // Get prospect data
    let prospectName = 'Your Practice'
    let specialty    = 'Your Specialty'
    let city         = ''

    if (npi) {
      try {
        const profile  = await lookupNPI(npi)
        if (profile) {
          prospectName = profile.orgName ?? `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim()
          specialty    = profile.specialty ?? specialty
          city         = profile.practiceAddress?.city ?? ''
        }
      } catch { /* use defaults */ }
    }

    const monthlyVol     = MONTHLY_VOLUME[specialty]      ?? MONTHLY_VOLUME.default
    const revenuePerPt   = REVENUE_PER_PATIENT[specialty] ?? REVENUE_PER_PATIENT.default
    const monthlyLeakage = Math.round(monthlyVol * 0.20 * revenuePerPt)
    const annualLeakage  = monthlyLeakage * 12
    const roiMultiple    = Math.round(monthlyLeakage / 99)

    // Find a comparable existing customer for case study
    let caseStudyCustomer = null
    if (assetType === 'case_study') {
      caseStudyCustomer = await prisma.organization.findFirst({
        where: {
          npi:      { not: { endsWith: '-org' } },  // seed orgs only
          providers: { some: { specialty } },
        },
        include: { providers: { take: 1 } },
      })
    }

    const prompts = {
      roi_calculator: `Create a clean, professional HTML ROI calculator page for a healthcare practice evaluating Plerous.

Practice: ${prospectName}${city ? `, ${city}` : ''}
Specialty: ${specialty}
Numbers to feature:
  - Estimated monthly referrals: ${monthlyVol}
  - Industry leakage rate: 20%
  - Estimated leakages/month: ${Math.round(monthlyVol * 0.2)}
  - Monthly revenue at risk: $${monthlyLeakage.toLocaleString()}
  - Annual revenue at risk: $${annualLeakage.toLocaleString()}
  - Plerous cost: $99/month
  - ROI: ${roiMultiple}x

Design: Clean white background, Plerous amethyst accents (#5C2D8E) with warm amber highlights (#E8941A), modern sans-serif. Show a visual comparison of "Without Plerous" vs "With Plerous". Include a clear CTA to start free trial at the bottom. Self-contained HTML (no external dependencies except Google Fonts).`,

      one_pager: `Create a professional one-page executive summary HTML document for a ${specialty} practice considering Plerous.

Practice name: ${prospectName}
Key numbers: $${annualLeakage.toLocaleString()} annual leakage, ${roiMultiple}x ROI, $99/month
${customContext}

Include: problem statement, Plerous solution, 3 key benefits, ROI calculation, social proof placeholder, CTA.
Design: Clean, professional, printer-friendly. White background, Plerous amethyst (#5C2D8E). Self-contained HTML.`,

      case_study: `Create an HTML case study comparing a ${specialty} practice's results with Plerous.

${caseStudyCustomer ? `Reference customer: ${caseStudyCustomer.name} (${specialty})` : `Reference: A similar ${specialty} practice`}
Metrics to highlight (use realistic estimates):
  - Referrals recovered per month: ${Math.round(monthlyVol * 0.15)} (15% recovery rate)
  - Monthly revenue recovered: $${Math.round(monthlyVol * 0.15 * revenuePerPt).toLocaleString()}
  - Time saved per week: ~8 hours of coordinator time
  - Prior auth denial rate reduction: 23%

Design: Professional case study format. Metrics in large callout boxes. Quote placeholder. Before/After comparison. Self-contained HTML.`,
    }

    const prompt = prompts[assetType] ?? prompts.roi_calculator

    const resp = await anthropic.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    })

    const html = resp.content[0]?.text ?? ''

    return {
      assetType,
      npi:          npi ?? null,
      prospectName,
      specialty,
      economics: {
        monthlyLeakage,
        annualLeakage,
        roiMultiple,
      },
      html,
      generatedAt: new Date().toISOString(),
    }
  }
}
