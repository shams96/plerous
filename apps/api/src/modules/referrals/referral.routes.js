import { authenticate } from '../../middleware/auth.middleware.js'
import { ReferralService } from './referral.service.js'
import { createReferralBody, scheduleBody, listQuery } from './referral.schema.js'
import { paia } from '../../agents/paia.agent.js'
import { redis } from '../../db/client.js'
import { enforceReferralLimit } from '../../middleware/plan-limits.js'

const svc = new ReferralService()

export default async function referralRoutes(app) {
  app.post('/', {
    preHandler: [authenticate, enforceReferralLimit],
    schema: { tags: ['Referrals'], summary: 'Create referral + AI risk score', body: createReferralBody },
  }, async (req, reply) => {
    const referral = await svc.create(req.body, req.user)
    reply.code(201).send({ success: true, data: referral })
  })

  app.get('/', {
    preHandler: [authenticate],
    schema: { tags: ['Referrals'], summary: 'List referrals for your organization', querystring: listQuery },
  }, async (req, reply) => {
    const result = await svc.list(req.query, req.user)
    reply.send({ success: true, ...result })
  })

  app.get('/:id', {
    preHandler: [authenticate],
    schema: { tags: ['Referrals'], summary: 'Get referral with full timeline' },
  }, async (req, reply) => {
    const referral = await svc._get(req.params.id, req.user)
    if (!referral) return reply.code(404).send({ error: 'Referral not found' })
    reply.send({ success: true, data: referral })
  })

  app.get('/:id/status', {
    preHandler: [authenticate],
    schema: { tags: ['Referrals'], summary: 'Real-time status + live auth check' },
  }, async (req, reply) => {
    const status = await svc.getStatus(req.params.id, req.user)
    reply.send({ success: true, data: status })
  })

  app.post('/:id/submit', {
    preHandler: [authenticate],
    schema: { tags: ['Referrals'], summary: 'Submit referral + trigger prior auth if required' },
  }, async (req, reply) => {
    const result = await svc.submit(req.params.id, req.user)
    reply.send({ success: true, data: result })
  })

  /**
   * POST /v1/referrals/:id/acknowledge
   * Specialist confirms receipt — transitions SUBMITTED → RECEIVED.
   * The "FedEx delivered" scan. Fires patient SMS immediately.
   */
  app.post('/:id/acknowledge', {
    preHandler: [authenticate],
    schema: { tags: ['Referrals'], summary: 'Specialist acknowledges referral receipt (SUBMITTED → RECEIVED)' },
  }, async (req, reply) => {
    const result = await svc.acknowledge(req.params.id, req.user)
    reply.send({ success: true, data: result })
  })

  /**
   * GET /v1/referrals/track/:token
   * Public patient tracking — no authentication required.
   * Returns patient-safe timeline (no PHI beyond first name + specialty).
   */
  app.get('/track/:token', {
    schema: {
      tags: ['Referrals'],
      summary: 'Public patient tracking — no auth required (FedEx-style)',
      params: { type: 'object', properties: { token: { type: 'string' } } },
    },
  }, async (req, reply) => {
    const data = await svc.getByTrackingToken(req.params.token)
    if (!data) return reply.code(404).send({ success: false, error: 'Tracking number not found. Check the number and try again.' })
    reply.send({ success: true, data })
  })

  app.post('/:id/schedule', {
    preHandler: [authenticate],
    schema: { tags: ['Referrals'], summary: 'Confirm appointment + send patient SMS', body: scheduleBody },
  }, async (req, reply) => {
    const result = await svc.schedule(req.params.id, req.body, req.user)
    reply.send({ success: true, data: result })
  })

  app.delete('/:id', {
    preHandler: [authenticate],
    schema: { tags: ['Referrals'], summary: 'Cancel referral' },
  }, async (req, reply) => {
    await svc.cancel(req.params.id, req.body?.reason, req.user)
    reply.send({ success: true, message: 'Referral cancelled' })
  })

  // ── PAIA endpoints ────────────────────────────────────────────────────────

  app.post('/:id/analyze', {
    preHandler: [authenticate],
    schema: { tags: ['PAIA'], summary: 'Run PAIA pre-auth analysis without submitting' },
  }, async (req, reply) => {
    const result = await paia.analyze(req.params.id)
    reply.send({ success: true, data: result })
  })

  app.post('/:id/resolve-and-submit', {
    preHandler: [authenticate],
    schema: {
      tags: ['PAIA'],
      summary: 'Human resolves PAIA window items then submits',
      body: {
        type: 'object',
        properties: {
          resolution: { type: 'string', enum: ['confirmed', 'override'] },
          note: { type: 'string' },
        },
        required: ['resolution'],
      },
    },
  }, async (req, reply) => {
    const { resolution, note } = req.body
    const result = await svc.submit(req.params.id, {
      ...req.user,
      paiaOverride: true,
      paiaResolution: resolution,
      paiaNote: note,
    })
    reply.send({ success: true, data: result })
  })
}

// ── Human Window queue (global, not per-referral) ─────────────────────────
export async function humanWindowRoutes(app) {
  app.get('/paia/human-window', {
    preHandler: [],   // authenticated via parent prefix in server.js
    schema: { tags: ['PAIA'], summary: 'Get all referrals in the PAIA human review queue' },
  }, async (req, reply) => {
    const raw = await redis.lrange('paia:human_window', 0, 49)
    const items = raw.map(r => {
      try { return JSON.parse(r) } catch { return null }
    }).filter(Boolean)
    reply.send({ success: true, data: items, total: items.length })
  })

  app.delete('/paia/human-window/:referralId', {
    preHandler: [],
    schema: { tags: ['PAIA'], summary: 'Remove resolved item from human window queue' },
  }, async (req, reply) => {
    const { referralId } = req.params
    const raw = await redis.lrange('paia:human_window', 0, 99)
    for (const item of raw) {
      try {
        const parsed = JSON.parse(item)
        if (parsed.referralId === referralId) {
          await redis.lrem('paia:human_window', 1, item)
        }
      } catch {}
    }
    reply.send({ success: true })
  })
}
