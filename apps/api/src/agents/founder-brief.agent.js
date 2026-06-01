/**
 * Founder Morning Brief Agent
 *
 * Internal-only. Gives the DRI complete situational awareness every morning
 * without checking six different places manually.
 *
 * Covers:
 *   - Trial customers: engagement, days remaining, referrals submitted
 *   - Paying customers: churn risk signals
 *   - New signups overnight (NPI lookups not yet converted)
 *   - Pipeline blockers (Availity status, UHC sandbox)
 *   - Top 3 actions for today
 */

import { prisma } from '../db/client.js'
import Anthropic   from '@anthropic-ai/sdk'
import { config }  from '../config/index.js'

const anthropic = config.anthropic?.apiKey
  ? new Anthropic({ apiKey: config.anthropic.apiKey })
  : null

// Trial orgs = NPIs ending in '-org' (created via onboarding)
const isTrialOrg = (npi) => npi && npi.includes('-org')

export class FounderBriefAgent {
  async run() {
    const now     = new Date()
    const weekAgo = new Date(now - 7   * 86400000)
    const dayAgo  = new Date(now - 1   * 86400000)

    // ── 1. All orgs ───────────────────────────────────────────────────────────
    const allOrgs = await prisma.organization.findMany({
      where:   { isActive: true },
      include: {
        providers: { include: { user: true } },
        apiKeys:   { where: { isActive: true } },
        referralsSent: {
          where:   { createdAt: { gte: weekAgo } },
          select:  { id: true, status: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Separate seed (paying) from trial orgs
    const trialOrgs = allOrgs.filter(o => isTrialOrg(o.npi))
    const seedOrgs  = allOrgs.filter(o => !isTrialOrg(o.npi))

    // ── 2. Trial customer health ───────────────────────────────────────────────
    const trialCustomers = trialOrgs.map(org => {
      const createdAt    = new Date(org.createdAt)
      const daysOld      = Math.floor((now - createdAt) / 86400000)
      const trialDaysLeft = Math.max(0, 14 - daysOld)
      const weekReferrals = org.referralsSent.length
      const engagementSignal = weekReferrals === 0 && daysOld >= 3
        ? 'AT_RISK'
        : weekReferrals >= 3
          ? 'ENGAGED'
          : 'LOW'

      return {
        orgId:          org.id,
        orgName:        org.name,
        npi:            org.npi,
        daysOld,
        trialDaysLeft,
        weekReferrals,
        engagementSignal,
        providerCount:  org.providers.length,
        hasApiKey:      org.apiKeys.length > 0,
      }
    })

    const atRisk  = trialCustomers.filter(c => c.engagementSignal === 'AT_RISK')
    const engaged = trialCustomers.filter(c => c.engagementSignal === 'ENGAGED')
    const expiringSoon = trialCustomers.filter(c => c.trialDaysLeft <= 3)

    // ── 3. Paying customer churn signals ──────────────────────────────────────
    const payingCustomers = await Promise.all(seedOrgs.map(async org => {
      const lastReferral = await prisma.referral.findFirst({
        where:   { sendingOrgId: org.id },
        orderBy: { createdAt: 'desc' },
        select:  { createdAt: true },
      })
      const daysSinceLastReferral = lastReferral
        ? Math.floor((now - new Date(lastReferral.createdAt)) / 86400000)
        : null

      return {
        orgId:   org.id,
        orgName: org.name,
        npi:     org.npi,
        daysSinceLastReferral,
        churnRisk: daysSinceLastReferral !== null && daysSinceLastReferral > 7
          ? 'HIGH'
          : daysSinceLastReferral !== null && daysSinceLastReferral > 3
            ? 'MEDIUM'
            : 'LOW',
      }
    }))

    const highChurnRisk = payingCustomers.filter(c => c.churnRisk === 'HIGH')

    // ── 4. Platform stats ─────────────────────────────────────────────────────
    const [totalReferrals, recentReferrals, totalProviders] = await Promise.all([
      prisma.referral.count(),
      prisma.referral.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.provider.count(),
    ])

    // ── 5. Known blockers (hard-coded known items) ────────────────────────────
    const blockers = [
      {
        item:   'Availity credentials (BCBS TX)',
        status: 'IN_PROCESS',
        note:   'Application ID 63661218 — check portal for approval status',
        urgent: false,
      },
      {
        item:   'UHC developer sandbox',
        status: 'NOT_STARTED',
        note:   'Apply at developer.uhc.com — 2-3 week approval window',
        urgent: true,
      },
    ]

    // ── 6. Build top actions via Claude ───────────────────────────────────────
    let topActions = []
    let headline   = `${trialCustomers.length} trials · ${atRisk.length} at risk · ${highChurnRisk.length} paying orgs inactive`

    if (anthropic) {
      try {
        const context = [
          atRisk.map(c => `Trial at risk: ${c.orgName} (day ${c.daysOld}, 0 referrals, ${c.trialDaysLeft}d left)`).join('\n'),
          expiringSoon.map(c => `Trial expiring: ${c.orgName} in ${c.trialDaysLeft} days`).join('\n'),
          highChurnRisk.map(c => `Paying customer silent: ${c.orgName} (${c.daysSinceLastReferral}d since last referral)`).join('\n'),
          blockers.filter(b => b.urgent).map(b => `Urgent blocker: ${b.item} — ${b.note}`).join('\n'),
        ].filter(Boolean).join('\n')

        if (context.trim()) {
          const resp = await anthropic.messages.create({
            model:      'claude-haiku-4-5',
            max_tokens: 250,
            messages: [{
              role:    'user',
              content: `You are the chief of staff for a healthcare startup. Based on today's signals, give:
1. One sharp headline (max 12 words) summarizing the most important situation
2. Top 3 actions in priority order (one sentence each, specific and actionable)

Signals:
${context}

Format as JSON: { "headline": "...", "topActions": ["...", "...", "..."] }`,
            }],
          })
          const match = resp.content[0]?.text?.match(/\{[\s\S]*\}/)
          if (match) {
            const parsed = JSON.parse(match[0])
            headline   = parsed.headline   ?? headline
            topActions = parsed.topActions ?? []
          }
        }
      } catch { /* non-blocking */ }
    }

    return {
      generatedAt:   now.toISOString(),
      headline,
      topActions,
      trials: {
        total:        trialCustomers.length,
        atRisk,
        engaged,
        expiringSoon,
        all:          trialCustomers,
      },
      paying: {
        total:        seedOrgs.length,
        highChurnRisk,
        all:          payingCustomers,
      },
      platform: {
        totalReferrals,
        recentReferrals,
        totalProviders,
        totalOrgs: allOrgs.length,
      },
      blockers,
    }
  }
}
