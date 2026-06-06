/**
 * Payer Gateway — the single seam between Plerous and the outside world.
 *
 * Every outbound prior-auth interaction (submit, poll, eligibility, appeal)
 * goes through here. The gateway picks an adapter based on payer.apiType and
 * loads the referral context the adapters need. Adapters make real HTTP calls;
 * point payer.fhirBaseUrl at the simulator now, the UHC/Availity sandbox later.
 */
import { prisma } from '../db/client.js'
import * as fhirPas from './adapters/fhir-pas.adapter.js'
import * as availity from './adapters/availity.adapter.js'
import * as x12 from './adapters/x12-edi.adapter.js'
import * as optumGraphql from './adapters/optum-graphql.adapter.js'

function pickAdapter(payer) {
  const apiType = (payer?.apiType || 'fhir_r4').toLowerCase()
  const name = (payer?.name || '').toLowerCase()
  if (apiType === 'edi_x12') return x12
  if (apiType === 'availity' || name.includes('availity')) return availity
  if (apiType === 'optum_graphql') return optumGraphql
  return fhirPas // fhir_r4 + proprietary default to FHIR PAS
}

/** Load the referral + related resources an adapter needs to build a request. */
async function loadContext(auth) {
  const referralId = auth.referrals?.[0]?.id
  if (!referralId) return null
  return prisma.referral.findUnique({
    where: { id: referralId },
    include: { patient: true, referringProvider: true, sendingOrg: true },
  })
}

export const payerGateway = {
  /**
   * Submit a prior auth to the payer. Returns the adapter's parsed decision
   * ({ status, authNumber, expiresAt, denialReason, fhirClaimId, pending }).
   */
  async submitAuth({ auth, payer }) {
    if (!payer?.fhirBaseUrl && !payer?.authEndpoint) {
      // No endpoint configured — bundle staged for manual/EDI submission.
      return { status: 'SUBMITTED', pending: true, staged: true }
    }
    const referral = await loadContext(auth)
    if (!referral) return { status: 'SUBMITTED', pending: true, staged: true }

    const adapter = pickAdapter(payer)
    return adapter.submitAuth({
      auth,
      payer,
      referral,
      patient: referral.patient,
      provider: referral.referringProvider,
      organization: referral.sendingOrg,
    })
  },

  /** Poll the payer for the current status of a submitted auth. */
  async getAuthStatus({ auth, payer }) {
    if (!payer?.fhirBaseUrl && !payer?.authEndpoint) return { status: auth.status, pending: true }
    const adapter = pickAdapter(payer)
    return adapter.getAuthStatus({ auth, payer })
  },

  /** Check member eligibility / coverage. */
  async checkEligibility({ payer, memberId, serviceDate }) {
    if (!payer?.fhirBaseUrl && !payer?.authEndpoint) return { eligible: null, coverageActive: null, staged: true }
    const adapter = pickAdapter(payer)
    return adapter.checkEligibility({ payer, memberId, serviceDate })
  },

  /** Submit an appeal for a denied auth. */
  async submitAppeal({ auth, payer, appealText }) {
    const referral = await loadContext(auth)
    if (!referral) throw new Error('No referral context for appeal')
    const adapter = pickAdapter(payer)
    return adapter.submitAppeal({
      auth,
      payer,
      referral,
      patient: referral.patient,
      provider: referral.referringProvider,
      organization: referral.sendingOrg,
      appealText,
    })
  },
}
