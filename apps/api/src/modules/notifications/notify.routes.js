import { authenticate } from '../../middleware/auth.middleware.js'
import { NotifyService } from './notify.service.js'

const svc = new NotifyService()

export default async function notifyRoutes(app) {
  app.post('/patient', {
    preHandler: [authenticate],
    schema: {
      tags: ['Notifications'],
      summary: 'Send SMS or email to patient',
      body: {
        type: 'object',
        required: ['referralId', 'channel', 'message'],
        properties: {
          referralId: { type: 'string' },
          channel:    { type: 'string', enum: ['SMS', 'EMAIL'] },
          message:    { type: 'string' },
          subject:    { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { referralId, channel, message, subject } = req.body
    // Fetch patient contact from referral
    const { prisma } = await import('../../db/client.js')
    const referral = await prisma.referral.findUnique({ where: { id: referralId }, include: { patient: true } })
    if (!referral) return reply.code(404).send({ success: false, error: 'Referral not found' })

    let result
    if (channel === 'SMS') {
      result = await svc.sms(referral.patient.phone, message, referralId, 'REFERRAL_CREATED')
    } else {
      result = await svc.email(referral.patient.email, subject || 'Update on your referral', message, referralId, 'REFERRAL_CREATED')
    }
    reply.send({ success: true, data: result })
  })

  app.get('/history/:referralId', {
    preHandler: [authenticate],
    schema: { tags: ['Notifications'], summary: 'Get notification history for a referral' },
  }, async (req, reply) => {
    const history = await svc.getHistory(req.params.referralId)
    reply.send({ success: true, data: history })
  })
}
