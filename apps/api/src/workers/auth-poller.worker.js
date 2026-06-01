/**
 * Auth Poller Worker
 * For EHRs/payers that don't support webhooks, this polls for authorization
 * status updates and syncs them back to Plerous.
 * Runs every 30 seconds for URGENT/STAT, every 5 minutes for ROUTINE.
 */
import { Worker, Queue } from 'bullmq'
import { prisma } from '../db/client.js'
import { redis } from '../db/client.js'
import { config } from '../config/index.js'
import { recordAuthOutcome } from '../agents/paia/feedback/denial-feedback.js'

const pollQueue = new Queue('auth-polling', { connection: { url: config.redis.url } })

const worker = new Worker('auth-polling', async (job) => {
  const { authId, payerId, urgency } = job.data

  const auth = await prisma.priorAuthorization.findUnique({
    where: { id: authId },
    include: { referrals: true },
  })

  if (!auth || ['APPROVED', 'DENIED', 'EXPIRED', 'APPEAL_APPROVED'].includes(auth.status)) {
    // Record outcome if this is the first time we've seen a terminal denial/approval
    if (auth?.status === 'DENIED' || auth?.status === 'APPROVED') {
      recordAuthOutcome({
        procedureCodes: auth.requestedCodes ?? [],
        payerId:        auth.payerId,
        outcome:        auth.status,
      }).catch(() => {})
    }
    return { skipped: true, reason: 'Terminal status reached' }
  }

  // In production: poll payer API for status update
  // For now: log and re-queue if still pending
  console.log(`[AuthPoller] Checking auth ${authId} (${auth.status}) — payer: ${payerId}`)

  // Re-queue for next poll
  const delayMs = ['STAT', 'EMERGENCY'].includes(urgency) ? 30000 : 300000
  await pollQueue.add('poll-auth', { authId, payerId, urgency }, {
    delay: delayMs,
    jobId: `poll-${authId}`,  // deduplicated
  })

  return { polled: true, status: auth.status }
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
