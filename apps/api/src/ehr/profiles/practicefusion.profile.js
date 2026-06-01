// Practice Fusion — acquired by Allscripts in 2018, rebranded Veradigm
// ~30K practices (peaked), heavily PCP / family medicine / internal medicine
// Free-tier model drove mass adoption; now subscription via Veradigm platform
// FHIR R4 support is Veradigm-layered — not native, bolted onto legacy Rails API
export const practicefusionProfile = {
  id: 'practicefusion',
  vendorName: 'Practice Fusion (Veradigm)',
  fingerprints: {
    responseHeaders: [
      'x-practicefusion-version',
      'x-veradigm-request-id',
      'x-allscripts-version',
    ],
    urlPatterns: [
      'practicefusion.com',
      'veradigm.com/fhir',
      'veradigm.com/api',
      'allscripts.com/fhir',
      'apis.practicefusion.com',
    ],
    extensions: [
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
      'https://practicefusion.com/fhir/StructureDefinition',
    ],
    errorSignature: { resourceType: 'OperationOutcome' },
  },
  versions: {
    detect: (capabilityStatement) => {
      const sw = capabilityStatement?.software?.name ?? ''
      if (sw.toLowerCase().includes('veradigm')) return 'veradigm-platform'
      if (sw.toLowerCase().includes('practice fusion')) return 'pf-legacy'
      return 'pf-current'
    },
  },
  fhir: {
    version: 'R4',
    referralResource: 'ServiceRequest',
    authorizationResource: 'Claim',
    patientSearchParams: ['name', 'birthdate', 'identifier'],
    specialtyCodeSystem: 'http://nucc.org/provider-taxonomy',
    authType: 'oauth2_smart',
    smartScopes: [
      'launch',
      'openid',
      'profile',
      'patient/Patient.read',
      'patient/ServiceRequest.read',
      'patient/ServiceRequest.write',
      'patient/Observation.read',
      'user/Practitioner.read',
    ],
    // Several FHIR R4 resources return 501 Not Implemented on Practice Fusion
    // Check supportedResources from live CapabilityStatement before assuming availability
    knownMissingResources: ['Appointment', 'Schedule', 'Slot', 'Task'],
    supportsWebhooks: false,
    webhookEvents: [],
  },
  referralWorkflow: {
    createEndpoint: 'POST /ServiceRequest',
    statusField: 'status',
    statusMap: {
      'draft':     'DRAFT',
      'active':    'SUBMITTED',
      'on-hold':   'AUTH_PENDING',
      'completed': 'COMPLETED',
      'revoked':   'CANCELLED',
      'unknown':   'DRAFT',
      'entered-in-error': 'CANCELLED',
    },
    notesField: 'note[0].text',
    attachmentsMethod: 'DocumentReference',
    requiresOrderingProvider: true,
    adapter: 'ServiceRequestAdapter',
  },
  performance: {
    rateLimitPerMin: 60,           // aggressive — enforced at Veradigm API gateway
    recommendedConcurrency: 2,     // low — gateway rejects burst traffic
    avgResponseMs: 1200,           // higher latency than modern EHRs (legacy Rails stack)
    sandboxUrl: 'https://sandbox.practicefusion.com/fhir/r4',
    notes: 'Veradigm API gateway may add 300-500ms on top of backend latency. Implement exponential backoff — 429s are common on concurrent requests.',
  },
  quirks: [
    {
      id: 'pf-fhir-gaps',
      description: 'Practice Fusion FHIR R4 support is Veradigm-layered. Several resource types return HTTP 501 Not Implemented (Appointment, Schedule, Task). Always probe CapabilityStatement before assuming resource availability.',
      severity: 'high',
      workaround: 'validateCapabilityStatementFirst',
      affectedFields: ['Appointment', 'Schedule', 'Task'],
    },
    {
      id: 'pf-rate-limit-aggressive',
      description: 'Veradigm API gateway enforces a hard 60 req/min limit per client_id. Concurrent requests (even within the limit) can trigger 429 responses. Serial requests with 100ms delay between them are more reliable than parallel batches.',
      severity: 'high',
      workaround: 'serialRequestsWithDelay',
      affectedFields: ['all_endpoints'],
    },
    {
      id: 'pf-patient-match-dob-required',
      description: 'Patient search without exact date of birth returns unreliable results — Practice Fusion allows duplicate patient records, so name-only searches frequently match the wrong patient. Always include birthdate parameter.',
      severity: 'medium',
      workaround: 'includeDobInPatientSearch',
      affectedFields: ['patient.search'],
    },
    {
      id: 'pf-no-webhooks',
      description: 'Practice Fusion / Veradigm does not support FHIR Subscriptions or webhooks for status push. All status checks must be polling-based.',
      severity: 'medium',
      workaround: 'pollingFallback',
      affectedFields: ['all_async_events'],
    },
    {
      id: 'pf-legacy-document-reference',
      description: 'Clinical documents (referral letters, labs) are accessible via DocumentReference but the contentType may be text/plain rather than application/pdf even for structured documents. Always check content.contentType before rendering.',
      severity: 'low',
      workaround: 'checkContentTypeBefore rendering',
      affectedFields: ['referral.attachments', 'DocumentReference'],
    },
  ],
  fieldMappings: {
    'referral.specialty':        'ServiceRequest.performer[0].type.coding[0].code',
    'referral.diagnosisCodes':   'ServiceRequest.reasonCode[*].coding[0].code',
    'referral.procedureCodes':   'ServiceRequest.code.coding[*].code',
    'referral.clinicalNotes':    'ServiceRequest.note[0].text',
    'referral.urgency':          'ServiceRequest.priority',
    'referral.requestedDate':    'ServiceRequest.occurrenceDateTime',
    'patient.mrn':               'Patient.identifier[?(@.type.coding[0].code=="MR")].value',
    'patient.insuranceMemberId': 'Coverage.subscriberId',
    'patient.dob':               'Patient.birthDate',
  },
  urgencyMap: {
    'ROUTINE':   'routine',
    'URGENT':    'urgent',
    'STAT':      'stat',
    'EMERGENCY': 'stat',
  },
  // Practice Fusion is overwhelmingly primary care
  // Most referrals originate here (sending side), not receiving
  specialtyContext: {
    primaryRole: 'referring',   // PCP practices sending referrals out, not receiving
    commonSpecialties: ['Family Medicine', 'Internal Medicine', 'Pediatrics', 'OB/GYN'],
    nuccCodes: {
      'Family Medicine':     '207Q00000X',
      'Internal Medicine':   '207R00000X',
      'Pediatrics':          '208000000X',
      'OB/GYN':              '207V00000X',
    },
    commonReferralTargets: [
      'Cardiology', 'Orthopedics', 'Gastroenterology', 'Neurology',
      'Pulmonary Disease', 'Sleep Medicine', 'Endocrinology',
    ],
  },
}
