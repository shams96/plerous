import { authenticate } from '../../middleware/auth.middleware.js'
import { PriorAuthService } from './auth.service.js'

const svc = new PriorAuthService()

export default async function priorAuthRoutes(app) {
  app.post('/validate', {
    preHandler: [authenticate],
    schema: {
      tags: ['Prior Authorization'],
      summary: 'Real-time eligibility check',
      body: {
        type: 'object',
        required: ['memberId', 'payerId'],
        properties: {
          memberId:    { type: 'string' },
          payerId:     { type: 'string' },
          serviceDate: { type: 'string', format: 'date' },
        },
      },
    },
  }, async (req, reply) => {
    const result = await svc.validateEligibility(req.body)
    reply.send({ success: true, data: result })
  })

  app.get('/:id/status', {
    preHandler: [authenticate],
    schema: { tags: ['Prior Authorization'], summary: 'Get live auth status (Redis-cached)' },
  }, async (req, reply) => {
    const status = await svc.getStatus(req.params.id)
    reply.send({ success: true, data: status })
  })

  app.get('/requirements/:planId', {
    preHandler: [authenticate],
    schema: { tags: ['Prior Authorization'], summary: 'HMO-specific auth requirements for a plan' },
  }, async (req, reply) => {
    const req2 = await svc.getRequirements(req.params.planId)
    reply.send({ success: true, data: req2 })
  })

  // Inbound payer webhook — no auth required (validated by signature)
  app.post('/webhook/:payer', {
    schema: {
      tags: ['Prior Authorization'],
      summary: 'Inbound payer authorization decision webhook',
    },
  }, async (req, reply) => {
    const result = await svc.processWebhook(req.params.payer, req.body)
    reply.send({ success: true, data: result })
  })
}
