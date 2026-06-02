/**
 * X12 EDI adapter — ASC X12N 278 (prior auth request/response).
 *
 * NOTE: This is a FUNCTIONAL, structured 278 generator/parser for payers that
 * only accept EDI — NOT a certified, fully spec-compliant X12 implementation.
 * It produces a valid-shaped 278 transaction set and parses a 278 response for
 * the certification action code + auth number. FHIR PAS is the primary path;
 * this is the fallback. Full X12 compliance (HIPAA companion guides, 275
 * attachments, SNIP levels) is a tracked fast-follow.
 */
import axios from 'axios'
import { authHeader, invalidateToken } from '../oauth-client.js'

const TIMEOUT = 12000
const SEG = '~'
const ELEM = '*'

/** Build a minimal X12 278 request transaction set as a string. */
function build278({ auth, payer, referral, patient, provider }) {
  const ctrl = Date.now().toString().slice(-9)
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const seg = (...parts) => parts.join(ELEM) + SEG

  const lines = [
    seg('ST', '278', ctrl, '005010X217'),
    seg('BHT', '0007', '13', ctrl, today, today.slice(0, 4)),
    // UMO (payer)
    seg('HL', '1', '', '20', '1'),
    seg('NM1', 'X3', '2', payer.name, '', '', '', '', 'PI', payer.tradingPartnerServiceId),
    // Requester (provider)
    seg('HL', '2', '1', '21', '1'),
    seg('NM1', '1P', '1', provider?.lastName || '', provider?.firstName || '', '', '', '', 'XX', provider?.npi || ''),
    // Subscriber (patient)
    seg('HL', '3', '2', '22', '0'),
    seg('NM1', 'IL', '1', patient?.lastName || '', patient?.firstName || '', '', '', '', 'MI', patient?.insuranceMemberId || ''),
    // Service request
    seg('UM', 'SC', 'I', '3', referral?.specialty || ''),
    ...(referral?.procedureCodes || []).map((c) => seg('SV1', `HC:${c}`, '0', 'UN', '1')),
    ...(referral?.diagnosisCodes || []).map((d, i) => seg('HI', `ABK:${d}`)),
    seg('SE', String(8 + (referral?.procedureCodes?.length || 0) + (referral?.diagnosisCodes?.length || 0)), ctrl),
  ]
  return lines.join('')
}

/** Parse a 278 response string for action code + auth number. */
function parse278Response(x12) {
  if (typeof x12 !== 'string') {
    // Simulator may return JSON for convenience.
    if (x12 && typeof x12 === 'object') {
      return {
        status: x12.status || 'IN_REVIEW',
        authNumber: x12.authNumber || null,
        denialReason: x12.denialReason || null,
      }
    }
    return { status: 'IN_REVIEW', authNumber: null }
  }
  // HCR segment carries the action code: A1/A2=certified, A3/A4=not certified, A6=pended
  const hcr = x12.split(SEG).find((s) => s.startsWith('HCR' + ELEM))
  const action = hcr?.split(ELEM)?.[1]
  const authNumber = hcr?.split(ELEM)?.[2] || null
  const map = { A1: 'APPROVED', A2: 'APPROVED', A3: 'DENIED', A4: 'DENIED', A6: 'IN_REVIEW' }
  return { status: map[action] || 'IN_REVIEW', authNumber, denialReason: action?.startsWith('A3') ? 'Not certified' : null }
}

async function ediHeaders(payer) {
  return { 'Content-Type': 'application/edi-x12', Accept: 'application/edi-x12, application/json', ...(await authHeader(payer)) }
}

export async function submitAuth({ auth, payer, referral, patient, provider }) {
  const x12 = build278({ auth, payer, referral, patient, provider })
  const res = await axios
    .post(`${payer.fhirBaseUrl || payer.authEndpoint}/edi/278`, x12, { headers: await ediHeaders(payer), timeout: TIMEOUT })
    .catch(async (err) => {
      if (err.response?.status === 401) await invalidateToken(payer.id)
      throw err
    })
  const parsed = parse278Response(res.data)
  return { ...parsed, pending: !['APPROVED', 'DENIED'].includes(parsed.status) }
}

export async function getAuthStatus({ auth, payer }) {
  const res = await axios.get(`${payer.fhirBaseUrl || payer.authEndpoint}/edi/278/${auth.authNumber || auth.id}`, {
    headers: await ediHeaders(payer),
    timeout: TIMEOUT,
  })
  const parsed = parse278Response(res.data)
  return { ...parsed, pending: !['APPROVED', 'DENIED'].includes(parsed.status) }
}

// Eligibility (270/271) and appeals over EDI are not yet implemented — fall back
// to "unknown" so the gateway can decide. Tracked with the X12 fast-follow.
export async function checkEligibility() {
  return { eligible: null, coverageActive: null, unsupported: 'x12_eligibility_270' }
}
export async function submitAppeal() {
  throw new Error('X12 appeal (278 reconsideration) not yet implemented')
}
