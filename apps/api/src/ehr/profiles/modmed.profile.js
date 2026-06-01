// Modernizing Medicine (ModMed / EMA) — specialty-first EHR
// Electronic Medical Assistant (EMA) = specialty-native iPad + cloud EHR
// Dominant in: dermatology, ophthalmology, orthopedics, gastroenterology,
// plastic surgery, ENT, urology, and pain management
// Built specialty-first — not adapted from a generic EHR, unlike most competitors
export const modmedProfile = {
  id: 'modmed',
  vendorName: 'Modernizing Medicine (ModMed / EMA)',
  fingerprints: {
    responseHeaders: [
      'x-modmed-request-id',
      'x-ema-version',
      'x-modernizingmedicine-trace',
    ],
    urlPatterns: [
      'modmed.com',
      'ema.md',
      'modernizingmedicine.com',
      'mmis.net',
      '/fhir/r4/ema',
      'api.modmed.com',
    ],
    extensions: [
      'https://fhir.modmed.com/fhir/StructureDefinition',
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
    ],
    errorSignature: { resourceType: 'OperationOutcome' },
  },
  versions: {
    detect: (capabilityStatement) => {
      const sw = capabilityStatement?.software?.name ?? ''
      if (sw.toLowerCase().includes('ema')) return 'ema'
      if (sw.toLowerCase().includes('modmed practice management')) return 'modmed-pm'
      return 'modmed-current'
    },
  },
  fhir: {
    version: 'R4',
    referralResource: 'ServiceRequest',
    authorizationResource: 'Claim',
    patientSearchParams: ['name', 'birthdate', 'identifier', 'phone'],
    // Specialty-specific code systems — ModMed extends standard NUCC with
    // specialty-native codes for procedures (e.g., skin pathology, ophthalmic procedures)
    specialtyCodeSystem: 'http://nucc.org/provider-taxonomy',
    procedureCodeSystem: 'http://www.ama-assn.org/go/cpt',   // CPT primary; body-site modifiers common
    authType: 'oauth2_smart',
    smartScopes: [
      'launch',
      'openid',
      'profile',
      'fhirUser',
      'patient/Patient.read',
      'patient/ServiceRequest.read',
      'patient/ServiceRequest.write',
      'patient/Observation.read',
      'patient/DiagnosticReport.read',
      'patient/DocumentReference.read',
      'user/Practitioner.read',
    ],
    supportsWebhooks: false,       // ModMed uses polling model; Subscription resource not implemented
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
    // ModMed procedures are often body-site specific — bodySite on ServiceRequest is meaningful
    bodySiteRequired: false,       // not required but frequently populated in derm/ortho
    adapter: 'ServiceRequestAdapter',
  },
  performance: {
    rateLimitPerMin: 100,
    recommendedConcurrency: 4,
    avgResponseMs: 650,            // ModMed API is modern and relatively fast
    sandboxUrl: 'https://fhir.modmed.com/fhir/r4/sandbox',
    notes: 'ModMed API is purpose-built and well-maintained. Rate limits are per-app registration. Procedure codes often include CPT body-site modifiers — include modifier handling when parsing ServiceRequest.code.',
  },
  quirks: [
    {
      id: 'modmed-specialty-native-codes',
      description: 'ModMed is built specialty-first. Procedure codes for dermatology (e.g., excision, biopsy, Mohs) and ophthalmology (e.g., cornea, retina, lens procedures) include CPT modifier codes that encode body site and laterality. Standard CPT parsers that ignore modifiers will produce incorrect procedure descriptions.',
      severity: 'medium',
      workaround: 'parseCptWithModifiers',
      affectedFields: ['referral.procedureCodes', 'ServiceRequest.code.coding'],
    },
    {
      id: 'modmed-diagnostic-report-linked',
      description: 'In dermatology and ophthalmology workflows, referrals are frequently accompanied by a linked DiagnosticReport (pathology report, OCT imaging). When creating a ServiceRequest, the referral context is richer when DiagnosticReport.id is included in ServiceRequest.supportingInfo.',
      severity: 'low',
      workaround: 'includeDiagnosticReportInSupportingInfo',
      affectedFields: ['ServiceRequest.supportingInfo', 'DiagnosticReport'],
    },
    {
      id: 'modmed-no-webhooks',
      description: 'ModMed does not implement FHIR Subscriptions. Status updates require polling. Recommended interval: 120 seconds for routine referrals.',
      severity: 'medium',
      workaround: 'pollingFallback',
      affectedFields: ['all_async_events'],
    },
    {
      id: 'modmed-patient-portal-gpm',
      description: 'ModMed Patient Portal (gPM) shows referral status to patients, but syncs from the EHR on a 30-minute scheduled pull. Patient-visible status lags the FHIR API by up to 30 minutes.',
      severity: 'low',
      workaround: 'pollingFallback',
      affectedFields: ['referral.status', 'patient.portal'],
    },
    {
      id: 'modmed-prior-auth-specialty-triggers',
      description: 'ModMed specialties have very specific PA trigger logic. Dermatology: Mohs (17311-17315) almost always requires PA. Ophthalmology: intravitreal injections (67028) and trabeculectomy (66170) typically require PA. These are not encoded in the ServiceRequest — they must be checked against payer-specific PA grids.',
      severity: 'high',
      workaround: 'checkSpecialtyPriorAuthGrid',
      affectedFields: ['priorAuthorization', 'referral.procedureCodes'],
    },
  ],
  fieldMappings: {
    'referral.specialty':        'ServiceRequest.performer[0].type.coding[0].code',  // NUCC
    'referral.diagnosisCodes':   'ServiceRequest.reasonCode[*].coding[0].code',
    'referral.procedureCodes':   'ServiceRequest.code.coding[*].code',               // CPT + modifiers
    'referral.bodySite':         'ServiceRequest.bodySite[0].coding[0].code',        // specialty-specific
    'referral.clinicalNotes':    'ServiceRequest.note[0].text',
    'referral.urgency':          'ServiceRequest.priority',
    'referral.requestedDate':    'ServiceRequest.occurrenceDateTime',
    'referral.diagnosticReport': 'ServiceRequest.supportingInfo[0].reference',
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
  specialtyContext: {
    primaryRole: 'receiving',     // ModMed practices are specialist — they receive referrals
    commonSpecialties: [
      'Dermatology', 'Ophthalmology', 'Orthopedic Surgery',
      'Gastroenterology', 'Plastic Surgery', 'ENT (Otolaryngology)',
      'Urology', 'Pain Management',
    ],
    nuccCodes: {
      'Dermatology':           '207N00000X',
      'Ophthalmology':         '207W00000X',
      'Orthopedic Surgery':    '207X00000X',
      'Gastroenterology':      '207RG0100X',
      'Plastic Surgery':       '208200000X',
      'ENT (Otolaryngology)':  '207Y00000X',
      'Urology':               '208800000X',
      'Pain Management':       '208VP0014X',
    },
    highPaRiskProcedures: {
      // By specialty — procedures that almost universally require prior auth
      'Dermatology':   ['17311', '17312', '17313', '17314', '17315'],  // Mohs surgery
      'Ophthalmology': ['67028', '66170', '66174', '67036'],            // injections, trabeculectomy
      'Orthopedics':   ['27447', '27130', '29827', '23472'],            // joint replacements, arthroscopy
      'GI':            ['43239', '43251', '43270', '44388'],            // endoscopy with intervention
    },
  },
}
