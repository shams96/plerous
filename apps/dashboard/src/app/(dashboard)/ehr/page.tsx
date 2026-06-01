import { serverApi } from '@/lib/server-api'
import { type EHRProfile } from '@/lib/api'
import EHRConnectForm from '@/components/EHRConnectForm'
import ReviewQueuePanel from '@/components/ReviewQueuePanel'
import { Plug, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'

interface EHRResponse {
  connection?: EHRProfile
  message?: string
}

interface ReviewItem {
  id: string
  displayName: string
  ehrSystemId: string
  fhirBaseUrl: string
  confidenceScore: number
  createdAt: string
}

async function getProfile(): Promise<EHRProfile | null> {
  try {
    const data = await serverApi.get<EHRResponse>('/v1/ehr/profile')
    return data.connection ?? null
  } catch {
    return null
  }
}

async function getReviewQueue(): Promise<ReviewItem[]> {
  try {
    const data = await serverApi.get<{ items: ReviewItem[]; count: number }>('/v1/ehr/review-queue')
    return data.items ?? []
  } catch {
    return []
  }
}

const syncIcon: Record<string, typeof CheckCircle2> = {
  active: CheckCircle2,
  pending: Clock,
  error: AlertTriangle,
  pending_review: Clock,
}

const syncColor: Record<string, string> = {
  active: 'text-green-600',
  pending: 'text-yellow-600',
  error: 'text-red-600',
  pending_review: 'text-blue-600',
}

export default async function EHRPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string }>
}) {
  const { connected } = await searchParams
  const [profile, queue] = await Promise.all([getProfile(), getReviewQueue()])

  return (
    <div>
      {connected && (
        <div className="bg-green-50 border-b border-green-200 px-6 py-3 flex items-center gap-2 text-sm text-green-700">
          <CheckCircle2 size={14} className="text-green-600" />
          EHR connected successfully via SMART on FHIR. Plerous can now read patient and coverage data.
        </div>
      )}
      <div className="bg-white border-b border-stone-200 px-6 py-4">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Plug size={18} className="text-blue-600" />
          EHR Integration
        </h1>
        <p className="text-sm text-slate-500">
          EHR Intelligence Registry — context-aware, ahead-of-time EHR profile
        </p>
      </div>

      <div className="p-6 grid grid-cols-2 gap-6">
        {/* Active connection */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Active Connection</h2>
          {profile ? (
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800">{profile.displayName}</p>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{profile.ehrSystemId}</p>
                </div>
                {(() => {
                  const Icon = syncIcon[profile.syncStatus] ?? CheckCircle2
                  const cls = syncColor[profile.syncStatus] ?? 'text-slate-400'
                  return <Icon size={18} className={cls} />
                })()}
              </div>
              <p className="text-xs text-slate-500 break-all">{profile.fhirBaseUrl}</p>
              {profile.confidenceScore != null && (
                <div>
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>EIR Confidence</span>
                    <span>{(profile.confidenceScore * 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        profile.confidenceScore >= 0.85 ? 'bg-green-500' : 'bg-yellow-400'
                      }`}
                      style={{ width: `${profile.confidenceScore * 100}%` }}
                    />
                  </div>
                </div>
              )}
              {profile.lastSyncAt && (
                <p className="text-xs text-slate-400">
                  Last sync: {new Date(profile.lastSyncAt).toLocaleString()}
                </p>
              )}
            </div>
          ) : (
            <div className="bg-stone-50 rounded-xl border border-dashed border-stone-200 p-8 text-center">
              <Plug size={24} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No EHR connected</p>
              <p className="text-xs text-slate-300 mt-1">
                Connect your EHR below to enable auto-discovery
              </p>
            </div>
          )}

          {/* Connect form */}
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Connect an EHR</h2>
            <EHRConnectForm />
          </div>
        </div>

        {/* Review queue + EIR explanation */}
        <div className="space-y-6">
          <ReviewQueuePanel items={queue} />

          {/* How EIR works */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-blue-800 mb-3">How EIR Works</h2>
            <ol className="space-y-2 text-sm text-blue-700">
              <li className="flex gap-2">
                <span className="font-bold shrink-0">1.</span>
                <span>
                  <strong>Pre-trained profiles</strong> — Plerous knows Epic, Cerner, Tebra,
                  DrChrono, and athenahealth before the first API call (including Tebra's Task
                  vs ServiceRequest quirk).
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold shrink-0">2.</span>
                <span>
                  <strong>Live fingerprinting</strong> — URL patterns, response headers, and FHIR
                  extensions identify unknown systems automatically.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold shrink-0">3.</span>
                <span>
                  <strong>Human oversight</strong> — confidence below 85% queues for review.
                  No auto-integration of uncertain systems (EU AI Act compliant).
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold shrink-0">4.</span>
                <span>
                  <strong>Context injection</strong> — every AI agent receives the full EHR
                  profile before executing any operation.
                </span>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
