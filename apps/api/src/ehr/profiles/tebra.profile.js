// Tebra (formerly Kareo) — Primary target: independent 1-10 provider practices
export const tebraProfile = {
  id: 'tebra',
  vendorName: 'Tebra (formerly Kareo)',
  fingerprints: {
    responseHeaders: ['x-kareo-requestid', 'x-tebra-version'],
    urlPatterns: ['app.kareo.com', 'api.tebra.com', 'kareo.com/api'],
    extensions: [],
    errorSignature: { Code: 'Error', Message: '' },  // Tebra uses non-FHIR error format
  },
  versions: {
    detect: () => 'tebra-current',
  },
  fhir: {
    version: 'R4',   // Partial — not fully FHIR native
    referralResource: 'Task',   // CRITICAL: Tebra uses Task not ServiceRequest
    authorizationResource: null,
    patientSearchParams: ['name', 'birthdate', 'identifier'],
    specialtyCodeSystem: 'http://nucc.org/provider-taxonomy',
    authType: 'oauth2_basic',
    smartScopes: ['read', 'write'],
    supportsWebhooks: true,
    webhookEvents: ['patient.created', 'appointment.scheduled', 'appointment.cancelled'],
  },
  referralWorkflow: {
    createEndpoint: 'POST /Task',   // Not ServiceRequest — apply TaskAdapter
    statusField: 'status',
    statusMap: {
      'draft':       'DRAFT',
      'requested':   'SUBMITTED',
      'in-progress': 'AUTH_PENDING',
      'completed':   'COMPLETED',
      'cancelled':   'CANCELLED',
      'rejected':    'AUTH_DENIED',
    },
    notesField: 'description',   // Different from standard FHIR
    attachmentsMethod: 'base64_inline',
    requiresOrderingProvider: false,
    specialtyInPerformer: false,
    adapter: 'TaskAdapter',   // Use TaskAdapter not ServiceRequestAdapter
  },
  performance: {
    rateLimitPerMin: 60,
    recommendedConcurrency: 3,
    avgResponseMs: 1200,
    sandboxUrl: 'https://api.tebra.com/fhir/r4/sandbox',
  },
  quirks: [
    {
      id: 'tebra-uses-task-not-servicerequest',
      description: 'Tebra v4 uses FHIR Task resource for referrals, not ServiceRequest. This is the most critical integration difference.',
      severity: 'critical',
      workaround: 'useTaskAdapter',
      affectedFields: ['all_referral_operations'],
    },
    {
      id: 'tebra-proprietary-specialty-codes',
      description: 'Tebra uses internal specialty codes, not NUCC taxonomy — requires lookup table',
      severity: 'medium',
      workaround: 'applyTebraSpecialtyCodeLookup',
      affectedFields: ['specialty'],
    },
    {
      id: 'tebra-date-format',
      description: 'Tebra returns dates as M/D/YYYY not ISO 8601',
      severity: 'medium',
      workaround: 'normalizeTebraDateFormat',
      affectedFields: ['all_dates'],
    },
    {
      id: 'tebra-pagination-page-not-offset',
      description: 'Tebra uses page-based pagination (page=1&pagesize=50) not FHIR bundle links',
      severity: 'low',
      workaround: 'useTebraPagination',
      affectedFields: ['list_operations'],
    },
  ],
  fieldMappings: {
    'referral.specialty':      'Task.code.text',
    'referral.diagnosisCodes': 'Task.reasonCode[*].coding[0].code',
    'referral.procedureCodes': 'Task.input[?(@.type.text=="procedure")].valueCodeableConcept.coding[0].code',
    'referral.clinicalNotes':  'Task.description',
    'referral.urgency':        'Task.priority',
    'patient.mrn':             'Patient.identifier[0].value',
    'patient.insuranceMemberId': 'Coverage.memberId',
  },
  urgencyMap: {
    'ROUTINE':   'routine',
    'URGENT':    'urgent',
    'STAT':      'asap',
    'EMERGENCY': 'asap',
  },
}
