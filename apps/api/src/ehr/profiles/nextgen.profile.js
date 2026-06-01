// NextGen Enterprise — mid-size ambulatory care, specialty groups
// Strong in orthopedics, OB/GYN, multi-specialty groups, FQHCs
// FHIR R4 delivered via NextGen Connect (Mirth-based integration engine)
// which means there is an XML↔FHIR translation layer between the EHR and the API
export const nextgenProfile = {
  id: 'nextgen',
  vendorName: 'NextGen Healthcare',
  fingerprints: {
    responseHeaders: [
      'x-nextgen-request-id',
      'x-ng-version',
      'x-nextgen-correlation-id',
    ],
    urlPatterns: [
      'nextgen.com',
      'ngnhc.com',
      'nextgenadvantage.com',
      'api.nextech.com',           // NextGen sister brand for derm/plastics
      '/NextGen/fhir',
      '/ngwebapi/fhir',
    ],
    extensions: [
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
      'https://fhir.nextgen.com/nge/prod/fhir-api-proxy/fhir/r4',
    ],
    errorSignature: { resourceType: 'OperationOutcome' },
  },
  versions: {
    // NextGen Enterprise vs. NextGen Now (cloud) vs. NextGen Office (SMB)
    // have meaningfully different FHIR implementations
    detect: (capabilityStatement) => {
      const sw = capabilityStatement?.software?.name ?? ''
      if (sw.toLowerCase().includes('nextgen now')) return 'nextgen-now'
      if (sw.toLowerCase().includes('nextgen office')) return 'nextgen-office'
      return 'nextgen-enterprise'  // default — most deployments
    },
  },
  fhir: {
    version: 'R4',
    referralResource: 'ServiceRequest',
    authorizationResource: 'Claim',
    patientSearchParams: ['name', 'birthdate', 'identifier', 'address-city'],
    specialtyCodeSystem: 'http://nucc.org/provider-taxonomy',
    authType: 'oauth2_smart',
    smartScopes: [
      'launch',
      'openid',
      'profile',
      'fhirUser',
      'patient/Patient.read',
      'patient/ServiceRequest.read',
      'patient/ServiceRequest.write',
      'patient/Claim.read',
      'patient/DocumentReference.read',
      'user/Practitioner.read',
      'user/Organization.read',
    ],
    supportsWebhooks: true,        // NextGen Connect supports subscriptions, but configuration required
    webhookEvents: ['ServiceRequest', 'Appointment'],
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
    specialtyInPerformer: false,   // NextGen encodes specialty in ServiceRequest.code, not performer
    adapter: 'ServiceRequestAdapter',
  },
  performance: {
    rateLimitPerMin: 120,
    recommendedConcurrency: 4,
    avgResponseMs: 900,            // NextGen Connect adds ~200ms translation overhead
    sandboxUrl: 'https://fhir.nextgen.com/nge/prod/fhir-api-proxy/fhir/r4',
    notes: 'NextGen Connect (Mirth) is the integration layer — treat it as a proxy, not the EHR directly. Some responses include NextGen-specific XML artifacts in extensions.',
  },
  quirks: [
    {
      id: 'ng-connect-translation-layer',
      description: 'NextGen FHIR R4 is routed through NextGen Connect (formerly Mirth), a Mirth-based integration engine. This adds a translation layer between the native NextGen database (MSSQL/HL7 v2) and FHIR R4. Field mapping errors, truncation of long text fields, and occasional malformed extensions are known artifacts of this layer.',
      severity: 'high',
      workaround: 'validateFhirResourceIntegrity',
      affectedFields: ['ServiceRequest.note', 'DocumentReference.content', 'Patient.extension'],
    },
    {
      id: 'ng-version-fragmentation',
      description: 'NextGen Enterprise, NextGen Now, and NextGen Office have meaningfully different FHIR implementations. Enterprise (on-premise) often runs older versions with limited SMART on FHIR support. Always check software.version in CapabilityStatement and adjust scope requests accordingly.',
      severity: 'high',
      workaround: 'detectVersionBeforeAuth',
      affectedFields: ['auth.smartScopes', 'all_endpoints'],
    },
    {
      id: 'ng-specialty-code-in-servicerequest-code',
      description: 'Unlike Epic/Cerner which encode specialty in performer, NextGen encodes the referring specialty in ServiceRequest.code using NUCC taxonomy. The performer field contains the individual provider NPI, not the specialty.',
      severity: 'medium',
      workaround: 'mapSpecialtyToServiceRequestCode',
      affectedFields: ['referral.specialty', 'ServiceRequest.code'],
    },
    {
      id: 'ng-patient-portal-sync-lag',
      description: 'NextGen Patient portal (OTTO Health integration for some deployments, native for others) syncs referral status with a 15–30 minute lag. Do not use patient-facing status as a real-time signal.',
      severity: 'low',
      workaround: 'pollingFallback',
      affectedFields: ['referral.status', 'patient.portal'],
    },
    {
      id: 'ng-fqhc-encounter-requirements',
      description: 'Federally Qualified Health Centers (FQHCs) running NextGen require an active Encounter linked to any ServiceRequest. Referrals created without a linked Encounter ID will be rejected by the FQHC workflow engine even if the FHIR API accepts the resource.',
      severity: 'medium',
      workaround: 'requireEncounterForFQHC',
      affectedFields: ['ServiceRequest.encounter', 'referral.encounter'],
    },
  ],
  fieldMappings: {
    'referral.specialty':        'ServiceRequest.code.coding[0].code',         // NUCC — NOT performer
    'referral.diagnosisCodes':   'ServiceRequest.reasonCode[*].coding[0].code',
    'referral.procedureCodes':   'ServiceRequest.orderDetail[*].coding[0].code',
    'referral.clinicalNotes':    'ServiceRequest.note[0].text',
    'referral.urgency':          'ServiceRequest.priority',
    'referral.requestedDate':    'ServiceRequest.occurrenceDateTime',
    'patient.mrn':               'Patient.identifier[?(@.type.coding[0].code=="MR")].value',
    'patient.insuranceMemberId': 'Coverage.subscriberId',
    'patient.dob':               'Patient.birthDate',
    'provider.npi':              'Practitioner.identifier[?(@.system=="http://hl7.org/fhir/sid/us-npi")].value',
  },
  urgencyMap: {
    'ROUTINE':   'routine',
    'URGENT':    'urgent',
    'STAT':      'stat',
    'EMERGENCY': 'stat',
  },
  specialtyContext: {
    primaryRole: 'both',           // NextGen practices both send and receive referrals
    commonSpecialties: [
      'Orthopedic Surgery', 'OB/GYN', 'Family Medicine', 'Internal Medicine',
      'Gastroenterology', 'Neurology', 'Urology', 'Rheumatology',
    ],
    nuccCodes: {
      'Orthopedic Surgery':  '207X00000X',
      'OB/GYN':              '207V00000X',
      'Gastroenterology':    '207RG0100X',
      'Neurology':           '2084N0400X',
      'Urology':             '208800000X',
      'Rheumatology':        '207RR0500X',
    },
    fqhcRelevant: true,           // many FQHCs run NextGen — encounter linkage is critical
  },
}
