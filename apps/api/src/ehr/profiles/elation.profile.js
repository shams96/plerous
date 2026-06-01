// Elation Health — Direct Primary Care (DPC) and independent PCP practices
// FHIR-first architecture — one of the cleanest FHIR R4 implementations in the SMB EHR space
// Strong in DPC model: subscription-based practice, no fee-for-service billing
// Also growing in traditional FFS PCP practices as an Epic/athena alternative
// Key distinction: DPC practices may have patients with NO insurance — referral workflows differ
export const elationProfile = {
  id: 'elation',
  vendorName: 'Elation Health',
  fingerprints: {
    responseHeaders: [
      'x-elation-request-id',
      'x-elation-version',
      'server-timing',             // Elation uses Server-Timing headers for observability
    ],
    urlPatterns: [
      'elationhealth.com',
      'elationemr.com',
      'api.elationhealth.com',
      '/fhir/r4/elation',
      'elation.health',
    ],
    extensions: [
      'https://fhir.elationhealth.com/fhir/StructureDefinition',
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-direct',
    ],
    errorSignature: { resourceType: 'OperationOutcome' },
  },
  versions: {
    detect: (capabilityStatement) => {
      const sw = capabilityStatement?.software?.version ?? ''
      return sw ? `elation-${sw}` : 'elation-current'
    },
  },
  fhir: {
    version: 'R4',
    referralResource: 'ServiceRequest',
    // Elation typically pairs a ServiceRequest with a DocumentReference for the referral letter
    // Both are needed for a complete referral in Elation workflows
    referralLetterResource: 'DocumentReference',
    authorizationResource: 'Claim',                // FFS practices only — DPC practices skip this
    patientSearchParams: ['name', 'birthdate', 'identifier', 'phone', 'email'],
    specialtyCodeSystem: 'http://nucc.org/provider-taxonomy',
    authType: 'oauth2_smart',
    smartScopes: [
      'launch',
      'openid',
      'profile',
      'fhirUser',
      'patient/Patient.read',
      'patient/Patient.write',
      'patient/ServiceRequest.read',
      'patient/ServiceRequest.write',
      'patient/DocumentReference.read',
      'patient/DocumentReference.write',
      'patient/Observation.read',
      'user/Practitioner.read',
      'user/Organization.read',
    ],
    supportsWebhooks: true,
    // Elation supports FHIR Subscriptions natively — one of the few SMB EHRs that do
    webhookEvents: [
      'ServiceRequest',
      'Patient',
      'Appointment',
      'DocumentReference',
    ],
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
    // Elation referral pattern: ServiceRequest + DocumentReference (referral letter) pair
    // Creating only the ServiceRequest without the letter results in an incomplete referral
    // in the Elation UI — clinicians will see it as missing documentation
    notesField: 'note[0].text',
    attachmentsMethod: 'DocumentReference',
    requiresOrderingProvider: true,
    referralLetterRequired: false,   // not FHIR-required but strongly recommended for DPC workflow
    adapter: 'ServiceRequestAdapter',
  },
  performance: {
    rateLimitPerMin: 150,            // generous limits — Elation has a modern API-first architecture
    recommendedConcurrency: 5,
    avgResponseMs: 400,              // fastest in the SMB segment — cloud-native, no translation layer
    sandboxUrl: 'https://sandbox.elationhealth.com/fhir/r4',
    notes: 'Elation has one of the cleanest FHIR R4 implementations in the SMB segment. Rate limits are permissive. Webhook support is genuine — prefer subscriptions over polling when connecting to Elation.',
  },
  quirks: [
    {
      id: 'elation-dpc-no-insurance',
      description: 'Direct Primary Care (DPC) practices on Elation operate on a membership subscription model. Their patients may have NO insurance (no Coverage resource). Always handle the case where Coverage is missing — DPC patients still need specialist referrals but prior auth workflows are bypassed entirely.',
      severity: 'high',
      workaround: 'handleMissingCoverageForDPC',
      affectedFields: ['priorAuthorization', 'Coverage', 'patient.insuranceMemberId'],
    },
    {
      id: 'elation-referral-letter-pair',
      description: 'Elation\'s referral workflow expects a ServiceRequest + DocumentReference pair. The DocumentReference contains the structured referral letter (reason for referral, clinical context, relevant history). Creating only the ServiceRequest leaves the referral flagged as incomplete in the Elation UI, and specialists may reject it.',
      severity: 'medium',
      workaround: 'createReferralLetterDocumentReference',
      affectedFields: ['ServiceRequest', 'DocumentReference', 'referral.attachments'],
    },
    {
      id: 'elation-webhooks-preferred',
      description: 'Elation supports FHIR Subscriptions natively. Unlike most SMB EHRs, polling is not necessary — webhook-based status updates are reliable and low-latency. Strongly prefer Subscription over polling for Elation integrations.',
      severity: 'low',
      workaround: 'useWebhooksInsteadOfPolling',
      affectedFields: ['all_async_events'],
    },
    {
      id: 'elation-patient-panel-model',
      description: 'DPC practices on Elation manage a patient panel (fixed membership list). Patient search by name alone may return patients from the panel who have similar names. Always include date of birth and confirm the patient\'s panel membership status before creating a referral.',
      severity: 'low',
      workaround: 'includeDobInPatientSearch',
      affectedFields: ['patient.search'],
    },
    {
      id: 'elation-direct-messaging',
      description: 'Elation supports Direct Secure Messaging (Direct protocol) for referral communication to specialists who don\'t share the same EHR. Elation populates Patient.telecom with Direct email addresses (system: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-direct"). Use this for out-of-network specialist communication.',
      severity: 'low',
      workaround: 'checkDirectMessagingAddress',
      affectedFields: ['Patient.telecom', 'DocumentReference'],
    },
  ],
  fieldMappings: {
    'referral.specialty':        'ServiceRequest.performer[0].type.coding[0].code',  // NUCC
    'referral.diagnosisCodes':   'ServiceRequest.reasonCode[*].coding[0].code',
    'referral.procedureCodes':   'ServiceRequest.code.coding[*].code',
    'referral.clinicalNotes':    'ServiceRequest.note[0].text',
    'referral.urgency':          'ServiceRequest.priority',
    'referral.requestedDate':    'ServiceRequest.occurrenceDateTime',
    'referral.letter':           'DocumentReference.content[0].attachment.url',
    'patient.mrn':               'Patient.identifier[?(@.type.coding[0].code=="MR")].value',
    'patient.insuranceMemberId': 'Coverage.subscriberId',                             // may be absent (DPC)
    'patient.dob':               'Patient.birthDate',
    'patient.directAddress':     'Patient.telecom[?(@.system=="email" && @.use=="work")].value',
  },
  urgencyMap: {
    'ROUTINE':   'routine',
    'URGENT':    'urgent',
    'STAT':      'stat',
    'EMERGENCY': 'stat',
  },
  specialtyContext: {
    primaryRole: 'referring',     // Elation practices are PCPs sending referrals out
    practiceModels: ['DPC', 'FFS', 'hybrid'],
    commonSpecialties: [
      'Family Medicine', 'Internal Medicine', 'Pediatrics',
      'Functional Medicine', 'Integrative Medicine',
    ],
    nuccCodes: {
      'Family Medicine':        '207Q00000X',
      'Internal Medicine':      '207R00000X',
      'Pediatrics':             '208000000X',
      'Functional Medicine':    '207QG0300X',
    },
    commonReferralTargets: [
      'Cardiology', 'Endocrinology', 'Gastroenterology',
      'Pulmonary Disease', 'Sleep Medicine', 'Orthopedics', 'Neurology',
      'Dermatology', 'Psychiatry',
    ],
    // DPC patients often go out-of-network — prior auth bypass is common
    dpcPriorAuthBehavior: 'bypass_when_no_coverage',
  },
}
