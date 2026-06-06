/**
 * Optum GraphQL adapter (Real Pre-Service Eligibility + Prior Auth/Referral Actions).
 *
 * Optum exposes two proprietary GraphQL endpoints — not FHIR Da Vinci PAS.
 * This adapter implements the same interface as fhir-pas.adapter.js so the
 * PayerGateway can route to it transparently via apiType = 'optum_graphql'.
 *
 * Endpoints (sandbox):
 *   Eligibility : POST https://sandbox-apigw.optum.com/oihub/eligibility/v1/pre-service/member
 *   Referral    : POST https://sandbox-apigw.optum.com/oihub/patient/auth/referral/v1
 *   Token       : POST https://sandbox-apigw.optum.com/apip/auth/v2/token
 *
 * Mock responses are triggered by sending the header { environment: 'sandbox' }.
 * Live sandbox data requires a real provider TIN associated with the account.
 */
import axios from 'axios'
import { v4 as uuidv4 } from 'uuid'
import { authHeader, invalidateToken } from '../oauth-client.js'

const TIMEOUT = 15000
const OPTUM_PAYER_ID = '87726' // Optum/UHC trading partner service ID

// ── GraphQL documents ─────────────────────────────────────────────────────────

const SUBMIT_REFERRAL_MUTATION = `
  mutation SubmitReferral($referralSubmitInput: ReferralSubmitInput!) {
    submitReferral(referralSubmitInput: $referralSubmitInput) {
      referralId
      referralStatus
      payer { id name messages }
      decisions {
        decisionType certificationAction reviewDecisionReason
        startDate endDate
        referralQuantity { quantity qualifier qualifierDesc remaining }
      }
      rejectionReasons {
        rejectionLevel reasonDescription rejectionCode
        followUpAction rejectionReason validRequestIndicator
      }
    }
  }
`

const SEARCH_REFERRALS_QUERY = `
  query SearchReferrals($referralSearchInput: ReferralSearchInput!) {
    searchReferrals(referralSearchInput: $referralSearchInput) {
      referrals {
        referralId referralStatus referralStatusCode
        service { startDate endDate }
        decisions {
          decisionType certificationAction reviewDecisionReason
          startDate endDate
          referralQuantity { quantity qualifier qualifierDesc remaining }
        }
        rejectionResponse
      }
    }
  }
`

const SEARCH_PRIOR_AUTHS_QUERY = `
  query SearchPriorAuths($priorAuthSearchInput: PriorAuthSearchInput!) {
    searchPriorAuths(priorAuthSearchInput: $priorAuthSearchInput) {
      caseSummary {
        serviceReferenceNumber memberID caseStatus overallCoverageStatus
        serviceDates placeOfService serviceSetting
      }
    }
  }
`

const CHECK_ELIGIBILITY_QUERY = `
  query CheckEligibility($input: EligibilityInput!) {
    checkEligibility(input: $input) {
      eligibility {
        eligibilityInfo {
          trnId
          member {
            memberId firstName lastName dateOfBirth gender relationshipCode
          }
        }
        providerNetwork { status tier speciality }
        serviceLevels {
          family {
            networkStatus
            services {
              service serviceCode status
              planAmount remainingAmount metYearToDateAmount
              message {
                coPay { messages }
                deductible { messages }
              }
            }
          }
        }
      }
    }
  }
`

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build request headers. providerTaxId is required by Optum for live calls. */
async function buildHeaders(payer, providerTaxId) {
  const auth = await authHeader(payer)
  return {
    ...auth,
    'Content-Type': 'application/json',
    'x-optum-consumer-correlation-id': uuidv4(),
    ...(providerTaxId ? { providerTaxId } : {}),
    // Trigger mock responses in sandbox; omit for live sandbox data.
    ...(process.env.NODE_ENV !== 'production' ? { environment: 'sandbox' } : {}),
  }
}

/** Base URL from payer row (fhirBaseUrl stores the Optum apigw base). */
function baseUrl(payer) {
  return (payer.fhirBaseUrl || 'https://sandbox-apigw.optum.com').replace(/\/$/, '')
}

async function gqlPost(url, headers, query, variables, operationName) {
  return axios.post(url, { query, variables, ...(operationName ? { operationName } : {}) }, { headers, timeout: TIMEOUT })
}

/** Normalise Optum referralStatus → Plerous ReferralStatus vocabulary. */
function normalizeReferralStatus(optumStatus) {
  const s = (optumStatus || '').toUpperCase()
  if (s === 'APPROVED') return 'APPROVED'
  if (s === 'REJECTED') return 'DENIED'
  if (s === 'PENDING' || s === 'IN_REVIEW') return 'IN_REVIEW'
  return 'PENDING'
}

/** Map Optum caseStatus/overallCoverageStatus → Plerous status. */
function normalizePriorAuthStatus(caseStatus, overallCoverage) {
  const cs = (caseStatus || '').toLowerCase()
  const oc = (overallCoverage || '').toLowerCase()
  if (oc.includes('approved') || oc.includes('covered')) return 'APPROVED'
  if (oc.includes('denied') || oc.includes('not covered')) return 'DENIED'
  if (cs === 'open') return 'IN_REVIEW'
  return 'PENDING'
}

// ── public adapter API ────────────────────────────────────────────────────────

/**
 * Submit a referral / prior-auth request to Optum.
 * Maps Plerous { auth, referral, patient, provider, organization } → ReferralSubmitInput.
 */
export async function submitAuth({ auth, payer, referral, patient, provider, organization }) {
  const taxId = organization?.taxId || provider?.organization?.taxId || ''
  const headers = await buildHeaders(payer, taxId).catch(async (err) => {
    if (err.response?.status === 401) await invalidateToken(payer.id)
    throw err
  })

  const serviceDate = referral.urgency === 'STAT'
    ? new Date().toISOString().split('T')[0]
    : (auth.requestedStartDate || new Date().toISOString().split('T')[0])

  const variables = {
    referralSubmitInput: {
      payerId: payer.tradingPartnerServiceId || OPTUM_PAYER_ID,
      requestingProvider: {
        npi: provider?.npi || '',
        taxId,
        firstName: provider?.firstName || '',
        lastOrOrgName: provider?.lastName || organization?.name || '',
        specialityCode: referral.specialty || '',
        contactName: `${provider?.firstName || ''} ${provider?.lastName || ''}`.trim(),
        phoneNumber: provider?.phone || organization?.phone || '',
      },
      servicingProvider: {
        npi: referral.receivingProvider?.npi || '',
        taxId: referral.receivingOrg?.taxId || '',
        firstName: referral.receivingProvider?.firstName || '',
        lastOrOrgName: referral.receivingProvider?.lastName || referral.receivingOrg?.name || '',
        specialityCode: referral.specialty || '',
      },
      patient: {
        id: patient.insuranceMemberId || '',
        firstName: patient.firstName,
        lastName: patient.lastName,
        dateOfBirth: patient.dateOfBirth instanceof Date
          ? patient.dateOfBirth.toISOString().split('T')[0]
          : patient.dateOfBirth,
        groupNumber: patient.insuranceGroupNumber || '',
      },
      service: {
        diagnosisCodes: referral.diagnosisCodes || [],
        referralQuantity: { quantity: 1, qualifier: 'VS' },
        startDate: serviceDate,
        endDate: serviceDate,
        comment: referral.reason || referral.clinicalNotes || '',
      },
    },
  }

  const res = await gqlPost(
    `${baseUrl(payer)}/oihub/patient/auth/referral/v1`,
    headers,
    SUBMIT_REFERRAL_MUTATION,
    variables,
    'SubmitReferral',
  ).catch(async (err) => {
    if (err.response?.status === 401) await invalidateToken(payer.id)
    throw err
  })

  const result = res.data?.data?.submitReferral
  if (!result) throw new Error(`Optum submitReferral: unexpected response — ${JSON.stringify(res.data)}`)

  const status = normalizeReferralStatus(result.referralStatus)
  const rejection = result.rejectionReasons?.[0]

  return {
    status,
    authNumber: result.referralId || null,
    expiresAt: result.decisions?.[0]?.endDate ? new Date(result.decisions[0].endDate) : null,
    denialReason: rejection
      ? `${rejection.rejectionCode}: ${rejection.reasonDescription}`
      : result.payer?.messages?.join('; ') || null,
    pending: !['APPROVED', 'DENIED'].includes(status),
    raw: result,
  }
}

/**
 * Poll Optum for the current status of a submitted referral / prior-auth.
 * Uses auth.authNumber (referralId) or falls back to prior-auth search.
 */
export async function getAuthStatus({ auth, payer }) {
  const taxId = '' // status checks don't require providerTaxId in headers
  const headers = await buildHeaders(payer, taxId)

  // Try referral status first (most common path)
  if (auth.authNumber?.startsWith('REF')) {
    const variables = {
      referralSearchInput: {
        referralId: auth.authNumber,
        payerId: payer.tradingPartnerServiceId || OPTUM_PAYER_ID,
      },
    }

    const res = await gqlPost(
      `${baseUrl(payer)}/oihub/patient/auth/referral/v1`,
      headers,
      SEARCH_REFERRALS_QUERY,
      variables,
    ).catch(async (err) => {
      if (err.response?.status === 401) await invalidateToken(payer.id)
      throw err
    })

    const referrals = res.data?.data?.searchReferrals?.referrals || []
    const r = referrals[0]
    if (r) {
      const status = normalizeReferralStatus(r.referralStatus)
      return {
        status,
        authNumber: r.referralId,
        pending: !['APPROVED', 'DENIED'].includes(status),
        raw: r,
      }
    }
  }

  // Fall back to prior-auth case search
  const variables = {
    priorAuthSearchInput: {
      serviceReferenceNumber: auth.authNumber,
      payerId: payer.tradingPartnerServiceId || OPTUM_PAYER_ID,
    },
  }

  const res = await gqlPost(
    `${baseUrl(payer)}/oihub/patient/auth/referral/v1`,
    headers,
    SEARCH_PRIOR_AUTHS_QUERY,
    variables,
  ).catch(async (err) => {
    if (err.response?.status === 401) await invalidateToken(payer.id)
    throw err
  })

  const cases = res.data?.data?.searchPriorAuths?.caseSummary || []
  const c = cases[0]
  if (!c) return { status: auth.status, pending: true }

  const status = normalizePriorAuthStatus(c.caseStatus, c.overallCoverageStatus)
  return {
    status,
    authNumber: c.serviceReferenceNumber || auth.authNumber,
    pending: !['APPROVED', 'DENIED'].includes(status),
    raw: c,
  }
}

/**
 * Check member eligibility via the Optum Real Pre-Service Eligibility API.
 * Returns a normalized coverage object matching the shape the rest of Plerous expects.
 */
export async function checkEligibility({ payer, memberId, serviceDate, patient, provider }) {
  const taxId = provider?.organization?.taxId || ''
  const headers = await buildHeaders(payer, taxId)

  const today = new Date().toISOString().split('T')[0]
  const svcDate = serviceDate || today

  const variables = {
    input: {
      memberId: memberId || patient?.insuranceMemberId || '',
      firstName: patient?.firstName || '',
      lastName: patient?.lastName || '',
      groupNumber: patient?.insuranceGroupNumber || '',
      dateOfBirth: patient?.dateOfBirth instanceof Date
        ? patient.dateOfBirth.toISOString().split('T')[0]
        : (patient?.dateOfBirth || ''),
      serviceStartDate: svcDate,
      serviceEndDate: svcDate,
      payerId: payer.tradingPartnerServiceId || OPTUM_PAYER_ID,
      providerNPI: provider?.npi || '',
      providerFirstName: provider?.firstName || '',
      providerLastName: provider?.lastName || '',
      trnId: uuidv4(),
    },
  }

  const res = await gqlPost(
    `${baseUrl(payer)}/oihub/eligibility/v1/pre-service/member`,
    headers,
    CHECK_ELIGIBILITY_QUERY,
    variables,
  ).catch(async (err) => {
    if (err.response?.status === 401) await invalidateToken(payer.id)
    throw err
  })

  return parseEligibilityResponse(res.data)
}

/**
 * Optum does not expose a direct appeal submission endpoint in the current API.
 * We resubmit as a new referral with the appeal rationale in the comment field.
 */
export async function submitAppeal({ auth, payer, referral, patient, provider, organization, appealText }) {
  const enrichedReferral = {
    ...referral,
    reason: `APPEAL of ${auth.authNumber}: ${appealText}`,
    clinicalNotes: appealText,
  }
  return submitAuth({ auth, payer, referral: enrichedReferral, patient, provider, organization })
}

// ── response parsers ──────────────────────────────────────────────────────────

function parseEligibilityResponse(data) {
  if (data?.errors?.length) {
    return { eligible: false, coverageActive: false, raw: data }
  }

  const eligibilities = data?.data?.checkEligibility?.eligibility || []
  const first = eligibilities[0]
  if (!first) return { eligible: false, coverageActive: false, raw: data }

  const member = first.eligibilityInfo?.member
  const network = first.providerNetwork
  const services = first.serviceLevels?.family || []

  // Active if we got a member record back
  const coverageActive = !!member?.memberId

  // Network status
  const networkStatus = (network?.status || '').toLowerCase()
  const inNetwork = networkStatus.includes('in network') || networkStatus === 'in_network'

  // Find copay/deductible hints
  const allServices = services.flatMap((f) => f.services || [])
  const referralSvc = allServices.find((s) =>
    (s.service || '').toLowerCase().includes('referral') ||
    (s.serviceCode || '') === '71',
  )

  return {
    eligible: coverageActive,
    coverageActive,
    planType: null,
    inNetwork,
    networkTier: network?.tier || null,
    requiresReferral: !!referralSvc,
    requiresPriorAuth: !!allServices.find((s) => (s.service || '').toLowerCase().includes('prior auth')),
    raw: data?.data?.checkEligibility,
  }
}
