/**
 * Partner Simulator — stands in for a payer / clearinghouse (UHC, Availity)
 * so the full Plerous pipeline can be verified end-to-end without live access.
 *
 * Zero dependencies (Node http + crypto). Implements:
 *   POST /oauth/token                              → OAuth2 client-credentials
 *   POST /fhir/r4/Claim/$submit                    → ClaimResponse (Da Vinci PAS)
 *   GET  /fhir/r4/ClaimResponse?identifier=...     → status polling
 *   POST /fhir/r4/CoverageEligibilityRequest/$submit → eligibility
 *   POST /edi/278                                  → X12 278 response (fallback)
 *   GET  /health
 *
 * Scenarios are DETERMINISTIC, keyed by the patient's insurance member ID so
 * tests control outcomes precisely:
 *   APPROVE*      → approved synchronously
 *   DENY*         → denied synchronously
 *   PENDWEBHOOK*  → queued, then approves via async signed webhook callback
 *   PENDPOLL*     → queued, approves on a later status poll
 *   (default)     → approved synchronously
 *
 * Env: PORT (4010), PLEROUS_WEBHOOK_URL, WEBHOOK_SECRET, PEND_DELAY_MS (1500)
 */
import http from 'node:http'
import { createHmac, randomUUID } from 'node:crypto'

const PORT = parseInt(process.env.PORT || '4010')
const PLEROUS_WEBHOOK_URL = process.env.PLEROUS_WEBHOOK_URL || 'http://localhost:3001/v1/auth/webhook/sim'
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'plerous-sim-secret'
const PEND_DELAY_MS = parseInt(process.env.PEND_DELAY_MS || '1500')

// In-memory claim store: authNumber -> { scenario, status, createdAt }
const claims = new Map()

function scenarioFor(memberId = '') {
  const m = memberId.toUpperCase()
  if (m.startsWith('DENY')) return 'deny'
  if (m.startsWith('PENDWEBHOOK')) return 'pend_webhook'
  if (m.startsWith('PENDPOLL')) return 'pend_poll'
  return 'approve'
}

function approvedClaimResponse(authNumber) {
  const end = new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0]
  return {
    resourceType: 'ClaimResponse',
    status: 'active',
    outcome: 'complete',
    preAuthRef: [authNumber],
    preAuthPeriod: { end },
    disposition: 'Prior authorization approved',
  }
}
function deniedClaimResponse(authNumber, reason = 'Medical necessity not established') {
  return {
    resourceType: 'ClaimResponse',
    status: 'active',
    outcome: 'error',
    preAuthRef: [authNumber],
    error: [{ code: { coding: [{ code: 'MNEC' }], text: reason } }],
    disposition: 'Prior authorization denied',
  }
}
function queuedClaimResponse(authNumber) {
  return { resourceType: 'ClaimResponse', status: 'active', outcome: 'queued', preAuthRef: [authNumber], disposition: 'Under review' }
}

function memberIdFromBundle(bundle) {
  const patient = bundle?.entry?.find((e) => e.resource?.resourceType === 'Patient')?.resource
  return patient?.identifier?.[0]?.value || ''
}

function sendWebhook(authNumber, status, reason) {
  const payload = {
    event: 'authorization.decision',
    authorizationNumber: authNumber,
    status, // canonical: APPROVED | DENIED
    expirationDate: status === 'APPROVED' ? new Date(Date.now() + 180 * 86400000).toISOString() : null,
    denialReason: reason || null,
  }
  const body = JSON.stringify(payload)
  const sig = 'sha256=' + createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')
  const url = new URL(PLEROUS_WEBHOOK_URL)
  const mod = url.protocol === 'https:' ? import('node:https') : import('node:http')
  mod.then((h) => {
    const req = h.request(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Plerous-Signature': sig, 'Content-Length': Buffer.byteLength(body) } },
      (res) => { res.resume() },
    )
    req.on('error', (e) => console.warn('[sim] webhook error:', e.message))
    req.write(body)
    req.end()
    console.log(`[sim] webhook → ${authNumber} ${status}`)
  })
}

function eligibilityResponse(memberId) {
  const denied = memberId.toUpperCase().startsWith('INELIGIBLE')
  return {
    resourceType: 'CoverageEligibilityResponse',
    status: 'active',
    outcome: denied ? 'error' : 'complete',
    insurance: [{
      inforce: !denied,
      coverage: { display: 'HMO' },
      item: [
        { category: { coding: [{ code: 'referral' }] }, name: 'Referral required' },
        { category: { coding: [{ code: 'auth' }] }, name: 'Prior auth required' },
      ],
    }],
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
  })
}
function json(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'Content-Type': 'application/fhir+json' })
  res.end(body)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname

  try {
    if (req.method === 'GET' && path === '/health') return json(res, 200, { ok: true, claims: claims.size })

    // OAuth2 token
    if (req.method === 'POST' && path === '/oauth/token') {
      await readBody(req)
      return json(res, 200, { access_token: 'sim-' + randomUUID(), token_type: 'Bearer', expires_in: 3600 })
    }

    // Claim submit
    if (req.method === 'POST' && path === '/fhir/r4/Claim/$submit') {
      const raw = await readBody(req)
      const bundle = raw ? JSON.parse(raw) : {}
      const memberId = memberIdFromBundle(bundle)
      const scenario = scenarioFor(memberId)
      const authNumber = 'SIM-' + randomUUID().slice(0, 8).toUpperCase()
      claims.set(authNumber, { scenario, status: 'queued', createdAt: Date.now(), memberId })

      if (scenario === 'approve') {
        claims.get(authNumber).status = 'complete'
        return json(res, 200, approvedClaimResponse(authNumber))
      }
      if (scenario === 'deny') {
        claims.get(authNumber).status = 'error'
        return json(res, 200, deniedClaimResponse(authNumber))
      }
      // pending scenarios → respond queued now
      if (scenario === 'pend_webhook') {
        setTimeout(() => {
          claims.get(authNumber).status = 'complete'
          sendWebhook(authNumber, 'APPROVED')
        }, PEND_DELAY_MS)
      } else if (scenario === 'pend_poll') {
        setTimeout(() => { claims.get(authNumber).status = 'complete' }, PEND_DELAY_MS)
      }
      return json(res, 200, queuedClaimResponse(authNumber))
    }

    // Status polling
    if (req.method === 'GET' && path === '/fhir/r4/ClaimResponse') {
      const id = url.searchParams.get('identifier')
      const claim = claims.get(id)
      if (!claim) return json(res, 200, { resourceType: 'Bundle', type: 'searchset', entry: [] })
      let cr
      if (claim.status === 'complete') cr = approvedClaimResponse(id)
      else if (claim.status === 'error') cr = deniedClaimResponse(id)
      else cr = queuedClaimResponse(id)
      return json(res, 200, { resourceType: 'Bundle', type: 'searchset', entry: [{ resource: cr }] })
    }

    // Eligibility
    if (req.method === 'POST' && path === '/fhir/r4/CoverageEligibilityRequest/$submit') {
      const raw = await readBody(req)
      const reqres = raw ? JSON.parse(raw) : {}
      const memberId = reqres?.patient?.identifier?.value || ''
      return json(res, 200, eligibilityResponse(memberId))
    }

    // X12 278 (EDI fallback) — return JSON for convenience
    if (req.method === 'POST' && path === '/edi/278') {
      const raw = await readBody(req)
      const m = raw.match(/NM1\*IL\*1\*[^*]*\*[^*]*\*[^*]*\*[^*]*\*[^*]*\*MI\*([^~*]+)/)
      const memberId = m?.[1] || ''
      const scenario = scenarioFor(memberId)
      const authNumber = 'SIM-278-' + randomUUID().slice(0, 6).toUpperCase()
      return json(res, 200, {
        status: scenario === 'deny' ? 'DENIED' : 'APPROVED',
        authNumber,
        denialReason: scenario === 'deny' ? 'Not certified' : null,
      })
    }

    json(res, 404, { error: 'not_found', path })
  } catch (err) {
    json(res, 500, { error: err.message })
  }
})

server.listen(PORT, () => {
  console.log(`🏥 Payer simulator listening on :${PORT}`)
  console.log(`   webhook target: ${PLEROUS_WEBHOOK_URL}`)
})

export { server }
