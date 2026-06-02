/**
 * Domain Event Bus — the backbone that decouples the referral state machine
 * from the reactive subsystems (Intelligence, Growth, Sentinel, Notifications).
 *
 * Design:
 *   - emitDomainEvent(type, payload) appends to the append-only ReferralEvent
 *     log (the replayable source of truth = the moat), then fans the event out
 *     to subscribers — durably via a BullMQ queue, or inline when EVENTS_SYNC=1
 *     (used by the E2E suite for determinism).
 *   - Subscribers register with on(type, handler). type "*" matches every event.
 *
 * Why event-sourced: every referral generates data that makes the next one
 * smarter. The log is cheap to write now and compounds into the intelligence
 * graph (specialist performance, routing, benchmarking) later.
 */
import { Queue, Worker } from 'bullmq'
import { prisma } from '../db/client.js'
import { config } from '../config/index.js'

const QUEUE_NAME = 'domain-events'
const INLINE = process.env.EVENTS_SYNC === '1'

/** @type {{ type: string, name: string, handler: (e:any)=>Promise<void> }[]} */
const subscribers = []

/** Register a subscriber. `type` may be a specific event type or "*" for all. */
export function on(type, name, handler) {
  subscribers.push({ type, name, handler })
}

/** Run every matching subscriber; isolate failures so one can't break others. */
export async function dispatchEvent(evt) {
  for (const sub of subscribers) {
    if (sub.type !== '*' && sub.type !== evt.type) continue
    try {
      await sub.handler(evt)
    } catch (err) {
      console.warn(`[events] subscriber ${sub.name} failed on ${evt.type}: ${err.message}`)
    }
  }
}

// Durable queue (only used when not inline)
let queue = null
function getQueue() {
  if (!queue) queue = new Queue(QUEUE_NAME, { connection: { url: config.redis.url } })
  return queue
}

/**
 * Emit a domain event: persist to the append-only log, then dispatch.
 * @param {string} type  e.g. "referral.delivered", "referral.party.off_network"
 * @param {object} payload  must include referralId/tenantOrgId where relevant
 */
export async function emitDomainEvent(type, payload = {}) {
  const evt = { type, payload, at: new Date().toISOString() }

  // 1. Append-only source of truth (best-effort; never blocks the caller's flow)
  await prisma.referralEvent.create({
    data: {
      referralId: payload.referralId ?? null,
      type,
      payload,
      tenantOrgId: payload.tenantOrgId ?? null,
    },
  }).catch((e) => console.warn(`[events] log append failed for ${type}: ${e.message}`))

  // 2. Fan out
  if (INLINE) {
    await dispatchEvent(evt)
  } else {
    await getQueue().add('event', evt, { removeOnComplete: 1000, removeOnFail: 1000 })
      .catch((e) => console.warn(`[events] enqueue failed for ${type}: ${e.message}`))
  }
  return evt
}

// Async dispatcher worker (skipped in inline mode)
if (!INLINE) {
  new Worker(QUEUE_NAME, async (job) => dispatchEvent(job.data), {
    connection: { url: config.redis.url },
    concurrency: 5,
  }).on('failed', (job, err) => console.error(`[events] dispatch job ${job?.id} failed: ${err.message}`))
}
