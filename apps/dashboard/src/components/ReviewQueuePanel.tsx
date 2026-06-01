'use client'

import { useState } from 'react'
import { Clock, CheckCircle2, Loader2 } from 'lucide-react'

interface ReviewItem {
  id: string
  displayName: string
  ehrSystemId: string
  fhirBaseUrl: string
  confidenceScore: number
  createdAt: string
}

export default function ReviewQueuePanel({ items }: { items: ReviewItem[] }) {
  const [approved, setApproved] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<string | null>(null)

  async function approve(connectionId: string) {
    setLoading(connectionId)
    try {
      await fetch(`/api/proxy/v1/ehr/approve/${connectionId}`, {
        method: 'POST',
        headers: { 'x-api-key': 'rc_live_demo_key_sunrise_2026' },
      })
      setApproved((prev) => new Set([...prev, connectionId]))
    } finally {
      setLoading(null)
    }
  }

  const pending = items.filter((i) => !approved.has(i.id))

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
        <Clock size={14} className="text-yellow-500" />
        Human Review Queue
        {pending.length > 0 && (
          <span className="ml-1 bg-yellow-100 text-yellow-700 text-xs px-1.5 py-0.5 rounded-full">
            {pending.length}
          </span>
        )}
      </h2>

      {pending.length === 0 ? (
        <p className="text-sm text-slate-300 text-center py-6">
          No pending reviews — all EHR connections have sufficient confidence.
        </p>
      ) : (
        <div className="space-y-3">
          {pending.map((item) => (
            <div key={item.id} className="border border-yellow-100 bg-yellow-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <p className="text-sm font-medium text-slate-800">{item.displayName}</p>
                  <p className="text-xs text-slate-400 font-mono">{item.ehrSystemId}</p>
                </div>
                <button
                  onClick={() => approve(item.id)}
                  disabled={loading === item.id}
                  className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  {loading === item.id ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={11} />
                  )}
                  Approve
                </button>
              </div>
              <p className="text-xs text-slate-400 break-all">{item.fhirBaseUrl}</p>
              <div className="mt-2">
                <div className="flex justify-between text-xs text-slate-400 mb-0.5">
                  <span>Confidence</span>
                  <span>{(item.confidenceScore * 100).toFixed(0)}%</span>
                </div>
                <div className="h-1 bg-yellow-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-500 rounded-full"
                    style={{ width: `${item.confidenceScore * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
