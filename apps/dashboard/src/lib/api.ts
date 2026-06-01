const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const API_KEY = process.env.NEXT_PUBLIC_DEMO_API_KEY || 'rc_live_demo_key_sunrise_2026'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      ...init?.headers,
    },
    next: { revalidate: 0 },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `API error ${res.status}`)
  }
  return res.json()
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'DELETE', body: body !== undefined ? JSON.stringify(body) : undefined }),
}

// ── Types ──────────────────────────────────────────────────────────────────

export type ReferralStatus =
  | 'DRAFT' | 'PAIA_REVIEW' | 'SUBMITTED' | 'AUTH_PENDING' | 'AUTH_APPROVED'
  | 'AUTH_DENIED' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED' | 'NO_SHOW'

export type Urgency = 'ROUTINE' | 'URGENT' | 'STAT' | 'EMERGENCY'

export interface Referral {
  id: string
  referralNumber: string
  status: ReferralStatus
  urgency: Urgency
  specialty: string
  subSpecialty?: string
  reason: string
  diagnosisCodes: string[]
  procedureCodes: string[]
  riskScore?: number
  approvalProbability?: number
  leakageRisk?: string
  requiresAuth: boolean
  appointmentDate?: string
  requestedDate?: string
  createdAt: string
  updatedAt: string
  patient?: { firstName: string; lastName: string; dateOfBirth: string }
  referringProvider?: { firstName: string; lastName: string; specialty: string }
  receivingProvider?: { firstName: string; lastName: string }
  authorization?: PriorAuth
  paiaAnalyses?: PAIAAnalysis[]
  sendingOrg?: { name: string }
  insurancePlan?: { planType: string; payer?: { name: string } }
}

export interface PAIAAnalysis {
  id: string
  decision: string
  confidence: number
  denialProbability: number
  humanWindowItems: Array<{
    checkId: string
    severity: string
    message: string
    detail?: string
    suggestion?: string
  }>
  autoFixed: Array<{ type: string; description: string }>
  checksRun: Array<{ check: string; passed: boolean; severity: string }>
  auditHash?: string
  analyzedInMs?: number
  resolvedAt?: string
  resolvedBy?: string
  resolutionNote?: string
  resolution?: string
  createdAt: string
}

export interface PriorAuth {
  id: string
  status: string
  authNumber?: string
  submittedAt?: string
  determinedAt?: string
  expiresAt?: string
  denialReason?: string
  denialCode?: string
  appealText?: string
  appealSubmitted: boolean
}

export interface Provider {
  id: string
  firstName: string
  lastName: string
  specialty: string
  npi: string
  acceptingNewPatients: boolean
  organization?: { name: string }
}

export interface Patient {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: string
  phone: string
  mrn?: string
}

export interface EHRProfile {
  ehrSystemId: string
  displayName: string
  fhirBaseUrl: string
  syncStatus: string
  confidenceScore?: number
  lastSyncAt?: string
  capabilities?: Record<string, unknown>
}
