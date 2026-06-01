// HIPAA-compliant request logging — strips PHI from logs
const PHI_FIELDS = ['dateOfBirth', 'ssn', 'mrn', 'phone', 'email', 'address', 'insuranceMemberId']

const PHI_ROUTES = ['/v1/patients', '/v1/referrals']

export async function hipaaLogger(request) {
  const isPHIRoute = PHI_ROUTES.some(r => request.url.startsWith(r))

  request.log.info({
    method: request.method,
    url: request.url,
    ip: request.ip,
    userId: request.user?.id ?? 'unauthenticated',
    orgId: request.user?.organizationId ?? null,
    containsPHI: isPHIRoute,
  }, 'request')
}

export function sanitizeForLog(obj) {
  if (!obj || typeof obj !== 'object') return obj
  const clean = { ...obj }
  for (const field of PHI_FIELDS) {
    if (field in clean) clean[field] = '[REDACTED]'
  }
  return clean
}
