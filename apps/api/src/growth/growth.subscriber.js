/**
 * Growth subscriber — the distribution engine, wired as an event subscriber
 * (NOT a call inside submit). Whenever Plerous touches an off-network party
 * (we faxed a specialist; we received a fax from a PCP), that party becomes a
 * qualified prospect who already experienced the product. Upserts a Prospect
 * and kicks off ProspectAgent research best-effort.
 */
import { prisma } from '../db/client.js'

export async function handleEvent(evt) {
  if (evt.type !== 'referral.party.off_network') return
  const p = evt.payload || {}
  if (!p.npi && !p.fax) return

  const key = p.npi ?? `fax:${p.fax}`
  // @@unique([npi, source]) — when npi is null we still want one row per fax+source.
  const prospect = await prisma.prospect.upsert({
    where: p.npi ? { npi_source: { npi: p.npi, source: p.source } } : { id: await findByFax(p.fax, p.source) },
    update: { triggerRef: p.referralId, faxNumber: p.fax ?? undefined, name: p.name ?? undefined, specialty: p.specialty ?? undefined, state: p.state ?? undefined },
    create: {
      npi: p.npi ?? null,
      name: p.name ?? null,
      specialty: p.specialty ?? null,
      faxNumber: p.fax ?? null,
      state: p.state ?? null,
      source: p.source ?? 'outbound_referral',
      triggerRef: p.referralId ?? null,
      status: 'new',
    },
  }).catch((e) => { console.warn(`[growth] prospect upsert failed: ${e.message}`); return null })

  // Research the prospect (economics + outreach draft) — best-effort, async.
  if (prospect && p.npi) {
    researchProspect(prospect.id, p.npi).catch(() => {})
  }
}

// Fallback unique resolution for fax-only prospects (no NPI).
async function findByFax(fax, source) {
  const existing = await prisma.prospect.findFirst({ where: { faxNumber: fax, source } }).catch(() => null)
  return existing?.id ?? '00000000-0000-0000-0000-000000000000' // non-matching id → upsert creates
}

async function researchProspect(prospectId, npi) {
  try {
    const { ProspectAgent } = await import('../agents/prospect.agent.js')
    const research = await new ProspectAgent().run(npi)
    await prisma.prospect.update({ where: { id: prospectId }, data: { research, status: 'researched' } })
  } catch { /* non-blocking */ }
}
