export const drchronoProfile = {
  id: 'drchrono',
  vendorName: 'DrChrono',
  fingerprints: {
    responseHeaders: ['x-drchrono-request-id'],
    urlPatterns: ['app.drchrono.com/api', 'drchrono.com/fhir'],
    extensions: [],
    errorSignature: { detail: '', status_code: 0 },  // DRF-style errors
  },
  versions: {
    detect: (capabilityStatement) => {
      return capabilityStatement?.software?.version?.includes('DrChrono') ? 'drchrono-v4' : 'drchrono-v3'
    },
  },
  fhir: {
    version: 'R4',
    referralResource: 'ServiceRequest',
    authorizationResource: null,
    patientSearchParams: ['identifier', 'name', 'birthdate'],
    specialtyCodeSystem: 'http://nucc.org/provider-taxonomy',
    authType: 'oauth2_basic',
    smartScopes: ['patients:read', 'patients:write', 'clinical:read', 'clinical:write'],
    supportsWebhooks: true,
    webhookEvents: ['APPOINTMENT_CREATE', 'APPOINTMENT_MODIFY', 'PATIENT_CREATE'],
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
    },
    notesField: 'note[0].text',
    attachmentsMethod: 'DocumentReference',
    requiresOrderingProvider: true,
    specialtyInPerformer: true,
  },
  performance: {
    rateLimitPerMin: 200,
    recommendedConcurrency: 8,
    avgResponseMs: 600,
    sandboxUrl: 'https://app.drchrono.com/api/fhir/r4',
  },
  quirks: [
    {
      id: 'drchrono-oauth-scope-format',
      description: 'DrChrono uses colon-delimited scopes (patients:read) not space-delimited SMART scopes',
      severity: 'medium',
      workaround: 'convertSmartScopesToDrChronoFormat',
      affectedFields: ['oauth_scopes'],
    },
    {
      id: 'drchrono-webhook-no-retry',
      description: 'DrChrono webhooks do not retry on failure — must implement idempotency on receiver',
      severity: 'medium',
      workaround: 'implementWebhookIdempotencyKey',
      affectedFields: ['webhooks'],
    },
  ],
  fieldMappings: {
    'referral.specialty':      'ServiceRequest.performer[0].type.coding[0].display',
    'referral.diagnosisCodes': 'ServiceRequest.reasonCode[*].coding[0].code',
    'referral.procedureCodes': 'ServiceRequest.code.coding[0].code',
    'referral.clinicalNotes':  'ServiceRequest.note[0].text',
    'patient.mrn':             'Patient.identifier[?(@.use=="official")].value',
    'patient.insuranceMemberId': 'Coverage.subscriberId',
  },
  urgencyMap: {
    'ROUTINE':   'routine',
    'URGENT':    'urgent',
    'STAT':      'stat',
    'EMERGENCY': 'stat',
  },
}
