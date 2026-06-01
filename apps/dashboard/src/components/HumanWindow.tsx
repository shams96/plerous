'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert, ChevronRight, Wrench } from 'lucide-react'
import { api } from '@/lib/api'

interface WindowItem {
  checkId: string
  severity: string
  message: string
  detail: string
  suggestion?: string
}

interface AutoFixed {
  criterionId: string
  formatted: string
  description: string
}

interface PAIAResult {
  referralId: string
  decision: string
  confidence: number
  denialProbability: number
  humanWindowItems: WindowItem[]
  autoFixed: AutoFixed[]
  notesUpdated: boolean
  payerName: string
  analyzedInMs: number
}

interface HumanWindowProps {
  paiaResult: PAIAResult
  referralNumber: string
  patientName: string
  specialty: string
  estimatedRevenue?: number
  onResolved: () => void
}

export default function HumanWindow({
  paiaResult, referralNumber, patientName, specialty, estimatedRevenue, onResolved,
}: HumanWindowProps) {
  const [resolving, setResolving] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const riskColor = paiaResult.denialProbability >= 70
    ? 'text-red-600' : paiaResult.denialProbability >= 40
    ? 'text-orange-500' : 'text-yellow-600'

  const riskBg = paiaResult.denialProbability >= 70
    ? 'bg-red-50 border-red-200' : paiaResult.denialProbability >= 40
    ? 'bg-orange-50 border-orange-200' : 'bg-yellow-50 border-yellow-200'

  async function handleResolve(resolution: 'confirmed' | 'override') {
    setResolving(true)
    setError(null)
    try {
      await api.post(`/v1/referrals/${paiaResult.referralId}/resolve-and-submit`, {
        resolution,
        note: note || undefined,
      })
      // Remove from human window queue
      await api.delete(`/v1/paia/human-window/${paiaResult.referralId}`)
      onResolved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to submit')
      setResolving(false)
    }
  }

  return (
    <div className={`rounded-xl border ${riskBg} p-5 space-y-4`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert size={18} className={riskColor} />
          <div>
            <p className="text-sm font-semibold text-slate-800">PAIA Review Required</p>
            <p className="text-xs text-slate-500">{referralNumber} · {patientName} · {specialty}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-lg font-bold ${riskColor}`}>{paiaResult.denialProbability}%</p>
          <p className="text-xs text-slate-400">denial risk</p>
        </div>
      </div>

      {/* Auto-fixed items */}
      {paiaResult.autoFixed.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
          <p className="text-xs font-semibold text-green-700 flex items-center gap-1.5">
            <Wrench size={12} /> Auto-fixed ({paiaResult.autoFixed.length})
          </p>
          {paiaResult.autoFixed.map((fix, i) => (
            <p key={i} className="text-xs text-green-700 flex items-center gap-1.5">
              <CheckCircle2 size={11} />
              {fix.formatted || fix.description}
            </p>
          ))}
        </div>
      )}

      {/* Issues needing human resolution */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-600">
          {paiaResult.humanWindowItems.length} issue{paiaResult.humanWindowItems.length !== 1 ? 's' : ''} need your input
        </p>
        {paiaResult.humanWindowItems.map((item, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={13} className="text-orange-500 shrink-0" />
              <p className="text-sm font-medium text-slate-800">{item.message}</p>
            </div>
            {item.detail && (
              <p className="text-xs text-slate-500 ml-5">{item.detail}</p>
            )}
            {item.suggestion && (
              <p className="text-xs text-blue-600 ml-5 flex items-center gap-1">
                <ChevronRight size={11} /> {item.suggestion}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Resolution note */}
      <textarea
        className="w-full text-xs border border-slate-200 rounded-lg p-2.5 resize-none text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        rows={2}
        placeholder="Add a note (optional) — e.g. 'Confirmed active BCBS coverage via phone verification'"
        value={note}
        onChange={e => setNote(e.target.value)}
      />

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Revenue at stake */}
      {estimatedRevenue && (
        <p className="text-xs text-slate-400">
          Revenue at stake: <span className="font-medium text-slate-600">${estimatedRevenue.toLocaleString()}</span>
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => handleResolve('confirmed')}
          disabled={resolving}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-4 py-2.5 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60"
        >
          {resolving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          I've verified — submit now
        </button>
        <button
          onClick={() => handleResolve('override')}
          disabled={resolving}
          className="flex-1 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg px-4 py-2.5 border border-slate-200 transition-colors disabled:opacity-60"
        >
          Override &amp; submit anyway
        </button>
      </div>

      <p className="text-xs text-slate-400 text-center">
        Analyzed in {paiaResult.analyzedInMs}ms · {paiaResult.payerName}
      </p>
    </div>
  )
}
