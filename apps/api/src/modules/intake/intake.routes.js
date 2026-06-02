/**
 * Intake routes — inbound referrals from outside Plerous.
 * POST /v1/intake/fax  ← a fax provider webhook delivers a received fax.
 * (Provider HMAC verification slots in here like the payer webhook once we pick
 *  a fax vendor; left open for the simulator now.)
 */
import { intakeGateway } from '../../intake/intake-gateway.js'

export default async function intakeRoutes(app) {
  app.post('/fax', {
    schema: {
      tags: ['Intake'],
      summary: 'Ingest an inbound fax referral (off-network PCP → on-network specialist)',
      body: {
        type: 'object',
        required: ['toFax'],
        properties: {
          toFax: { type: 'string' },
          fromFax: { type: 'string' },
          fromName: { type: 'string' },
          fromNpi: { type: 'string' },
          patientFirstName: { type: 'string' },
          patientLastName: { type: 'string' },
          patientDob: { type: 'string' },
          specialty: { type: 'string' },
          reason: { type: 'string' },
          diagnosisCodes: { type: 'array', items: { type: 'string' } },
          procedureCodes: { type: 'array', items: { type: 'string' } },
          clinicalNotes: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const result = await intakeGateway.ingestFax(req.body)
    if (!result.accepted) return reply.code(404).send({ success: false, error: result.reason })
    reply.send({ success: true, data: result })
  })
}
