/**
 * FHIR Da Vinci PAS adapter.
 *
 * Speaks the HL7 Da Vinci Prior Authorization Support IG — the standard UHC's
 * sandbox and most modern payers expose. Every call is a real outbound HTTP
 * request; point payer.fhirBaseUrl at the partner simulator now, or at the
 * UHC/Availity sandbox once credentials land. Same code path.
 */
import axios from 'axios'
import { buildPASBundle, parseClaimResponse } from '../../fhir/davinci-pas.js'
import { authHeader, invalidateToken } from '../oauth-client.js'

const FHIR_HEADERS = { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json' }
const TIMEOUT = 12000

async function headersFor(payer) {
  return { ...FHIR_HEADERS, ...(await authHeader(payer)) }
}

/**
 * Submit a prior-auth request as a Da Vinci PAS Claim bundle.
 * Returns the parsed decision (may be terminal synchronously, or PENDING/IN_REVIEW
 * if the payer will respond asynchronously via webhook/poll).
 */
export async function submitAuth({ auth, payer, referral, patient, provider, organization }) {
  const bundle = buildPASBundle({ referral, patient, payer, provider, organization })

  const res = await axios
    .post(`${payer.fhirBaseUrl}/Claim/$submit`, bundle, { headers: await headersFor(payer), timeout: TIMEOUT })
    .catch(async (err) => {
      if (err.response?.status === 401) {
        await invalidateToken(payer.id)
      }
      throw err
    })

  // The $submit operation returns either a ClaimResponse or a Bundle wrapping one.
  const claimResponse = extractClaimResponse(res.data)
  const parsed = parseClaimResponse(claimResponse)

  return {
    ...parsed,
    fhirClaimId: bundle.id,
    // A pending decision means we must poll / await webhook.
    pending: !['APPROVED', 'DENIED', 'PARTIALLY_APPROVED'].includes(parsed.status),
  }
}

/**
 * Poll a payer for the current status of a submitted auth.
 * Looks up the ClaimResponse by the stored fhirClaimId / authNumber.
 */
export async function getAuthStatus({ auth, payer }) {
  const ref = auth.authNumber || auth.fhirClaimId
  if (!ref) return { status: auth.status, pending: true }

  const res = await axios
    .get(`${payer.fhirBaseUrl}/ClaimResponse?identifier=${encodeURIComponent(ref)}`, {
      headers: await headersFor(payer),
      timeout: TIMEOUT,
    })
    .catch(async (err) => {
      if (err.response?.status === 401) await invalidateToken(payer.id)
      throw err
    })

  const claimResponse = extractClaimResponse(res.data)
  const parsed = parseClaimResponse(claimResponse)
  return { ...parsed, pending: !['APPROVED', 'DENIED', 'PARTIALLY_APPROVED'].includes(parsed.status) }
}

/**
 * Check member eligibility via CoverageEligibilityRequest/$submit.
 * Returns a normalized coverage object.
 */
export async function checkEligibility({ payer, memberId, serviceDate }) {
  const request = {
    resourceType: 'CoverageEligibilityRequest',
    status: 'active',
    purpose: ['benefits', 'validation'],
    patient: { identifier: { value: memberId } },
    created: new Date().toISOString(),
    insurer: { display: payer.name, identifier: { value: payer.tradingPartnerServiceId } },
    servicedDate: serviceDate || new Date().toISOString().split('T')[0],
  }

  const res = await axios
    .post(`${payer.fhirBaseUrl}/CoverageEligibilityRequest/$submit`, request, {
      headers: await headersFor(payer),
      timeout: TIMEOUT,
    })
    .catch(async (err) => {
      if (err.response?.status === 401) await invalidateToken(payer.id)
      throw err
    })

  return parseEligibilityResponse(res.data)
}

/**
 * Submit an appeal for a denied auth as a follow-up Claim with related reference.
 */
export async function submitAppeal({ auth, payer, referral, patient, provider, organization, appealText }) {
  const bundle = buildPASBundle({ referral, patient, payer, provider, organization })
  // Mark as an appeal follow-up of the original authorization.
  const claimEntry = bundle.entry.find((e) => e.resource?.resourceType === 'Claim')
  if (claimEntry) {
    claimEntry.resource.related = [
      { claim: { identifier: { value: auth.authNumber || auth.fhirClaimId } }, relationship: { coding: [{ code: 'prior' }] } },
    ]
    claimEntry.resource.supportingInfo = [
      ...(claimEntry.resource.supportingInfo || []),
      {
        sequence: 99,
        category: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claiminformationcategory', code: 'addinfo' }] },
        valueString: `APPEAL: ${appealText}`,
      },
    ]
  }

  const res = await axios.post(`${payer.fhirBaseUrl}/Claim/$submit`, bundle, {
    headers: await headersFor(payer),
    timeout: TIMEOUT,
  })
  const parsed = parseClaimResponse(extractClaimResponse(res.data))
  return { ...parsed, fhirClaimId: bundle.id, pending: !['APPROVED', 'DENIED'].includes(parsed.status) }
}

// ── helpers ──────────────────────────────────────────────────────────────────
function extractClaimResponse(data) {
  if (!data) return null
  if (data.resourceType === 'ClaimResponse') return data
  if (data.resourceType === 'Bundle') {
    const entry = data.entry?.find((e) => e.resource?.resourceType === 'ClaimResponse')
    return entry?.resource || null
  }
  return data
}

function parseEligibilityResponse(data) {
  const resp = data?.resourceType === 'Bundle'
    ? data.entry?.find((e) => e.resource?.resourceType === 'CoverageEligibilityResponse')?.resource
    : data

  if (!resp || resp.resourceType !== 'CoverageEligibilityResponse') {
    return { eligible: false, coverageActive: false, raw: data }
  }

  const inforce = resp.insurance?.[0]?.inforce !== false
  const item = resp.insurance?.[0]?.item || []
  const findBenefit = (code) => item.find((i) => i.category?.coding?.some((c) => c.code === code))

  return {
    eligible: resp.outcome === 'complete' && inforce,
    coverageActive: inforce,
    planType: resp.insurance?.[0]?.coverage?.display || null,
    requiresReferral: !!findBenefit('referral'),
    requiresPriorAuth: !!findBenefit('auth'),
    raw: resp,
  }
}
