export const cernerProfile = {
  id: 'cerner',
  vendorName: 'Oracle Health (Cerner)',
  fingerprints: {
    responseHeaders: ['x-cerner-api-key', 'x-request-id'],
    urlPatterns: ['/cerner/fhir/', '/r4/', 'cernercentral.com/fhir'],
    extensions: ['https://fhir-ehr.cerner.com/r4/StructureDefinition'],
    errorSignature: { resourceType: 'OperationOutcome' },
  },
  versions: {
    detect: (capabilityStatement) => {
      return capabilityStatement?.software?.name?.includes('Cerner') ? 'Cerner Millennium' : 'unknown'
    },
  },
  fhir: {
    version: 'R4',
    referralResource: 'ServiceRequest',
    authorizationResource: 'Claim',
    patientSearchParams: ['identifier', '_id', 'name', 'birthdate'],
    specialtyCodeSystem: 'http://snomed.info/sct',
    authType: 'smart_on_fhir',
    smartScopes: [
      'patient/Patient.read',
      'patient/ServiceRequest.read',
      'patient/ServiceRequest.write',
      'patient/Coverage.read',
      'user/Practitioner.read',
    ],
    supportsWebhooks: false,
    pollingIntervalMs: 45000,
  },
  referralWorkflow: {
    createEndpoint: 'POST /ServiceRequest',
    statusField: 'status',
    statusMap: {
      'draft':     'DRAFT',
      'active':    'SUBMITTED',
      'suspended': 'AUTH_PENDING',
      'completed': 'COMPLETED',
      'entered-in-error': 'CANCELLED',
    },
    notesField: 'note[0].text',
    attachmentsMethod: 'DocumentReference',
    requiresOrderingProvider: true,
    specialtyInPerformer: false,
  },
  performance: {
    rateLimitPerMin: 90,   // Claims 100 but 429s at 92 — see quirk
    recommendedConcurrency: 4,
    avgResponseMs: 950,
    sandboxUrl: 'https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d',
  },
  quirks: [
    {
      id: 'cerner-rate-limit-low',
      description: 'Cerner 429s at ~90 req/min despite 100/min documented limit',
      severity: 'medium',
      workaround: 'setEffectiveRateLimitTo85',
      affectedFields: ['all_requests'],
    },
    {
      id: 'cerner-search-requires-patient',
      description: 'Cerner ServiceRequest search requires patient parameter — cannot search org-wide',
      severity: 'high',
      workaround: 'alwaysIncludePatientParam',
      affectedFields: ['ServiceRequest.search'],
    },
    {
      id: 'cerner-coverage-inactive',
      description: 'Cerner Coverage resources may show inactive plans — filter by status=active',
      severity: 'medium',
      workaround: 'filterCoverageByActiveStatus',
      affectedFields: ['Coverage'],
    },
  ],
  fieldMappings: {
    'referral.specialty':      'ServiceRequest.code.coding[0].display',
    'referral.diagnosisCodes': 'ServiceRequest.reasonCode[*].coding[0].code',
    'referral.procedureCodes': 'ServiceRequest.orderDetail[*].coding[0].code',
    'referral.clinicalNotes':  'ServiceRequest.note[0].text',
    'referral.urgency':        'ServiceRequest.priority',
    'patient.mrn':             'Patient.identifier[?(@.use=="usual")].value',
    'patient.insuranceMemberId': 'Coverage.subscriberId',
  },
  urgencyMap: {
    'ROUTINE':   'routine',
    'URGENT':    'urgent',
    'STAT':      'stat',
    'EMERGENCY': 'stat',
  },
}
