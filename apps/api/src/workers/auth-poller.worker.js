/**
 * Auth Poller Worker
 * For EHRs/payers that don't support webhooks, this polls for authorization
 * status updates and syncs them back to Plerous.
 * Runs every 30 seconds for URGENT/STAT, every 5 minutes for ROUTINE.
 */
import { Worker, Queue } from 'bullmq'
import { prisma } from '../db/client.js'
import { config } from '../config/index.js'
import { payerGateway } from '../payers/payer-gateway.js'

const pollQueue = new Queue('auth-polling', { connection: { url: config.redis.url } })

const TERMINAL = ['APPROVED', 'DENIED', 'EXPIRED', 'APPEAL_APPROVED', 'APPEAL_DENIED', 'PARTIALLY_APPROVED']

/**
 * Run one poll cycle for an auth. Exported so the E2E suite can drive a poll
 * deterministically without waiting on BullMQ timers.
 * Returns { terminal, status } so callers know whether to stop.
 */
export async function pollAuthOnce(authId) {
  const auth = await prisma.priorAuthorization.findUnique({
    where: { id: authId },
    include: { referrals: true, payer: true },
  })
  if (!auth) return { terminal: true, status: 'NOT_FOUND' }
  if (TERMINAL.includes(auth.status)) return { terminal: true, status: auth.status }

  // Real status query against the payer (simulator now, sandbox later).
  let result
  try {
    result = await payerGateway.getAuthStatus({ auth, payer: auth.payer })
  } catch (err) {
    console.warn(`[AuthPoller] status query failed for ${authId}: ${err.message}`)
    return { terminal: false, status: auth.status }
  }

  if (result && ['APPROVED', 'DENIED', 'PARTIALLY_APPROVED'].includes(result.status)) {
    const { PriorAuthService } = await import('../modules/auth/auth.service.js')
    await new PriorAuthService()._applyDecision(authId, {
      status: result.status,
      authNumber: result.authNumber,
      expiresAt: result.expiresAt,
      denialReason: result.denialReason,
      denialCode: result.denialCode,
      rawResponse: result.rawResponse,
    })
    return { terminal: true, status: result.status }
  }

  return { terminal: false, status: result?.status || auth.status }
}

const worker = new Worker('auth-polling', async (job) => {
  const { authId, payerId, urgency } = job.data

  const { terminal, status } = await pollAuthOnce(authId)
  if (terminal) return { skipped: true, status }

  // Still pending — re-queue for the next poll.
  const delayMs = ['STAT', 'EMERGENCY'].includes(urgency) ? 30000 : 300000
  await pollQueue.add('poll-auth', { authId, payerId, urgency }, {
    delay: delayMs,
    jobId: `poll-${authId}`, // deduplicated
  })

  return { polled: true, status }
}, {
  connection: { url: config.redis.url },
  concurrency: 10,
})

worker.on('failed', (job, err) => {
  console.error(`[AuthPoller] Job ${job?.id} failed:`, err.message)
})

// Schedule an auth for polling
export async function scheduleAuthPoll(authId, payerId, urgency) {
  const delayMs = ['STAT', 'EMERGENCY'].includes(urgency) ? 10000 : 60000
  await pollQueue.add('poll-auth', { authId, payerId, urgency }, {
    delay: delayMs,
    jobId: `poll-${authId}`,
    attempts: 100,  // Keep polling until terminal state
    backoff: { type: 'fixed', delay: 30000 },
  })
}

console.log('🔄 Auth poller worker started')
