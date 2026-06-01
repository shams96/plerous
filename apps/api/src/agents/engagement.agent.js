/**
 * Customer Engagement Monitor — Agent 4
 *
 * Prevents silent churn. Scores every active customer on engagement
 * and surfaces at-risk accounts with drafted re-engagement messages.
 *
 * Signals monitored:
 *   - Trial customers: referrals submitted vs. days elapsed
 *   - Trial expiring soon with low activity
 *   - Paying customers: days since last referral / last login
 *   - Orgs that onboarded but never submitted a referral
 */

import { prisma }   from '../db/client.js'
import Anthropic    from '@anthropic-ai/sdk'
import { config }   from '../config/index.js'

const anthropic = config.anthropic?.apiKey
  ? new Anthropic({ apiKey: config.anthropic.apiKey })
  : null

const isTrialOrg = (npi) => npi?.includes('-org')

const THRESHOLDS = {
  trialAtRiskDays:       3,   // no referrals after 3 days = at risk
  trialExpiringDays:     3,   // trial ends in ≤3 days = urgent
  payingInactiveDays:    7,   // no referral in 7 days = churn signal
  neverSubmittedDays:    2,   // onboarded but no referral in 2 days
}

export class EngagementAgent {
  async run() {
    const now     = new Date()
    const weekAgo = new Date(now - 7 * 86400000)

    const orgs = await prisma.organization.findMany({
      where:   { isActive: true },
      include: {
        providers: { select: { id: true, specialty: true } },
        apiKeys:   { where: { isActive: true }, select: { id: true } },
        referralsSent: {
          orderBy: { createdAt: 'desc' },
          take:    5,
          select:  { id: true, status: true, createdAt: true, updatedAt: true },
        },
      },
    })

    const results = { urgent: [], atRisk: [], healthy: [], summary: {} }

    for (const org of orgs) {
      const daysOld            = (now - new Date(org.createdAt)) / 86400000
      const isTrial            = isTrialOrg(org.npi)
      const trialDaysLeft      = isTrial ? Math.max(0, 14 - daysOld) : null
      const referrals          = org.referralsSent
      const lastReferral       = referrals[0]
      const daysSinceReferral  = lastReferral
        ? (now - new Date(lastReferral.createdAt)) / 86400000
        : null
      const totalReferrals     = referrals.length
      const weekReferrals      = referrals.filter(r =>
        new Date(r.createdAt) >= weekAgo
      ).length

      let riskLevel  = 'healthy'
      let riskReason = null

      if (isTrial) {
        if (totalReferrals === 0 && daysOld >= THRESHOLDS.neverSubmittedDays) {
          riskLevel  = trialDaysLeft <= THRESHOLDS.trialExpiringDays ? 'urgent' : 'atRisk'
          riskReason = `Onboarded ${Math.round(daysOld)} days ago — never submitted a referral`
        } else if (weekReferrals === 0 && daysOld >= THRESHOLDS.trialAtRiskDays) {
          riskLevel  = trialDaysLeft <= THRESHOLDS.trialExpiringDays ? 'urgent' : 'atRisk'
          riskReason = `${Math.round(daysOld)} days in — 0 referrals this week`
        } else if (trialDaysLeft !== null && trialDaysLeft <= THRESHOLDS.trialExpiringDays && weekReferrals < 2) {
          riskLevel  = 'urgent'
          riskReason = `Trial expires in ${Math.round(trialDaysLeft)} days — low engagement`
        }
      } else {
        // Paying / seed org
        if (daysSinceReferral !== null && daysSinceReferral >= THRESHOLDS.payingInactiveDays) {
          riskLevel  = daysSinceReferral >= 14 ? 'urgent' : 'atRisk'
          riskReason = `No referral in ${Math.round(daysSinceReferral)} days`
        }
      }

      const record = {
        orgId:            org.id,
        orgName:          org.name,
        npi:              org.npi,
        isTrial,
        trialDaysLeft,
        daysOld:          Math.round(daysOld),
        totalReferrals,
        weekReferrals,
        daysSinceReferral: daysSinceReferral !== null ? Math.round(daysSinceReferral) : null,
        providerCount:    org.providers.length,
        primarySpecialty: org.providers[0]?.specialty ?? 'Unknown',
        riskLevel,
        riskReason,
        contactEmail:     org.email,
      }

      if (riskLevel === 'urgent')  results.urgent.push(record)
      else if (riskLevel === 'atRisk') results.atRisk.push(record)
      else results.healthy.push(record)
    }

    // ── Generate re-engagement messages for at-risk + urgent ─────────────────
    const needsMessage = [...results.urgent, ...results.atRisk]

    if (anthropic && needsMessage.length > 0) {
      for (const customer of needsMessage) {
        try {
          const resp = await anthropic.messages.create({
            model:      'claude-haiku-4-5',
            max_tokens: 200,
            messages: [{
              role:    'user',
              content: `Write a short, warm re-engagement email for a healthcare practice that signed up for Plerous but hasn't been active.
Tone: peer-to-peer, helpful, not pushy. Max 3 sentences.

Practice: ${customer.orgName}
Specialty: ${customer.primarySpecialty}
Situation: ${customer.riskReason}
Trial days left: ${customer.trialDaysLeft ?? 'N/A (paying customer)'}

Format as JSON: { "subject": "...", "body": "..." }`,
            }],
          })
          const match = resp.content[0]?.text?.match(/\{[\s\S]*\}/)
          if (match) {
            const msg = JSON.parse(match[0])
            customer.draftEmail = msg
          }
        } catch { /* non-blocking */ }
      }
    }

    results.summary = {
      total:    orgs.length,
      urgent:   results.urgent.length,
      atRisk:   results.atRisk.length,
      healthy:  results.healthy.length,
      trials:   orgs.filter(o => isTrialOrg(o.npi)).length,
      paying:   orgs.filter(o => !isTrialOrg(o.npi)).length,
    }

    return results
  }
}
