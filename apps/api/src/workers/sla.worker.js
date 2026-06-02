/**
 * SLA / Expiry Worker
 *
 * Closes the one automated time-based gap the Sentinel didn't cover: prior
 * authorizations that lapse. Runs hourly. Flips APPROVED auths past their
 * expiresAt to EXPIRED and moves the linked referral to EXPIRED unless it has
 * already progressed (SCHEDULED/COMPLETED).
 *
 * runSla() is exported so the E2E suite can drive a cycle deterministically.
 */
import { Worker, Queue } from 'bullmq'
import { prisma } from '../db/client.js'
import { config } from '../config/index.js'

const QUEUE_NAME = 'sla'
const INTERVAL_MS = 60 * 60 * 1000 // hourly
const PROGRESSED = ['SCHEDULED', 'COMPLETED', 'CANCELLED']

export async function runSla() {
  const now = new Date()
  const expired = await prisma.priorAuthorization.findMany({
    where: { status: 'APPROVED', expiresAt: { lt: now } },
    include: { referrals: true },
    take: 200,
  })

  let authsExpired = 0
  let referralsExpired = 0

  for (const auth of expired) {
    await prisma.priorAuthorization.update({ where: { id: auth.id }, data: { status: 'EXPIRED' } })
    authsExpired++

    for (const ref of auth.referrals) {
      if (PROGRESSED.includes(ref.status)) continue
      await prisma.referral.update({
        where: { id: ref.id },
        data: {
          status: 'EXPIRED',
          statusHistory: { push: { status: 'EXPIRED', timestamp: now.toISOString(), userId: 'sla', note: 'Authorization expired before scheduling' } },
        },
      })
      referralsExpired++
    }
  }

  return { authsExpired, referralsExpired }
}

const slaQueue = new Queue(QUEUE_NAME, { connection: { url: config.redis.url } })

const worker = new Worker(QUEUE_NAME, async (job) => {
  if (job.name !== 'scan') return
  return runSla()
}, { connection: { url: config.redis.url }, concurrency: 1 })

worker.on('failed', (job, err) => console.error(`[SLAWorker] Scan ${job?.id} failed:`, err.message))

export async function startSla() {
  try {
    await slaQueue.add('scan', {}, { repeat: { every: INTERVAL_MS }, jobId: 'sla-recurring' })
    console.log('⏳ SLA/expiry worker started — scanning hourly')
  } catch (err) {
    console.warn('[SLAWorker] Could not start (Redis unavailable?):', err.message)
  }
}
