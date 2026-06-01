/**
 * EHR Intelligence Registry (EIR)
 *
 * The context-aware integration layer. Before ANY interaction with an EHR,
 * agents call EIR.getProfile() to receive the full context of what they're
 * talking to — data model, quirks, field mappings, auth patterns, capabilities.
 *
 * Three-layer architecture:
 * 1. Pre-trained profiles (known EHRs — instant, no API calls)
 * 2. Live discovery (validates + merges capability statement delta)
 * 3. Human oversight queue (unknown or low-confidence systems)
 */

import axios from 'axios'
import { prisma } from '../db/client.js'
import { redis } from '../db/client.js'
import { config } from '../config/index.js'

// Pre-built EHR knowledge base
import { epicProfile } from './profiles/epic.profile.js'
import { cernerProfile } from './profiles/cerner.profile.js'
import { tebraProfile } from './profiles/tebra.profile.js'
import { drchronoProfile } from './profiles/drchrono.profile.js'
import { athenahealthProfile } from './profiles/athenahealth.profile.js'
import { eclinicalworksProfile } from './profiles/eclinicalworks.profile.js'
import { practicefusionProfile } from './profiles/practicefusion.profile.js'
import { nextgenProfile } from './profiles/nextgen.profile.js'
import { modmedProfile } from './profiles/modmed.profile.js'
import { elationProfile } from './profiles/elation.profile.js'

const REGISTRY = {
  // Enterprise / mid-market
  epic:             epicProfile,
  cerner:           cernerProfile,

  // Small–mid practice
  tebra:            tebraProfile,
  drchrono:         drchronoProfile,
  athenahealth:     athenahealthProfile,
  eclinicalworks:   eclinicalworksProfile,
  ecw:              eclinicalworksProfile,   // common abbreviation alias
  practicefusion:   practicefusionProfile,
  veradigm:         practicefusionProfile,   // Practice Fusion rebranded to Veradigm
  nextgen:          nextgenProfile,
  nextgenhealthcare: nextgenProfile,

  // Specialty-first
  modmed:           modmedProfile,
  ema:              modmedProfile,           // EMA = Electronic Medical Assistant (ModMed product name)
  modernizingmedicine: modmedProfile,

  // Direct Primary Care / FHIR-first
  elation:          elationProfile,
  elationhealth:    elationProfile,
}

const CONFIDENCE_THRESHOLD = config.eir.confidenceThreshold // default 90

export class EIRService {
  /**
   * Primary entry point for all agents.
   * Returns the full EHR context profile for an org's EHR connection.
   * Uses cache → pre-trained registry → live discovery in that order.
   */
  async getProfile(organizationId, fhirBaseUrl) {
    // 1. Redis cache (fast path — most calls land here)
    const cacheKey = `eir:profile:${organizationId}`
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached)

    // 2. DB — do we have a stored connection?
    const connection = await prisma.eHRConnection.findFirst({
      where: { organizationId, isActive: true, ...(fhirBaseUrl && { fhirBaseUrl }) },
    })

    if (connection?.capabilities && connection.confidenceScore >= CONFIDENCE_THRESHOLD) {
      const profile = this._mergeWithRegistry(connection)
      await redis.setex(cacheKey, 3600, JSON.stringify(profile))
      return profile
    }

    // 3. Auto-discovery
    const url = fhirBaseUrl || connection?.fhirBaseUrl
    if (!url) return null

    return this.discover(organizationId, url)
  }

  /**
   * Fingerprint + interrogate a FHIR endpoint to build its context profile.
   * High-confidence results auto-apply. Low-confidence queued for human review.
   */
  async discover(organizationId, fhirBaseUrl) {
    const result = {
      organizationId,
      fhirBaseUrl,
      discoveredAt: new Date(),
      steps: [],
    }

    // Step 1: Fingerprint — match against known EHR signatures
    const fingerprint = await this._fingerprint(fhirBaseUrl)
    result.steps.push({ step: 'fingerprint', result: fingerprint })

    // Step 2: Interrogate — pull live CapabilityStatement
    let capabilityStatement = null
    try {
      const resp = await axios.get(`${fhirBaseUrl}/metadata`, {
        timeout: 10000,
        headers: { Accept: 'application/fhir+json' },
      })
      capabilityStatement = resp.data
      result.steps.push({ step: 'capability_statement', status: 'success' })
    } catch (err) {
      result.steps.push({ step: 'capability_statement', status: 'failed', error: err.message })
    }

    // Step 3: Detect SMART on FHIR config
    let smartConfig = null
    try {
      const resp = await axios.get(`${fhirBaseUrl}/.well-known/smart-configuration`, {
        timeout: 5000,
        headers: { Accept: 'application/json' },
      })
      smartConfig = resp.data
      result.steps.push({ step: 'smart_config', status: 'success' })
    } catch {
      result.steps.push({ step: 'smart_config', status: 'not_supported' })
    }

    // Step 4: Merge pre-trained profile with live data
    const registryProfile = REGISTRY[fingerprint.ehrId] || null
    const confidenceScore = fingerprint.confidence

    const capabilities = {
      ehrId: fingerprint.ehrId,
      ehrName: fingerprint.ehrName,
      fhirVersion: capabilityStatement?.fhirVersion || '4.0.1',
      supportedResources: this._extractResources(capabilityStatement),
      referralResource: registryProfile?.fhir?.referralResource || this._detectReferralResource(capabilityStatement),
      supportsSmartOnFhir: !!smartConfig,
      smartScopes: smartConfig?.scopes_supported || registryProfile?.fhir?.smartScopes || [],
      supportsWebhooks: registryProfile?.fhir?.supportsWebhooks ?? false,
      fieldMappings: registryProfile?.fieldMappings || {},
      quirks: registryProfile?.quirks || [],
      urgencyMap: registryProfile?.urgencyMap || {},
      referralWorkflow: registryProfile?.referralWorkflow || {},
      performance: registryProfile?.performance || { rateLimitPerMin: 60, recommendedConcurrency: 3 },
    }

    // Step 5: Store connection record
    await prisma.eHRConnection.upsert({
      where: { organizationId_fhirBaseUrl: { organizationId, fhirBaseUrl } },
      update: {
        ehrSystemId: fingerprint.ehrId,
        displayName: fingerprint.ehrName,
        capabilities,
        confidenceScore,
        discoveredAt: new Date(),
        lastSyncAt: new Date(),
        syncStatus: confidenceScore >= CONFIDENCE_THRESHOLD ? 'active' : 'pending_review',
      },
      create: {
        organizationId,
        fhirBaseUrl,
        ehrSystemId: fingerprint.ehrId,
        displayName: fingerprint.ehrName,
        apiType: 'fhir_r4',
        capabilities,
        confidenceScore,
        discoveredAt: new Date(),
        lastSyncAt: new Date(),
        syncStatus: confidenceScore >= CONFIDENCE_THRESHOLD ? 'active' : 'pending_review',
      },
    })

    // Step 6: Human oversight for low-confidence
    if (confidenceScore < CONFIDENCE_THRESHOLD) {
      await this._queueForHumanReview({
        organizationId,
        fhirBaseUrl,
        fingerprint,
        confidenceScore,
        capabilityStatement,
        reason: `Confidence ${confidenceScore}% is below threshold ${CONFIDENCE_THRESHOLD}%`,
      })
      return { ...capabilities, status: 'pending_human_review', confidenceScore }
    }

    const profile = { ...capabilities, status: 'active', confidenceScore }

    // Cache for 1 hour
    await redis.setex(`eir:profile:${organizationId}`, 3600, JSON.stringify(profile))

    return profile
  }

  /**
   * Apply EHR-specific field mapping to a Plerous canonical object.
   * Translates Plerous referral data → EHR-specific FHIR resource.
   */
  async translateToEHR(organizationId, referralData) {
    const profile = await this.getProfile(organizationId)
    if (!profile) throw new Error('No EHR profile found for organization')

    const mappings = profile.fieldMappings || {}
    const quirks = profile.quirks || []
    const urgencyMap = profile.urgencyMap || {}
    const workflow = profile.referralWorkflow || {}

    // Apply quirk workarounds pre-translation
    let data = { ...referralData }
    for (const quirk of quirks) {
      data = this._applyQuirk(quirk, data)
    }

    // Build the correct resource type
    const resourceType = profile.referralResource === 'Task' ? 'Task' : 'ServiceRequest'

    const resource = {
      resourceType,
      status: this._translateStatus(data.status, workflow.statusMap),
      priority: urgencyMap[data.urgency] || 'routine',
    }

    // Apply field mappings
    if (resourceType === 'ServiceRequest') {
      resource.code = { coding: [{ system: 'http://nucc.org/provider-taxonomy', display: data.specialty }] }
      resource.reasonCode = (data.diagnosisCodes || []).map(code => ({
        coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code }],
      }))
      resource.note = data.clinicalNotes ? [{ text: data.clinicalNotes }] : undefined
      resource.authoredOn = new Date().toISOString()
    } else if (resourceType === 'Task') {
      // Tebra / Task-based EHRs
      resource.code = { text: data.specialty }
      resource.description = data.clinicalNotes
      resource.reasonCode = (data.diagnosisCodes || []).map(code => ({
        coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code }],
      }))
    }

    return { resource, profile, appliedQuirks: quirks.map(q => q.id) }
  }

  /**
   * Translate EHR FHIR resource back to Plerous canonical format.
   */
  async translateFromEHR(organizationId, fhirResource) {
    const profile = await this.getProfile(organizationId)
    if (!profile) return fhirResource

    const workflow = profile.referralWorkflow || {}
    const statusMap = workflow.statusMap || {}

    return {
      status: statusMap[fhirResource.status] || 'DRAFT',
      specialty: fhirResource.code?.text || fhirResource.code?.coding?.[0]?.display,
      clinicalNotes: fhirResource.note?.[0]?.text || fhirResource.description,
      diagnosisCodes: (fhirResource.reasonCode || []).map(r => r.coding?.[0]?.code).filter(Boolean),
      urgency: this._reverseUrgencyMap(fhirResource.priority, profile.urgencyMap),
      fhirResourceId: fhirResource.id,
      fhirResourceType: fhirResource.resourceType,
    }
  }

  /**
   * List all active EHR connections for an organization.
   */
  async listConnections(organizationId) {
    return prisma.eHRConnection.findMany({
      where: { organizationId, isActive: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * Get pending human review queue (items with confidence < threshold).
   */
  async getPendingReview() {
    return prisma.eHRConnection.findMany({
      where: { syncStatus: 'pending_review' },
      include: { organization: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * Human approves a low-confidence connection.
   * Promotes it to active status and updates the registry.
   */
  async approveConnection(connectionId, userId, fieldMappingOverrides = {}) {
    const conn = await prisma.eHRConnection.update({
      where: { id: connectionId },
      data: {
        syncStatus: 'active',
        confidenceScore: 100,
        capabilities: {
          update: {
            fieldMappings: fieldMappingOverrides,
            humanApprovedAt: new Date().toISOString(),
            humanApprovedBy: userId,
          },
        },
      },
    })

    // Invalidate cache
    await redis.del(`eir:profile:${conn.organizationId}`)

    // Log to audit trail
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'EIR_CONNECTION_APPROVED',
        resource: 'EHRConnection',
        resourceId: connectionId,
        metadata: { fieldMappingOverrides },
      },
    })

    return conn
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  async _fingerprint(fhirBaseUrl) {
    let confidence = 20   // baseline
    let ehrId = 'unknown'
    let ehrName = 'Unknown EHR'

    const url = fhirBaseUrl.toLowerCase()

    // URL pattern matching
    for (const [id, profile] of Object.entries(REGISTRY)) {
      for (const pattern of profile.fingerprints?.urlPatterns || []) {
        if (url.includes(pattern.toLowerCase())) {
          ehrId = id
          ehrName = profile.vendorName
          confidence = Math.min(confidence + 50, 95)
          break
        }
      }
    }

    // Try a quick headers probe
    try {
      const resp = await axios.get(`${fhirBaseUrl}/metadata`, {
        timeout: 8000,
        headers: { Accept: 'application/fhir+json' },
        validateStatus: () => true,
      })

      const headers = resp.headers || {}

      for (const [id, profile] of Object.entries(REGISTRY)) {
        for (const headerKey of profile.fingerprints?.responseHeaders || []) {
          if (headers[headerKey.toLowerCase()]) {
            ehrId = id
            ehrName = profile.vendorName
            confidence = Math.min(confidence + 30, 97)
          }
        }
      }

      // Check FHIR extensions in CapabilityStatement
      const capStatement = resp.data
      if (capStatement?.resourceType === 'CapabilityStatement') {
        const ext = JSON.stringify(capStatement).toLowerCase()
        for (const [id, profile] of Object.entries(REGISTRY)) {
          for (const extUrl of profile.fingerprints?.extensions || []) {
            if (ext.includes(extUrl.toLowerCase())) {
              ehrId = id
              ehrName = profile.vendorName
              confidence = Math.min(confidence + 25, 98)
            }
          }
        }
      }
    } catch {}

    return { ehrId, ehrName, confidence }
  }

  _extractResources(capabilityStatement) {
    if (!capabilityStatement?.rest?.[0]?.resource) return []
    return capabilityStatement.rest[0].resource.map(r => ({
      type: r.type,
      interactions: (r.interaction || []).map(i => i.code),
    }))
  }

  _detectReferralResource(capabilityStatement) {
    if (!capabilityStatement) return 'ServiceRequest'
    const resources = this._extractResources(capabilityStatement).map(r => r.type)
    if (resources.includes('ServiceRequest')) return 'ServiceRequest'
    if (resources.includes('Task')) return 'Task'
    if (resources.includes('ReferralRequest')) return 'ReferralRequest'
    return 'ServiceRequest'
  }

  _mergeWithRegistry(connection) {
    const registry = REGISTRY[connection.ehrSystemId]
    return {
      ...connection.capabilities,
      ...(registry && {
        quirks: registry.quirks,
        fieldMappings: { ...(registry.fieldMappings || {}), ...(connection.capabilities?.fieldMappings || {}) },
        urgencyMap: registry.urgencyMap,
        referralWorkflow: registry.referralWorkflow,
        performance: registry.performance,
      }),
      ehrSystemId: connection.ehrSystemId,
      connectionId: connection.id,
      status: 'active',
    }
  }

  _applyQuirk(quirk, data) {
    const workarounds = {
      normalizeTebraDateFormat: (d) => ({
        ...d,
        // Convert M/D/YYYY to ISO 8601
        createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : d.createdAt,
      }),
      flattenNoteArray: (d) => d,
      alwaysIncludePatientParam: (d) => d,
    }
    const fn = workarounds[quirk.workaround]
    return fn ? fn(data) : data
  }

  _translateStatus(refchainStatus, statusMap) {
    if (!statusMap) return 'active'
    const reversed = Object.fromEntries(Object.entries(statusMap).map(([k, v]) => [v, k]))
    return reversed[refchainStatus] || 'active'
  }

  _reverseUrgencyMap(fhirPriority, urgencyMap) {
    if (!urgencyMap || !fhirPriority) return 'ROUTINE'
    const reversed = Object.fromEntries(Object.entries(urgencyMap).map(([k, v]) => [v, k]))
    return reversed[fhirPriority] || 'ROUTINE'
  }

  async _queueForHumanReview(data) {
    // Store in Redis queue for human oversight dashboard
    await redis.lpush('eir:human_review_queue', JSON.stringify({
      ...data,
      queuedAt: new Date().toISOString(),
    }))
    console.warn(`[EIR] 🔶 Human review required for ${data.fhirBaseUrl} (confidence: ${data.confidenceScore}%)`)
  }
}

export const eir = new EIRService()

// Lightweight export for onboarding — no class instantiation needed
export function inferEHRFromNPI(profile) {
  // Placeholder: after SMART on FHIR connection we fingerprint the actual EHR.
  // Pre-connection, we return specialty-based market share hints (see onboarding.routes.js).
  return null
}
