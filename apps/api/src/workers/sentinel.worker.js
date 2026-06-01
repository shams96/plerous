/**
 * Sentinel Worker
 *
 * Schedules and runs the Sentinel agent every 15 minutes via BullMQ.
 * Also exposes startSentinel() for server.js to call on boot.
 *
 * The repeatable job is idempotent — calling startSentinel() on every
 * boot just upserts the existing job definition. No duplicate runs.
 */
import { Worker, Queue } from 'bullmq'
import { config } from '../config/index.js'
import { runSentinel } from '../agents/sentinel.agent.js'

const QUEUE_NAME = 'sentinel'
const INTERVAL_MS = 15 * 60 * 1000  // 15 minutes

const sentinelQueue = new Queue(QUEUE_NAME, {
  connection: { url: config.redis.url },
})

const worker = new Worker(QUEUE_NAME, async (job) => {
  if (job.name !== 'scan') return
  return runSentinel()
}, {
  connection:  { url: config.redis.url },
  concurrency: 1, // never run two scans at once
})

worker.on('completed', (job, result) => {
  if (result?.alertsFired > 0) {
    console.log(`[SentinelWorker] Scan ${job.id} complete — ${result.alertsFired} alert(s)`)
  }
})

worker.on('failed', (job, err) => {
  console.error(`[SentinelWorker] Scan ${job?.id} failed:`, err.message)
})

/**
 * Register the repeatable job. Safe to call multiple times — BullMQ deduplicates by jobId.
 * Also triggers an immediate first run so we don't wait 15 minutes on boot.
 */
export async function startSentinel() {
  try {
    // Register the recurring job
    await sentinelQueue.add('scan', {}, {
      repeat: { every: INTERVAL_MS },
      jobId:  'sentinel-recurring',
    })

    // Immediate first run (one-off, fired right now)
    await sentinelQueue.add('scan', {}, {
      delay: 5000,  // 5s after boot — let the server fully start first
      jobId: 'sentinel-boot',
      // No repeat — one-off
    })

    console.log('🛡️  Sentinel agent started — scanning every 15 minutes')
  } catch (err) {
    // Non-fatal if Redis is unavailable
    console.warn('[SentinelWorker] Could not start sentinel (Redis unavailable?):', err.message)
  }
}
