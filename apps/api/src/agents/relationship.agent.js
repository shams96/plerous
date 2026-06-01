/**
 * Referring Relationship Intelligence — Agent 9
 *
 * Churn prevention for specialist customers.
 * Monitors referral flow per sending practice, detects sudden drops,
 * correlates with bad experiences, generates re-engagement suggestions.
 */

import { prisma }  from '../db/client.js'
import Anthropic   from '@anthropic-ai/sdk'
import { config }  from '../config/index.js'

const anthropic = config.anthropic?.apiKey
  ? new Anthropic({ apiKey: config.anthropic.apiKey })
  : null

export class RelationshipAgent {
  async run(receivingOrgId) {
    const now        = new Date()
    const thisMonth  = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonth  = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const twoMonths  = new Date(now.getFullYear(), now.getMonth() - 2, 1)

    // Get all sending orgs that have ever referred to this org
    const allReferrals = await prisma.referral.findMany({
      where:   { receivingOrgId },
      include: {
        sendingOrg: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Group by sending org
    const senderMap = {}
    for (const r of allReferrals) {
      const sid = r.sendingOrgId
      if (!senderMap[sid]) {
        senderMap[sid] = {
          orgId:    sid,
          orgName:  r.sendingOrg?.name ?? 'Unknown Practice',
          email:    r.sendingOrg?.email,
          phone:    r.sendingOrg?.phone,
          referrals: [],
        }
      }
      senderMap[sid].referrals.push(r)
    }

    const relationships = []

    for (const [, sender] of Object.entries(senderMap)) {
      const refs = sender.referrals
      const thisMonthCount  = refs.filter(r => new Date(r.createdAt) >= thisMonth).length
      const lastMonthCount  = refs.filter(r => new Date(r.createdAt) >= lastMonth && new Date(r.createdAt) < thisMonth).length
      const twoMonthCount   = refs.filter(r => new Date(r.createdAt) >= twoMonths && new Date(r.createdAt) < lastMonth).length

      const avgMonthly = (lastMonthCount + twoMonthCount) / 2
      const dropPct    = avgMonthly > 0
        ? Math.round(((avgMonthly - thisMonthCount) / avgMonthly) * 100)
        : 0

      // Find last referral's final status — was there a bad experience?
      const lastRef       = refs[0]
      const badStatuses   = ['CANCELLED', 'EXPIRED', 'AUTH_DENIED', 'NO_SHOW']
      const lastWasBad    = lastRef && badStatuses.includes(lastRef.status)
      const cancelledLast3 = refs.slice(0, 3).filter(r => badStatuses.includes(r.status)).length

      let healthSignal = 'healthy'
      let alertReason  = null

      if (thisMonthCount === 0 && lastMonthCount >= 3) {
        healthSignal = 'at_risk'
        alertReason  = `Sent ${lastMonthCount} referrals last month — 0 so far this month`
      } else if (dropPct >= 50 && avgMonthly >= 2) {
        healthSignal = 'declining'
        alertReason  = `Volume dropped ${dropPct}% (avg ${avgMonthly.toFixed(1)}/month → ${thisMonthCount} this month)`
      } else if (lastWasBad || cancelledLast3 >= 2) {
        healthSignal = 'at_risk'
        alertReason  = `Last referral ended in ${lastRef?.status} — possible negative experience`
      }

      let draftOutreach = null
      if (healthSignal !== 'healthy' && anthropic) {
        try {
          const resp = await anthropic.messages.create({
            model:      'claude-haiku-4-5',
            max_tokens: 150,
            messages: [{
              role:    'user',
              content: `Write a warm, brief re-engagement email (2-3 sentences) from a specialist practice to a referring PCP practice that has reduced referral volume.

From: specialist practice
To: ${sender.orgName}
Situation: ${alertReason}
Tone: collegial, not salesy. Express genuine interest in the relationship.

Return only the email body text, no subject line.`,
            }],
          })
          draftOutreach = resp.content[0]?.text?.trim() ?? null
        } catch { /* non-blocking */ }
      }

      relationships.push({
        orgId:          sender.orgId,
        orgName:        sender.orgName,
        email:          sender.email,
        phone:          sender.phone,
        healthSignal,
        alertReason,
        metrics: {
          total:          refs.length,
          thisMonth:      thisMonthCount,
          lastMonth:      lastMonthCount,
          twoMonthsAgo:   twoMonthCount,
          avgMonthly:     parseFloat(avgMonthly.toFixed(1)),
          dropPercent:    dropPct,
        },
        lastReferral: lastRef ? {
          id:        lastRef.id,
          status:    lastRef.status,
          specialty: lastRef.specialty,
          createdAt: lastRef.createdAt,
          wasBad:    lastWasBad,
        } : null,
        draftOutreach,
      })
    }

    // Sort: at_risk first, then declining, then healthy; within each by volume drop
    relationships.sort((a, b) => {
      const order = { at_risk: 0, declining: 1, healthy: 2 }
      if (order[a.healthSignal] !== order[b.healthSignal]) {
        return order[a.healthSignal] - order[b.healthSignal]
      }
      return b.metrics.dropPercent - a.metrics.dropPercent
    })

    const atRisk   = relationships.filter(r => r.healthSignal === 'at_risk')
    const declining = relationships.filter(r => r.healthSignal === 'declining')
    const healthy  = relationships.filter(r => r.healthSignal === 'healthy')

    return {
      generatedAt:     now.toISOString(),
      receivingOrgId,
      summary: {
        totalRelationships: relationships.length,
        atRisk:             atRisk.length,
        declining:          declining.length,
        healthy:            healthy.length,
      },
      atRisk,
      declining,
      healthy,
    }
  }
}
