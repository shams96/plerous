import { createHmac, timingSafeEqual } from 'crypto'
import { authenticate } from '../../middleware/auth.middleware.js'
import { PriorAuthService } from './auth.service.js'

const svc = new PriorAuthService()

/** Constant-time HMAC check of an inbound payer webhook against the raw body. */
function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.PAYER_WEBHOOK_SECRET
  if (!secret) return true // no secret configured → verification disabled (dev)
  if (!signatureHeader) return false
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody || '').digest('hex')
  const a = Buffer.from(signatureHeader)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export default async function priorAuthRoutes(app) {
  // Keep the raw JSON body (encapsulated to this plugin only) so we can verify
  // payer webhook HMAC signatures over the exact received bytes.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    req.rawBody = body
    try {
      done(null, body ? JSON.parse(body) : {})
    } catch (err) {
      err.statusCode = 400
      done(err)
    }
  })

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

  // Inbound payer webhook — no JWT; authenticated by HMAC signature instead.
  app.post('/webhook/:payer', {
    schema: {
      tags: ['Prior Authorization'],
      summary: 'Inbound payer authorization decision webhook',
    },
  }, async (req, reply) => {
    if (!verifyWebhookSignature(req.rawBody, req.headers['x-plerous-signature'])) {
      return reply.code(401).send({ success: false, error: 'invalid_signature' })
    }
    const result = await svc.processWebhook(req.params.payer, req.body)
    reply.send({ success: true, data: result })
  })
}
