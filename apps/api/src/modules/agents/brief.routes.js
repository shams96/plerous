/**
 * Agent Routes — /v1/agents
 *
 * GET  /v1/agents/brief/coordinator       — Daily brief for logged-in org
 * GET  /v1/agents/brief/founder           — Platform brief (SUPER_ADMIN)
 * GET  /v1/agents/brief/:orgId            — Brief for specific org (SUPER_ADMIN)
 * GET  /v1/agents/prospect/:npi           — Prospect intelligence (SUPER_ADMIN)
 * GET  /v1/agents/engagement              — Customer engagement monitor (SUPER_ADMIN)
 * POST /v1/agents/recovery/run            — Referral recovery actions (SUPER_ADMIN)
 * POST /v1/agents/scheduling/run          — Scheduling completion nudges (SUPER_ADMIN)
 * POST /v1/agents/asset                   — Deal asset generator (SUPER_ADMIN)
 * GET  /v1/agents/revenue-recovery        — Revenue leakage report (auth)
 * GET  /v1/agents/relationships           — Referring relationship intel (auth)
 * GET  /v1/agents/care-gaps               — Care gap detection (auth)
 */

import { authenticate }       from '../../middleware/auth.middleware.js'
import { BriefAgent }         from '../../agents/brief.agent.js'
import { FounderBriefAgent }  from '../../agents/founder-brief.agent.js'
import { ProspectAgent }      from '../../agents/prospect.agent.js'
import { EngagementAgent }    from '../../agents/engagement.agent.js'
import { RecoveryAgent }      from '../../agents/recovery.agent.js'
import { SchedulingAgent }    from '../../agents/scheduling.agent.js'
import { AssetAgent }         from '../../agents/asset.agent.js'
import { RevenueRecoveryAgent } from '../../agents/revenue-recovery.agent.js'
import { RelationshipAgent }  from '../../agents/relationship.agent.js'
import { CareGapAgent }       from '../../agents/care-gap.agent.js'

const brief          = new BriefAgent()
const founderBrief   = new FounderBriefAgent()
const prospect       = new ProspectAgent()
const engagement     = new EngagementAgent()
const recovery       = new RecoveryAgent()
const scheduling     = new SchedulingAgent()
const asset          = new AssetAgent()
const revenueRecovery = new RevenueRecoveryAgent()
const relationship   = new RelationshipAgent()
const careGap        = new CareGapAgent()

const adminOnly = async (req, reply) => {
  if (req.user.role !== 'SUPER_ADMIN') {
    return reply.code(403).send({ success: false, error: 'SUPER_ADMIN required' })
  }
}

export default async function agentRoutes(app) {

  // ── Agent 1: Coordinator Daily Brief ──────────────────────────────────────
  app.get('/brief/coordinator', {
    preHandler: [authenticate],
    schema: { tags: ['Agents'], summary: 'Daily coordinator brief — prioritized actions for today' },
  }, async (req, reply) => {
    const orgId = req.user.organizationId
    if (!orgId) return reply.code(400).send({ success: false, error: 'No organization on this account' })
    reply.send({ success: true, data: await brief.run(orgId) })
  })

  // ── Agent 2: Founder Morning Brief ────────────────────────────────────────
  app.get('/brief/founder', {
    preHandler: [authenticate],
    schema: { tags: ['Agents'], summary: 'Founder morning brief — full platform situational awareness (SUPER_ADMIN)' },
  }, async (req, reply) => {
    await adminOnly(req, reply); if (reply.sent) return
    reply.send({ success: true, data: await founderBrief.run() })
  })

  // ── Admin: brief for any org ───────────────────────────────────────────────
  app.get('/brief/:orgId', {
    preHandler: [authenticate],
    schema: { tags: ['Agents'], summary: 'Admin: daily brief for a specific org (SUPER_ADMIN)' },
  }, async (req, reply) => {
    await adminOnly(req, reply); if (reply.sent) return
    reply.send({ success: true, data: await brief.run(req.params.orgId) })
  })

  // ── Agent 3: Prospect Intelligence ────────────────────────────────────────
  app.get('/prospect/:npi', {
    preHandler: [authenticate],
    schema: { tags: ['Agents'], summary: 'Prospect intelligence — NPI → full outreach brief with economics (SUPER_ADMIN)' },
  }, async (req, reply) => {
    await adminOnly(req, reply); if (reply.sent) return
    const result = await prospect.run(req.params.npi)
    if (result.error) return reply.code(404).send({ success: false, error: result.error })
    reply.send({ success: true, data: result })
  })

  // ── Agent 4: Customer Engagement Monitor ──────────────────────────────────
  app.get('/engagement', {
    preHandler: [authenticate],
    schema: { tags: ['Agents'], summary: 'Customer engagement health — surface at-risk trials and paying customers (SUPER_ADMIN)' },
  }, async (req, reply) => {
    await adminOnly(req, reply); if (reply.sent) return
    reply.send({ success: true, data: await engagement.run() })
  })

  // ── Agent 5: Referral Recovery ────────────────────────────────────────────
  app.post('/recovery/run', {
    preHandler: [authenticate],
    schema: { tags: ['Agents'], summary: 'Run referral recovery — autonomous actions on stalled referrals (SUPER_ADMIN)' },
  }, async (req, reply) => {
    await adminOnly(req, reply); if (reply.sent) return
    reply.send({ success: true, data: await recovery.run() })
  })

  // ── Agent 6: Scheduling Completion ────────────────────────────────────────
  app.post('/scheduling/run', {
    preHandler: [authenticate],
    schema: { tags: ['Agents'], summary: 'Run scheduling completion nudges (SUPER_ADMIN)' },
  }, async (req, reply) => {
    await adminOnly(req, reply); if (reply.sent) return
    reply.send({ success: true, data: await scheduling.run() })
  })

  // ── Agent 7: Deal Asset Generator ─────────────────────────────────────────
  app.post('/asset', {
    preHandler: [authenticate],
    schema: {
      tags: ['Agents'],
      summary: 'Generate custom sales asset — ROI calculator, one-pager, case study (SUPER_ADMIN)',
      body: {
        type: 'object',
        properties: {
          npi:           { type: 'string' },
          assetType:     { type: 'string', enum: ['roi_calculator', 'one_pager', 'case_study'] },
          customContext: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    await adminOnly(req, reply); if (reply.sent) return
    const { npi, assetType = 'roi_calculator', customContext = '' } = req.body ?? {}
    const result = await asset.run({ npi, assetType, customContext })
    if (result.error) return reply.code(400).send({ success: false, error: result.error })
    reply.send({ success: true, data: result })
  })

  // ── Agent 8: Revenue Recovery Report ──────────────────────────────────────
  app.get('/revenue-recovery', {
    preHandler: [authenticate],
    schema: { tags: ['Agents'], summary: 'Revenue leakage report — quantifies leaked revenue for hospital buyers' },
  }, async (req, reply) => {
    const orgId = req.user.role === 'SUPER_ADMIN' ? (req.query.orgId ?? null) : req.user.organizationId
    reply.send({ success: true, data: await revenueRecovery.run(orgId) })
  })

  // ── Agent 9: Referring Relationship Intelligence ───────────────────────────
  app.get('/relationships', {
    preHandler: [authenticate],
    schema: { tags: ['Agents'], summary: 'Referring relationship health — detect declining PCP relationships' },
  }, async (req, reply) => {
    const orgId = req.user.organizationId
    if (!orgId) return reply.code(400).send({ success: false, error: 'No organization on this account' })
    reply.send({ success: true, data: await relationship.run(orgId) })
  })

  // ── Agent 10: Care Gap Detection ──────────────────────────────────────────
  app.get('/care-gaps', {
    preHandler: [authenticate],
    schema: { tags: ['Agents'], summary: 'Care gap detection — find incomplete care actions per patient' },
  }, async (req, reply) => {
    const orgId = req.user.role === 'SUPER_ADMIN' ? (req.query.orgId ?? null) : req.user.organizationId
    reply.send({ success: true, data: await careGap.run(orgId) })
  })
}
