// eClinicalWorks — widely deployed in independent specialty and primary care practices
// Used at Metroplex Pulmonary & Sleep Center (McKinney, TX) — Plerous pilot client
export const eclinicalworksProfile = {
  id: 'eclinicalworks',
  vendorName: 'eClinicalWorks (eCW)',
  fingerprints: {
    responseHeaders: ['x-ecw-version', 'x-powered-by-ecw'],
    urlPatterns: [
      'eclinicalworks.com',
      'ecwcloud.com',
      'healow.com/fhir',
      '/fhir/r4/',         // eCW uses standard path
    ],
    extensions: [
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
    ],
    errorSignature: { resourceType: 'OperationOutcome' },
  },
  versions: {
    detect: (capabilityStatement) => {
      const sw = capabilityStatement?.software?.version ?? ''
      if (sw.startsWith('12')) return 'ecw-12'
      if (sw.startsWith('11')) return 'ecw-11'
      return 'ecw-current'
    },
  },
  fhir: {
    version: 'R4',
    referralResource: 'ServiceRequest',
    authorizationResource: 'Claim',           // Da Vinci PAS via $submit
    patientSearchParams: ['name', 'birthdate', 'identifier', 'phone'],
    specialtyCodeSystem: 'http://nucc.org/provider-taxonomy',
    authType: 'oauth2_smart',
    smartScopes: [
      'launch',
      'patient/Patient.read',
      'patient/ServiceRequest.read',
      'patient/ServiceRequest.write',
      'patient/Claim.write',
      'user/Appointment.read',
    ],
    supportsWebhooks: false,                  // eCW uses polling, not push
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
    },
    notesField: 'note[0].text',
    attachmentsMethod: 'DocumentReference',
    requiresOrderingProvider: true,
    specialtyInPerformer: true,               // specialty coded in ServiceRequest.performer
    adapter: 'ServiceRequestAdapter',
  },
  performance: {
    rateLimitPerMin: 100,
    recommendedConcurrency: 5,
    avgResponseMs: 800,
    sandboxUrl: 'https://fhir.eclinicalworks.com/fhir/r4',
  },
  // eCW-specific integration notes for the AI agents
  quirks: [
    {
      id: 'ecw-healow-portal-sync',
      description: 'eCW syncs referrals to the Healow patient portal — status changes appear in Healow within ~2 min, not real-time',
      severity: 'low',
      workaround: 'pollingFallback',
      affectedFields: ['referral.status'],
    },
    {
      id: 'ecw-prior-auth-manual-step',
      description: 'eCW v11 and below requires manual PA initiation inside the eCW desktop app; v12+ supports $submit via Da Vinci PAS',
      severity: 'high',
      workaround: 'checkVersionBeforeAutoPA',
      affectedFields: ['priorAuthorization'],
    },
    {
      id: 'ecw-specialty-nucc-required',
      description: 'eCW requires NUCC provider taxonomy codes for specialist specialty — free-text specialties are rejected',
      severity: 'medium',
      workaround: 'applyNuccTaxonomyLookup',
      affectedFields: ['referral.specialty'],
    },
    {
      id: 'ecw-patient-search-dob-required',
      description: 'Patient search without date of birth returns max 10 results; always include birthdate for accurate matching',
      severity: 'low',
      workaround: 'includeDobInPatientSearch',
      affectedFields: ['patient.search'],
    },
    {
      id: 'ecw-no-webhooks',
      description: 'eCW does not support FHIR webhooks/subscriptions — use polling at 60-second intervals for status updates',
      severity: 'medium',
      workaround: 'pollingFallback',
      affectedFields: ['all_async_events'],
    },
  ],
  fieldMappings: {
    'referral.specialty':        'ServiceRequest.performer[0].type.coding[0].code',  // NUCC
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
  // Pulmonary/Sleep specialty context — relevant for MPSC pilot
  specialtyContext: {
    commonSpecialties: ['Pulmonary Disease', 'Sleep Medicine', 'Critical Care Medicine'],
    nuccCodes: {
      'Pulmonary Disease':        '207RP1001X',
      'Sleep Medicine':           '207RS0012X',
      'Critical Care Medicine':   '207RC0000X',
    },
    commonProcedureCodes: [
      '94010',  // Spirometry
      '94060',  // Bronchodilator response
      '94726',  // Plethysmography
      '95800',  // Sleep study — unattended
      '95810',  // Polysomnography
      '95811',  // PSG with CPAP titration
      '99213',  // Office visit — established
      '99214',  // Office visit — moderate complexity
    ],
    commonDiagnosisCodes: [
      'G47.33', // Obstructive sleep apnea
      'G47.30', // Sleep apnea unspecified
      'J44.1',  // COPD with acute exacerbation
      'J44.0',  // COPD with acute lower respiratory infection
      'J45.901', // Unspecified asthma with acute exacerbation
      'J96.00', // Acute respiratory failure
    ],
    typicalPriorAuthTriggers: ['95810', '95811', '94726'],  // Sleep studies and plethysmography often need PA
  },
}
