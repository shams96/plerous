import { serverApi } from '@/lib/server-api'
import { ShieldAlert, CheckCircle2, AlertTriangle, Clock } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'

interface WindowQueueItem {
  referralId: string
  analysisId: string
  decision: string
  denialProbability: number
  humanWindowItems: Array<{ checkId: string; message: string; detail: string }>
  autoFixed: Array<{ formatted: string }>
  queuedAt: string
}

async function getHumanWindowQueue(): Promise<WindowQueueItem[]> {
  try {
    const data = await serverApi.get<{ data: WindowQueueItem[] }>('/v1/paia/human-window')
    return data.data ?? []
  } catch {
    return []
  }
}

function RiskBadge({ probability }: { probability: number }) {
  const color = probability >= 70
    ? 'bg-red-100 text-red-700'
    : probability >= 40
    ? 'bg-orange-100 text-orange-700'
    : 'bg-yellow-100 text-yellow-700'
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
      {probability}% denial risk
    </span>
  )
}

export default async function PAIAHumanWindowPage() {
  const queue = await getHumanWindowQueue()

  return (
    <div>
      {/* Header */}
      <div className="bg-white border-b border-stone-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <ShieldAlert size={20} className="text-orange-500" />
          <div>
            <h1 className="text-lg font-semibold">PAIA Review Queue</h1>
            <p className="text-sm text-slate-500">
              Referrals that need your input before submission — PAIA prevented likely denials
            </p>
          </div>
          {queue.length > 0 && (
            <span className="ml-auto bg-orange-100 text-orange-700 text-sm font-semibold px-3 py-1 rounded-full">
              {queue.length} pending
            </span>
          )}
        </div>
      </div>

      <div className="p-6">
        {queue.length === 0 ? (
          // Empty state — this is the goal
          <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
            <CheckCircle2 size={40} className="text-green-500 mx-auto mb-4" />
            <h2 className="text-base font-semibold text-slate-700 mb-1">Queue is clear</h2>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              PAIA has cleared all pending referrals for submission.
              No prior auth issues detected that require your input.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary bar */}
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center gap-4">
              <AlertTriangle size={20} className="text-orange-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {queue.length} referral{queue.length !== 1 ? 's' : ''} blocked from submission
                </p>
                <p className="text-xs text-slate-500">
                  PAIA detected issues that would likely result in prior auth denial.
                  Each takes under 30 seconds to resolve.
                </p>
              </div>
            </div>

            {/* Queue items */}
            {queue.map((item) => (
              <div key={item.referralId} className="bg-white rounded-xl border border-stone-200 p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <Link
                      href={`/referrals/${item.referralId}`}
                      className="text-sm font-semibold text-blue-600 hover:underline"
                    >
                      View referral →
                    </Link>
                    <div className="flex items-center gap-2 mt-1">
                      <RiskBadge probability={item.denialProbability} />
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Clock size={11} />
                        {format(new Date(item.queuedAt), 'MMM d, h:mm a')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Issues */}
                <div className="space-y-1.5">
                  {item.humanWindowItems.map((issue, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <AlertTriangle size={13} className="text-orange-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-slate-700">{issue.message}</p>
                        {issue.detail && <p className="text-slate-500">{issue.detail}</p>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Auto-fixed */}
                {item.autoFixed?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-xs text-green-600 font-medium">Auto-fixed:</span>
                    {item.autoFixed.map((f, i) => (
                      <span key={i} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">
                        {f.formatted}
                      </span>
                    ))}
                  </div>
                )}

                <Link
                  href={`/referrals/${item.referralId}`}
                  className="block text-center text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg py-2 transition-colors"
                >
                  Resolve &amp; submit
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
