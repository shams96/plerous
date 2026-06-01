// Epic Systems EHR Profile
// Covers Epic Ambulatory, Epic Inpatient, MyChart — versions 2023+
export const epicProfile = {
  id: 'epic',
  vendorName: 'Epic Systems',
  fingerprints: {
    // Headers Epic injects on FHIR responses
    responseHeaders: ['x-epic-clientid', 'x-epic-soap-action'],
    // URL patterns found in Epic instances
    urlPatterns: ['/api/FHIR/R4', '/interconnect-fhir', 'MyChart/api/FHIR'],
    // Epic-specific FHIR extensions
    extensions: ['http://open.epic.com/FHIR/StructureDefinition'],
    // Characteristic error format
    errorSignature: { resourceType: 'OperationOutcome', issue: [{ severity: 'error' }] },
  },
  versions: {
    detect: (capabilityStatement) => {
      const sw = capabilityStatement?.software?.version || ''
      // Epic version in format "Nov 2024", "Feb 2025"
      const match = sw.match(/(\w{3}\s\d{4})/)
      return match ? match[1] : 'unknown'
    },
  },
  fhir: {
    version: 'R4',
    referralResource: 'ServiceRequest',
    authorizationResource: 'Claim',         // Da Vinci PAS
    patientSearchParams: ['identifier', 'birthdate', 'name', 'family'],
    specialtyCodeSystem: 'http://nucc.org/provider-taxonomy',
    // Epic uses its own extension for referral status
    referralStatusExtension: 'http://open.epic.com/FHIR/StructureDefinition/status',
    // Epic requires SMART on FHIR for OAuth
    authType: 'smart_on_fhir',
    smartScopes: [
      'patient/Patient.read',
      'patient/ServiceRequest.read',
      'patient/ServiceRequest.write',
      'patient/Coverage.read',
      'user/Practitioner.read',
      'launch/patient',
    ],
    supportsWebhooks: false, // Epic uses polling not webhooks
    pollingIntervalMs: 30000,
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
    },
    // Epic stores clinical notes in different places depending on version
    notesField: 'note[0].text',
    attachmentsMethod: 'DocumentReference',
    // Epic requires the ordering provider NPI in performer
    requiresOrderingProvider: true,
    // Epic-specific: referral specialty maps to performer.type coding
    specialtyInPerformer: true,
  },
  performance: {
    rateLimitPerMin: 100,
    recommendedConcurrency: 5,
    avgResponseMs: 800,
    sandboxUrl: 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4',
  },
  quirks: [
    {
      id: 'epic-date-no-timezone',
      description: 'Epic returns datetime without timezone offset — always treat as local time of practice',
      severity: 'medium',
      workaround: 'appendLocalTimezone',
      affectedFields: ['authoredOn', 'occurrenceTiming'],
    },
    {
      id: 'epic-serviceRequest-note-array',
      description: 'Epic wraps clinical notes in an array even for single notes',
      severity: 'low',
      workaround: 'flattenNoteArray',
      affectedFields: ['note'],
    },
    {
      id: 'epic-smart-token-lifetime',
      description: 'Epic SMART tokens expire in 3600s regardless of requested lifetime',
      severity: 'low',
      workaround: 'forceTokenRefreshAt3500s',
      affectedFields: ['oauth_token'],
    },
    {
      id: 'epic-pagination-required',
      description: 'Epic requires _count parameter on bundle queries or returns default 10 results',
      severity: 'medium',
      workaround: 'alwaysAppendCount100',
      affectedFields: ['bundle_search'],
    },
  ],
  fieldMappings: {
    // Plerous canonical → Epic FHIR path
    'referral.specialty':      'ServiceRequest.performer[0].type.coding[0].display',
    'referral.diagnosisCodes': 'ServiceRequest.reasonCode[*].coding[0].code',
    'referral.procedureCodes': 'ServiceRequest.code.coding[0].code',
    'referral.clinicalNotes':  'ServiceRequest.note[0].text',
    'referral.urgency':        'ServiceRequest.priority',
    'patient.mrn':             'Patient.identifier[?(@.type.coding[0].code=="MR")].value',
    'patient.insuranceMemberId': 'Coverage.subscriberId',
  },
  urgencyMap: {
    'ROUTINE':   'routine',
    'URGENT':    'urgent',
    'STAT':      'stat',
    'EMERGENCY': 'asap',
  },
}
