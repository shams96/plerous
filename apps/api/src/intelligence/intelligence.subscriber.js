/**
 * Intelligence subscriber — the moat. Turns domain events into de-identified,
 * network-wide specialist performance stats (ProviderStat). NO patient data —
 * counts + timing only — so it is safe to learn across all tenants. Payer
 * denial intelligence already lives in PolicyRule; this adds the specialist
 * dimension (responsiveness, schedule rate) that nothing else captures.
 *
 * Every event makes the next referral's routing/prediction smarter.
 */
import { prisma } from '../db/client.js'

async function bumpProviderStat(npi, { specialty, state } = {}, deltas = {}) {
  if (!npi) return
  const inc = {}
  for (const [k, v] of Object.entries(deltas)) inc[k] = { increment: v }
  await prisma.providerStat.upsert({
    where: { npi },
    update: { ...inc, ...(specialty ? { specialty } : {}), ...(state ? { state } : {}) },
    create: {
      npi,
      specialty: specialty ?? null,
      state: state ?? null,
      referralsReceived: deltas.referralsReceived ?? 0,
      acknowledged: deltas.acknowledged ?? 0,
      scheduled: deltas.scheduled ?? 0,
      completed: deltas.completed ?? 0,
      ackTimeSumMs: deltas.ackTimeSumMs ?? 0,
      ackTimeCount: deltas.ackTimeCount ?? 0,
    },
  }).catch((e) => console.warn(`[intelligence] providerStat ${npi} failed: ${e.message}`))
}

export async function handleEvent(evt) {
  const p = evt.payload || {}
  switch (evt.type) {
    case 'referral.delivered':
      await bumpProviderStat(p.specialistNpi, p, { referralsReceived: 1 })
      break
    case 'referral.acknowledged':
      await bumpProviderStat(p.specialistNpi, p, {
        acknowledged: 1,
        ...(p.ackMs ? { ackTimeSumMs: p.ackMs, ackTimeCount: 1 } : {}),
      })
      break
    case 'referral.scheduled':
      await bumpProviderStat(p.specialistNpi, p, { scheduled: 1 })
      break
    case 'referral.completed':
      await bumpProviderStat(p.specialistNpi, p, { completed: 1 })
      break
    default:
      break
  }
}
