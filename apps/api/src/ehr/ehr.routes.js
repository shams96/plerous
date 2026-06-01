import crypto from 'crypto'
import axios from 'axios'
import { authenticate, requireRole } from '../middleware/auth.middleware.js'
import { eir } from './eir.service.js'
import { prisma } from '../db/client.js'
import { config } from '../config/index.js'

export default async function ehrRoutes(app) {
  // Discover & profile an EHR endpoint
  app.post('/connect', {
    preHandler: [authenticate],
    schema: {
      tags: ['EHR'],
      summary: 'Connect an EHR — auto-discovers type, capabilities, and quirks',
      body: {
        type: 'object',
        required: ['fhirBaseUrl'],
        properties: {
          fhirBaseUrl: { type: 'string', format: 'uri' },
        },
      },
    },
  }, async (req, reply) => {
    const profile = await eir.discover(req.user.organizationId, req.body.fhirBaseUrl)
    const status = profile.confidenceScore >= 90 ? 201 : 202
    reply.code(status).send({
      success: true,
      data: profile,
      message: profile.status === 'pending_human_review'
        ? `EHR identified with ${profile.confidenceScore}% confidence — queued for human review`
        : `EHR connected: ${profile.ehrName || profile.ehrId}`,
    })
  })

  // Get current EHR profile for org
  app.get('/profile', {
    preHandler: [authenticate],
    schema: { tags: ['EHR'], summary: 'Get EHR context profile for your organization' },
  }, async (req, reply) => {
    const profile = await eir.getProfile(req.user.organizationId)
    if (!profile) return reply.code(404).send({ success: false, error: 'No EHR connected' })
    reply.send({ success: true, data: profile })
  })

  // List all connections
  app.get('/connections', {
    preHandler: [authenticate],
    schema: { tags: ['EHR'], summary: 'List all EHR connections for your organization' },
  }, async (req, reply) => {
    const connections = await eir.listConnections(req.user.organizationId)
    reply.send({ success: true, data: connections })
  })

  // Human review queue (admin only)
  app.get('/review-queue', {
    preHandler: [authenticate, requireRole('SUPER_ADMIN', 'ORG_ADMIN')],
    schema: { tags: ['EHR'], summary: 'Get EHR connections pending human review' },
  }, async (req, reply) => {
    const queue = await eir.getPendingReview()
    reply.send({ success: true, data: queue, count: queue.length })
  })

  // Human approves a connection
  app.post('/approve/:connectionId', {
    preHandler: [authenticate, requireRole('SUPER_ADMIN', 'ORG_ADMIN')],
    schema: {
      tags: ['EHR'],
      summary: 'Approve a low-confidence EHR connection after human review',
      body: {
        type: 'object',
        properties: {
          fieldMappingOverrides: { type: 'object' },
        },
      },
    },
  }, async (req, reply) => {
    const conn = await eir.approveConnection(req.params.connectionId, req.user.id, req.body?.fieldMappingOverrides)
    reply.send({ success: true, data: conn, message: 'EHR connection approved and activated' })
  })

  // ── SMART on FHIR OAuth ────────────────────────────────────────────────────

  /**
   * Step 1: Initiate SMART on FHIR OAuth.
   * Discovers the EHR's authorization server via /.well-known/smart-configuration,
   * generates a CSRF state token, and returns the authorization URL for the client
   * to redirect to.
   */
  app.post('/smart-launch', {
    preHandler: [authenticate],
    schema: {
      tags: ['EHR'],
      summary: 'Initiate SMART on FHIR OAuth — returns authorization URL',
      body: {
        type: 'object',
        required: ['fhirBaseUrl'],
        properties: {
          fhirBaseUrl: { type: 'string', format: 'uri' },
          clientId:    { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { fhirBaseUrl, clientId } = req.body
    const organizationId = req.user.organizationId
    const dashboardBase = config.dashboardUrl || 'http://localhost:3000'

    // Discover SMART configuration
    let smartConfig
    try {
      const { data } = await axios.get(`${fhirBaseUrl.replace(/\/$/, '')}/.well-known/smart-configuration`, {
        timeout: 8000,
        headers: { Accept: 'application/json' },
      })
      smartConfig = data
    } catch {
      // Fallback: try the CapabilityStatement for OAuth endpoints
      try {
        const { data } = await axios.get(`${fhirBaseUrl.replace(/\/$/, '')}/metadata`, {
          timeout: 8000,
          headers: { Accept: 'application/fhir+json' },
        })
        const secExt = data?.rest?.[0]?.security?.extension?.find(
          (e) => e.url === 'http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris',
        )
        const authExt = secExt?.extension?.find((e) => e.url === 'authorize')
        const tokenExt = secExt?.extension?.find((e) => e.url === 'token')
        if (!authExt?.valueUri) throw new Error('No OAuth endpoints found in CapabilityStatement')
        smartConfig = { authorization_endpoint: authExt.valueUri, token_endpoint: tokenExt?.valueUri }
      } catch {
        return reply.code(422).send({ error: 'Cannot discover SMART configuration for this FHIR endpoint' })
      }
    }

    if (!smartConfig?.authorization_endpoint) {
      return reply.code(422).send({ error: 'FHIR server does not support SMART on FHIR' })
    }

    // CSRF state + PKCE code verifier
    const state        = crypto.randomBytes(24).toString('hex')
    const codeVerifier = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
    const effectiveClientId = clientId || config.smart?.defaultClientId || 'refchain_app'

    // Upsert the EHR connection record with pending_oauth status
    await prisma.eHRConnection.upsert({
      where:  { organizationId_fhirBaseUrl: { organizationId, fhirBaseUrl } },
      create: {
        organizationId,
        fhirBaseUrl,
        displayName: fhirBaseUrl,
        ehrSystemId: 'pending',
        apiType:     'fhir_r4',
        syncStatus:  'pending_oauth',
        smartState:     state,
        smartClientId:  effectiveClientId,
        smartTokenUrl:  smartConfig.token_endpoint,
        // Store PKCE verifier temporarily in capabilities JSON
        capabilities: { codeVerifier },
      },
      update: {
        syncStatus:    'pending_oauth',
        smartState:    state,
        smartClientId: effectiveClientId,
        smartTokenUrl: smartConfig.token_endpoint,
        capabilities:  { codeVerifier },
      },
    })

    // Build authorization URL
    const redirectUri = `${dashboardBase}/ehr/callback`
    const scopes = [
      'launch/patient',
      'patient/Patient.read',
      'patient/Condition.read',
      'patient/Observation.read',
      'patient/Coverage.read',
      'offline_access',
    ].join(' ')

    const params = new URLSearchParams({
      response_type:          'code',
      client_id:              effectiveClientId,
      redirect_uri:           redirectUri,
      scope:                  scopes,
      state,
      aud:                    fhirBaseUrl,
      code_challenge:         codeChallenge,
      code_challenge_method:  'S256',
    })

    reply.send({
      success:   true,
      authUrl:   `${smartConfig.authorization_endpoint}?${params.toString()}`,
      state,
    })
  })

  /**
   * Step 2: Exchange authorization code for tokens.
   * Called by the dashboard callback page after the EHR redirects back.
   */
  app.post('/exchange-token', {
    preHandler: [authenticate],
    schema: {
      tags: ['EHR'],
      summary: 'Exchange SMART OAuth code for access + refresh tokens',
      body: {
        type: 'object',
        required: ['code', 'state'],
        properties: {
          code:  { type: 'string' },
          state: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { code, state } = req.body
    const organizationId = req.user.organizationId
    const dashboardBase = config.dashboardUrl || 'http://localhost:3000'

    // Look up the pending connection by state
    const connection = await prisma.eHRConnection.findFirst({
      where: { organizationId, smartState: state },
    })

    if (!connection) {
      return reply.code(400).send({ error: 'Invalid or expired OAuth state. Please restart the connection.' })
    }

    if (!connection.smartTokenUrl) {
      return reply.code(400).send({ error: 'Token endpoint not found. Please restart the connection.' })
    }

    const codeVerifier = connection.capabilities?.codeVerifier
    const redirectUri  = `${dashboardBase}/ehr/callback`

    try {
      const params = new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  redirectUri,
        client_id:     connection.smartClientId,
        ...(codeVerifier && { code_verifier: codeVerifier }),
      })

      const { data: tokens } = await axios.post(connection.smartTokenUrl, params.toString(), {
        timeout: 10000,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })

      if (!tokens.access_token) {
        return reply.code(400).send({ error: 'Token exchange failed — no access token returned' })
      }

      // Compute expiry
      const expiresAt = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null

      // Update the connection with live token data and run EIR discovery
      await prisma.eHRConnection.update({
        where: { id: connection.id },
        data: {
          accessToken:    tokens.access_token,
          refreshToken:   tokens.refresh_token ?? null,
          tokenExpiresAt: expiresAt,
          smartScope:     tokens.scope ?? null,
          smartState:     null, // clear state after successful exchange
          syncStatus:     'active',
          capabilities:   { ...(connection.capabilities || {}), codeVerifier: undefined },
          lastSyncAt:     new Date(),
        },
      })

      // Trigger EIR discovery now that we have auth
      eir.discover(organizationId, connection.fhirBaseUrl).catch(() => {/* fire-and-forget */})

      reply.send({
        success:     true,
        displayName: connection.displayName,
        fhirBaseUrl: connection.fhirBaseUrl,
        scope:       tokens.scope,
        message:     'EHR connected via SMART on FHIR',
      })
    } catch (err) {
      const detail = err.response?.data?.error_description || err.message
      reply.code(502).send({ error: `Token exchange failed: ${detail}` })
    }
  })

  // ── Translate Plerous referral → EHR-specific FHIR resource ────────────────
  app.post('/translate', {
    preHandler: [authenticate],
    schema: {
      tags: ['EHR'],
      summary: 'Translate Plerous referral data to EHR-specific FHIR format',
      body: {
        type: 'object',
        required: ['referralData'],
        properties: {
          referralData: { type: 'object' },
        },
      },
    },
  }, async (req, reply) => {
    const result = await eir.translateToEHR(req.user.organizationId, req.body.referralData)
    reply.send({ success: true, data: result })
  })
}
