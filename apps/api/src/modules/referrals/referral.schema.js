export const createReferralBody = {
  type: 'object',
  required: ['patientId', 'specialty', 'reason'],
  properties: {
    patientId:      { type: 'string', format: 'uuid' },
    receivingOrgId: { type: 'string', format: 'uuid' },
    specialty:      { type: 'string', minLength: 2 },
    subSpecialty:   { type: 'string' },
    diagnosisCodes: { type: 'array', items: { type: 'string' } },
    procedureCodes: { type: 'array', items: { type: 'string' } },
    clinicalNotes:  { type: 'string' },
    urgency:        { type: 'string', enum: ['ROUTINE', 'URGENT', 'STAT', 'EMERGENCY'] },
    reason:         { type: 'string', minLength: 5 },
    requestedDate:  { type: 'string', format: 'date-time' },
    estimatedRevenue: { type: 'number' },
    source:         { type: 'string', enum: ['portal', 'api', 'ehr_sync', 'fax'] },
    externalId:     { type: 'string' },
    ehrSystemId:    { type: 'string' },
  },
}

export const scheduleBody = {
  type: 'object',
  required: ['appointmentDate'],
  properties: {
    appointmentDate: { type: 'string', format: 'date-time' },
    notes: { type: 'string' },
  },
}

export const listQuery = {
  type: 'object',
  properties: {
    page:      { type: 'integer', minimum: 1, default: 1 },
    limit:     { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    status:    { type: 'string' },
    specialty: { type: 'string' },
    urgency:   { type: 'string' },
    search:    { type: 'string' },
  },
}
