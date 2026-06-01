/**
 * Da Vinci PAS (Prior Authorization Support) — FHIR R4 Implementation
 *
 * Implements the HL7 Da Vinci PAS Implementation Guide:
 * http://hl7.org/fhir/us/davinci-pas/
 *
 * Used for CMS-0057-F compliance — payers must accept FHIR-based PA by Jan 2027.
 *
 * Key resources:
 *   - Claim (type=preauthorization) — the PA request
 *   - ClaimResponse — the payer's decision
 *   - Bundle (type=collection) — wraps the full PA transaction
 *   - Task — tracks PA request status (payer-specific polling)
 */

import { v4 as uuid } from 'uuid'

// ── Build Da Vinci PAS Bundle ─────────────────────────────────────────────────

export function buildPASBundle({ referral, patient, payer, provider, organization }) {
  const bundleId = uuid()
  const claimId = uuid()
  const patientRef = `Patient/${patient.id}`
  const providerRef = `Practitioner/${provider.id}`

  const bundle = {
    resourceType: 'Bundle',
    id: bundleId,
    meta: {
      profile: ['http://hl7.org/fhir/us/davinci-pas/StructureDefinition/profile-pas-request-bundle'],
    },
    type: 'collection',
    timestamp: new Date().toISOString(),
    entry: [
      // 1. Claim resource (the PA request)
      {
        fullUrl: `urn:uuid:${claimId}`,
        resource: buildClaim({ claimId, referral, patient, payer, provider, organization }),
      },
      // 2. Patient
      {
        fullUrl: patientRef,
        resource: buildPatient(patient),
      },
      // 3. Referring provider
      {
        fullUrl: providerRef,
        resource: buildPractitioner(provider),
      },
      // 4. ServiceRequest (the clinical referral)
      {
        fullUrl: `urn:uuid:${referral.id}`,
        resource: buildServiceRequest({ referral, patient, provider }),
      },
    ],
  }

  return bundle
}

// ── Claim (PA Request) ────────────────────────────────────────────────────────

function buildClaim({ claimId, referral, patient, payer, provider, organization }) {
  const items = referral.procedureCodes.map((code, i) => ({
    sequence: i + 1,
    productOrService: {
      coding: [{
        system: 'http://www.ama-assn.org/go/cpt',
        code,
      }],
    },
    servicedPeriod: {
      start: referral.requestedDate
        ? new Date(referral.requestedDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
    },
  }))

  // Add at least one item if no procedure codes
  if (!items.length) {
    items.push({
      sequence: 1,
      productOrService: {
        coding: [{
          system: 'http://snomed.info/sct',
          code: '306206005',
          display: 'Referral to specialist',
        }],
      },
    })
  }

  return {
    resourceType: 'Claim',
    id: claimId,
    meta: {
      profile: ['http://hl7.org/fhir/us/davinci-pas/StructureDefinition/profile-claim'],
    },
    status: 'active',
    type: {
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/claim-type',
        code: 'professional',
      }],
    },
    use: 'preauthorization',
    patient: { reference: `Patient/${patient.id}` },
    created: new Date().toISOString(),
    insurer: {
      display: payer.name,
      identifier: { value: payer.tradingPartnerServiceId },
    },
    provider: { reference: `Practitioner/${provider.id}` },
    priority: {
      coding: [{
        code: referral.urgency === 'STAT' || referral.urgency === 'EMERGENCY'
          ? 'stat'
          : referral.urgency === 'URGENT'
          ? 'urgent'
          : 'normal',
      }],
    },
    supportingInfo: buildSupportingInfo(referral),
    diagnosis: referral.diagnosisCodes.map((code, i) => ({
      sequence: i + 1,
      diagnosisCodeableConcept: {
        coding: [{
          system: 'http://hl7.org/fhir/sid/icd-10-cm',
          code,
        }],
      },
    })),
    item: items,
  }
}

function buildSupportingInfo(referral) {
  const info = [{
    sequence: 1,
    category: {
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/claiminformationcategory',
        code: 'info',
      }],
    },
    valueString: referral.reason,
  }]

  if (referral.clinicalNotes) {
    info.push({
      sequence: 2,
      category: {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/claiminformationcategory',
          code: 'addinfo',
        }],
      },
      valueString: referral.clinicalNotes,
    })
  }

  return info
}

// ── Patient ───────────────────────────────────────────────────────────────────

function buildPatient(patient) {
  return {
    resourceType: 'Patient',
    id: patient.id,
    name: [{
      family: patient.lastName,
      given: [patient.firstName],
    }],
    birthDate: new Date(patient.dateOfBirth).toISOString().split('T')[0],
    gender: patient.gender?.toLowerCase() || 'unknown',
    telecom: patient.phone
      ? [{ system: 'phone', value: patient.phone }]
      : [],
    ...(patient.insuranceMemberId && {
      identifier: [{
        type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MB' }] },
        value: patient.insuranceMemberId,
      }],
    }),
  }
}

// ── Practitioner ──────────────────────────────────────────────────────────────

function buildPractitioner(provider) {
  return {
    resourceType: 'Practitioner',
    id: provider.id,
    identifier: [{
      system: 'http://hl7.org/fhir/sid/us-npi',
      value: provider.npi,
    }],
    name: [{
      family: provider.lastName,
      given: [provider.firstName],
    }],
    qualification: [{
      code: {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v2-0360',
          code: 'MD',
        }],
      },
    }],
  }
}

// ── ServiceRequest ────────────────────────────────────────────────────────────

function buildServiceRequest({ referral, patient, provider }) {
  return {
    resourceType: 'ServiceRequest',
    id: referral.id,
    status: 'active',
    intent: 'order',
    priority: referral.urgency?.toLowerCase() || 'routine',
    code: {
      coding: [{
        system: 'http://snomed.info/sct',
        code: '306206005',
        display: `Referral to ${referral.specialty}`,
      }],
    },
    reasonCode: referral.diagnosisCodes.map(code => ({
      coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code }],
    })),
    subject: { reference: `Patient/${patient.id}` },
    requester: { reference: `Practitioner/${provider.id}` },
    occurrenceDateTime: referral.requestedDate
      ? new Date(referral.requestedDate).toISOString()
      : undefined,
    note: referral.clinicalNotes
      ? [{ text: referral.clinicalNotes }]
      : undefined,
  }
}

// ── Parse ClaimResponse ───────────────────────────────────────────────────────

export function parseClaimResponse(claimResponse) {
  if (!claimResponse || claimResponse.resourceType !== 'ClaimResponse') {
    return { status: 'PENDING', rawResponse: claimResponse }
  }

  const outcome = claimResponse.outcome
  const preAuthRef = claimResponse.preAuthRef?.[0]

  let status = 'IN_REVIEW'
  if (outcome === 'complete') status = 'APPROVED'
  else if (outcome === 'error') status = 'DENIED'
  else if (outcome === 'partial') status = 'PARTIALLY_APPROVED'

  const denialEntry = claimResponse.error?.[0]

  return {
    status,
    authNumber: preAuthRef,
    denialReason: denialEntry?.code?.text,
    denialCode: denialEntry?.code?.coding?.[0]?.code,
    expiresAt: claimResponse.preAuthPeriod?.end
      ? new Date(claimResponse.preAuthPeriod.end)
      : undefined,
    rawResponse: claimResponse,
  }
}

// ── FHIR CapabilityStatement ──────────────────────────────────────────────────

export function buildCapabilityStatement(serverUrl) {
  return {
    resourceType: 'CapabilityStatement',
    status: 'active',
    date: new Date().toISOString(),
    kind: 'instance',
    software: { name: 'Plerous API', version: '2.0.0' },
    implementation: {
      description: 'Plerous Healthcare Referral & Prior Authorization Platform',
      url: serverUrl,
    },
    fhirVersion: '4.0.1',
    format: ['json'],
    rest: [{
      mode: 'server',
      resource: [
        { type: 'Patient', interaction: [{ code: 'read' }, { code: 'search-type' }] },
        { type: 'Practitioner', interaction: [{ code: 'read' }] },
        { type: 'ServiceRequest', interaction: [{ code: 'read' }, { code: 'create' }] },
        { type: 'Claim', interaction: [{ code: 'create' }] },
        { type: 'ClaimResponse', interaction: [{ code: 'read' }] },
        { type: 'Task', interaction: [{ code: 'read' }, { code: 'create' }, { code: 'update' }] },
      ],
      operation: [
        {
          name: 'submit',
          definition: 'http://hl7.org/fhir/us/davinci-pas/OperationDefinition/Claim-submit',
        },
      ],
    }],
    implementationGuide: [
      'http://hl7.org/fhir/us/davinci-pas/ImplementationGuide/hl7.fhir.us.davinci-pas',
    ],
  }
}
