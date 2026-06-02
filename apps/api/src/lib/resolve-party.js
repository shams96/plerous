/**
 * Party resolution — the on/off-network axis of the whole referral matrix.
 * Answers "who is the receiving specialist and are they in Plerous?" so the
 * DeliveryGateway knows HOW to reach them and the Growth loop knows whether
 * they're a prospect.
 */
import { prisma } from '../db/client.js'

/**
 * Resolve the receiving party for a referral.
 * @returns {Promise<{
 *   onNetwork: boolean,
 *   provider: object|null,
 *   org: object|null,
 *   npi: string|null,
 *   name: string|null,
 *   specialty: string|null,
 *   fax: string|null,
 *   state: string|null,
 * }>}
 */
export async function resolveReceivingParty(referral) {
  // 1. On-network receiving provider (strongest signal)
  if (referral.receivingProviderId) {
    const provider = await prisma.provider.findUnique({
      where: { id: referral.receivingProviderId },
      include: { organization: true },
    })
    if (provider) {
      return {
        onNetwork: true,
        provider,
        org: provider.organization ?? null,
        npi: provider.npi,
        name: `${provider.firstName} ${provider.lastName}`,
        specialty: provider.specialty,
        fax: provider.organization?.faxNumber ?? null,
        state: provider.licenseState ?? provider.organization?.address?.state ?? null,
      }
    }
  }

  // 2. On-network receiving org
  if (referral.receivingOrgId) {
    const org = await prisma.organization.findUnique({ where: { id: referral.receivingOrgId } })
    if (org) {
      return {
        onNetwork: true, provider: null, org,
        npi: org.npi, name: org.name, specialty: referral.targetSpecialty ?? null,
        fax: org.faxNumber ?? null, state: org.address?.state ?? null,
      }
    }
  }

  // 3. Target NPI given — could be on-network (registered) or off-network
  if (referral.targetNpi) {
    const provider = await prisma.provider.findUnique({ where: { npi: referral.targetNpi } }).catch(() => null)
    const org = provider ? null : await prisma.organization.findUnique({ where: { npi: referral.targetNpi } }).catch(() => null)
    const onNetwork = !!(provider || org)
    return {
      onNetwork,
      provider: provider ?? null,
      org: org ?? null,
      npi: referral.targetNpi,
      name: referral.targetName ?? (provider ? `${provider.firstName} ${provider.lastName}` : org?.name) ?? null,
      specialty: referral.targetSpecialty ?? provider?.specialty ?? null,
      fax: referral.targetFax ?? org?.faxNumber ?? null,
      state: referral.targetState ?? null,
    }
  }

  // 4. Off-network, only loose target info (fax/name)
  return {
    onNetwork: false, provider: null, org: null,
    npi: null, name: referral.targetName ?? null, specialty: referral.targetSpecialty ?? null,
    fax: referral.targetFax ?? null, state: referral.targetState ?? null,
  }
}
