'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Clock, CheckCircle2, ChevronRight, TrendingDown, Loader2, X } from 'lucide-react'
import { authFetch } from '@/lib/session'
import Link from 'next/link'

interface BriefItem {
  referralId:      string
  trackingToken:   string | null
  patientName:     string
  specialty:       string
  message:         string
  actionLabel:     string
  actionType:      string
  urgencyScore:    number
  hoursElapsed:    number
  specialistPhone?: string | null
  patientPhone?:   string | null
  patientSmsOptIn?: boolean
}

interface BriefStats {
  weeklyReferrals:    number
  submitted:          number
  received:           number
  scheduled:          number
  completed:          number
  leaked:             number
  leakageRate:        number
  industryAvgLeakage: number
}

interface Brief {
  generatedAt: string
  headline:    string
  topActions:  string[]
  urgent:      BriefItem[]
  followUp:    BriefItem[]
  stats:       BriefStats
  totalItems:  number
}

export default function DailyBrief() {
  const [brief,     setBrief]     = useState<Brief | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    authFetch('/api/proxy/v1/agents/brief/coordinator')
      .then(r => r.json())
      .then(r => { if (r.success) setBrief(r.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="bg-white border border-stone-200 rounded-xl p-4 flex items-center gap-3 mb-4">
      <Loader2 size={16} className="text-blue-500 animate-spin shrink-0" />
      <span className="text-sm text-slate-500">Generating today's brief…</span>
    </div>
  )

  if (!brief || brief.totalItems === 0 || dismissed) return null

  const leakageBetter = brief.stats.leakageRate < brief.stats.industryAvgLeakage

  return (
    <div className="bg-white border border-stone-200 rounded-xl mb-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-stone-100">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-base">📋</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-0.5">
              Today's Brief · {new Date(brief.generatedAt).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>
            <p className="text-sm font-semibold text-slate-800">{brief.headline}</p>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-slate-300 hover:text-slate-500 transition-colors p-1"
        >
          <X size={14} />
        </button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-5 divide-x divide-stone-100 bg-stone-50 text-center">
        {[
          { label: 'This week',  value: brief.stats.weeklyReferrals },
          { label: 'Submitted',  value: brief.stats.submitted },
          { label: 'Received',   value: brief.stats.received },
          { label: 'Scheduled',  value: brief.stats.scheduled },
          { label: 'Completed',  value: brief.stats.completed },
        ].map(s => (
          <div key={s.label} className="py-2 px-1">
            <p className="text-base font-bold text-slate-800">{s.value}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Leakage indicator */}
      {brief.stats.weeklyReferrals > 0 && (
        <div className={`flex items-center gap-2 px-4 py-2 text-xs border-b border-stone-100 ${
          leakageBetter ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
        }`}>
          <TrendingDown size={12} />
          Leakage rate: <strong>{brief.stats.leakageRate}%</strong>
          <span className="text-current/60">
            (industry avg {brief.stats.industryAvgLeakage}%)
            {leakageBetter ? ' ↓ below average ✓' : ' ↑ above average'}
          </span>
        </div>
      )}

      {/* Urgent items */}
      {brief.urgent.length > 0 && (
        <div className="px-4 py-3">
          <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest mb-2">
            🔴 Act Now ({brief.urgent.length})
          </p>
          <div className="space-y-2">
            {brief.urgent.map(item => (
              <BriefRow key={item.referralId} item={item} accent="red" />
            ))}
          </div>
        </div>
      )}

      {/* Follow-up items */}
      {brief.followUp.length > 0 && (
        <div className={`px-4 py-3 ${brief.urgent.length > 0 ? 'border-t border-stone-100' : ''}`}>
          <p className="text-[10px] font-bold text-yellow-700 uppercase tracking-widest mb-2">
            🟡 Follow Up ({brief.followUp.length})
          </p>
          <div className="space-y-2">
            {brief.followUp.slice(0, 4).map(item => (
              <BriefRow key={item.referralId} item={item} accent="yellow" />
            ))}
            {brief.followUp.length > 4 && (
              <p className="text-xs text-slate-400 pl-1">
                +{brief.followUp.length - 4} more follow-ups
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function BriefRow({ item, accent }: { item: BriefItem; accent: 'red' | 'yellow' }) {
  const colors = accent === 'red'
    ? { dot: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-100' }
    : { dot: 'bg-yellow-400', text: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-100' }

  return (
    <div className={`flex items-start gap-3 rounded-lg p-2.5 ${colors.bg} border ${colors.border}`}>
      <div className={`w-2 h-2 rounded-full ${colors.dot} shrink-0 mt-1.5`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-800 truncate">
          {item.patientName}
          <span className="font-normal text-slate-500"> · {item.specialty}</span>
          {item.trackingToken && (
            <span className="font-mono text-slate-400 ml-1 text-[10px]">{item.trackingToken}</span>
          )}
        </p>
        <p className={`text-xs ${colors.text} mt-0.5`}>{item.message}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <Link
            href={`/referrals/${item.referralId}`}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700"
          >
            {item.actionLabel}
            <ChevronRight size={10} />
          </Link>
          {item.specialistPhone && (
            <a
              href={`tel:${item.specialistPhone}`}
              className="text-[11px] text-slate-500 hover:text-slate-700"
            >
              📞 {item.specialistPhone}
            </a>
          )}
        </div>
      </div>
      <span className="text-[10px] text-slate-400 shrink-0">{item.hoursElapsed}h</span>
    </div>
  )
}
