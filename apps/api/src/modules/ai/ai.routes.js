import { authenticate } from '../../middleware/auth.middleware.js'
import { requireRole } from '../../middleware/auth.middleware.js'
import { AIService } from './ai.service.js'
import { recordFeedback, getFeedbackEvents, getWeights, resetWeights } from './training-loop.js'

const svc = new AIService()

export default async function aiRoutes(app) {
  app.post('/risk-score', {
    preHandler: [authenticate],
    schema: {
      tags: ['AI'],
      summary: 'Predict referral failure / leakage risk',
      body: {
        type: 'object',
        required: ['specialty'],
        properties: {
          specialty:        { type: 'string' },
          diagnosisCodes:   { type: 'array', items: { type: 'string' } },
          insurancePlanType:{ type: 'string' },
          patientAge:       { type: 'number' },
          urgency:          { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const result = await svc.scoreReferral(req.body)
    reply.send({ success: true, data: result })
  })

  app.post('/match-provider', {
    preHandler: [authenticate],
    schema: {
      tags: ['AI'],
      summary: 'Match optimal specialist for a referral',
      body: {
        type: 'object',
        required: ['specialty'],
        properties: {
          specialty:       { type: 'string' },
          insurancePlanId: { type: 'string' },
          diagnosisCodes:  { type: 'array', items: { type: 'string' } },
          patientZip:      { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const result = await svc.matchProvider(req.body)
    reply.send({ success: true, data: result })
  })

  app.post('/predict-approval', {
    preHandler: [authenticate],
    schema: {
      tags: ['AI'],
      summary: 'Predict prior authorization approval probability',
      body: {
        type: 'object',
        properties: {
          payerId:        { type: 'string' },
          specialty:      { type: 'string' },
          diagnosisCodes: { type: 'array', items: { type: 'string' } },
          procedureCodes: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  }, async (req, reply) => {
    const result = await svc.predictApproval(req.body)
    reply.send({ success: true, data: result })
  })

  app.post('/generate-appeal', {
    preHandler: [authenticate],
    schema: {
      tags: ['AI'],
      summary: 'Generate AI denial appeal letter (Claude-powered)',
      body: {
        type: 'object',
        required: ['referralId', 'denialReason'],
        properties: {
          referralId:       { type: 'string', format: 'uuid' },
          denialReason:     { type: 'string' },
          denialCode:       { type: 'string' },
          additionalNotes:  { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const result = await svc.generateAppeal(req.body)
    reply.send({ success: true, data: result })
  })

  app.get('/leakage-report', {
    preHandler: [authenticate],
    schema: {
      tags: ['AI'],
      summary: 'Revenue leakage analytics for your organization',
      querystring: {
        type: 'object',
        properties: {
          startDate: { type: 'string' },
          endDate:   { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const now = new Date()
    const startDate = req.query.startDate || new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString()
    const endDate = req.query.endDate || now.toISOString()
    const result = await svc.leakageReport(req.user.organizationId, { startDate, endDate })
    reply.send({
      orgReferralCount: result.summary.total,
      completedReferrals: result.summary.completed,
      leakageRate: result.summary.leakageRate,
      industryAvgLeakage: result.benchmark.industryAverage,
      estimatedAnnualRevenueLost: result.revenue.atRisk * 4,
      topLeakageSpecialties: [],
      referralsByStatus: result.breakdown,
      ...result,
    })
  })

  // ── AI Training Loop ────────────────────────────────────────────────────────

  app.post('/feedback', {
    preHandler: [authenticate],
    schema: {
      tags: ['AI'],
      summary: 'Record human feedback signal to improve risk model',
      body: {
        type: 'object',
        required: ['type', 'payload'],
        properties: {
          type: { type: 'string', enum: ['auth_outcome', 'appeal_outcome', 'manual_override'] },
          payload: { type: 'object' },
        },
      },
    },
  }, async (req, reply) => {
    await recordFeedback({ ...req.body, actorId: req.user.id })
    reply.send({ success: true, message: 'Feedback recorded and model updated' })
  })

  app.get('/model-weights', {
    preHandler: [authenticate, requireRole('SUPER_ADMIN', 'ORG_ADMIN')],
    schema: { tags: ['AI'], summary: 'Get current adaptive risk model weights' },
  }, async (_req, reply) => {
    const weights = await getWeights()
    reply.send({ weights })
  })

  app.get('/model-feedback', {
    preHandler: [authenticate, requireRole('SUPER_ADMIN', 'ORG_ADMIN')],
    schema: { tags: ['AI'], summary: 'Get recent feedback events' },
  }, async (req, reply) => {
    const events = await getFeedbackEvents(parseInt(req.query.limit ?? '50'))
    reply.send({ events, count: events.length })
  })

  app.post('/model-reset', {
    preHandler: [authenticate, requireRole('SUPER_ADMIN')],
    schema: { tags: ['AI'], summary: 'Reset risk model weights to defaults' },
  }, async (req, reply) => {
    const weights = await resetWeights(req.user.id)
    reply.send({ success: true, weights })
  })
}
