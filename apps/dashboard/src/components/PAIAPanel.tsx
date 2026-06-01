'use client'

import { useState } from 'react'
import { Shield, ShieldAlert, ShieldCheck, CheckCircle2, AlertTriangle, ChevronRight, Wrench, Clock, Loader2 } from 'lucide-react'
import { authFetch } from '@/lib/session'
import type { PAIAAnalysis } from '@/lib/api'

interface PAIAPanelProps {
  referralId: string
  referralNumber: string
  patientName: string
  specialty: string
  analyses: PAIAAnalysis[]
  status: string
}

const DECISION_META: Record<string, { label: string; icon: typeof Shield; color: string; bg: string }> = {
  submit:          { label: 'Auto-submitted',   icon: ShieldCheck,  color: 'text-green-600',  bg: 'bg-green-50 border-green-200' },
  pa_not_required: { label: 'PA not required',  icon: ShieldCheck,  color: 'text-green-600',  bg: 'bg-green-50 border-green-200' },
  human_window:    { label: 'Needs your review', icon: ShieldAlert, color: 'text-orange-500', bg: 'bg-orange-50 border-orange-200' },
  hard_stop:       { label: 'Hard stop',         icon: ShieldAlert, color: 'text-red-600',    bg: 'bg-red-50 border-red-200' },
}

function CheckRow({ check }: { check: { check: string; passed: boolean; severity: string } }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-slate-50 last:border-0">
      <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
        check.passed ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'
      }`}>
        {check.passed ? '✓' : '✗'}
      </span>
      <span className="text-xs text-slate-600 flex-1">{check.check.replace(/_/g, ' ')}</span>
      {!check.passed && (
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
          check.severity === 'hard_stop' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'
        }`}>
          {check.severity}
        </span>
      )}
    </div>
  )
}

export default function PAIAPanel({ referralId, referralNumber, patientName, specialty, analyses, status }: PAIAPanelProps) {
  const [resolving, setResolving] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [resolved, setResolved] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const latest = analyses[0]

  async function handleResolve(resolution: 'confirmed' | 'override') {
    setResolving(true)
    setError(null)
    try {
      await authFetch(`/v1/referrals/${referralId}/resolve-and-submit`, {
        method: 'POST',
        body: JSON.stringify({ resolution, note: note || undefined }),
      })
      setResolved(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to submit')
      setResolving(false)
    }
  }

  if (!latest) return null

  const meta = DECISION_META[latest.decision] || DECISION_META.human_window
  const MetaIcon = meta.icon

  // Resolved state
  if (resolved) {
    return (
      <section className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-center gap-3">
        <CheckCircle2 size={18} className="text-green-600" />
        <div>
          <p className="text-sm font-semibold text-green-800">Submitted successfully</p>
          <p className="text-xs text-green-600">Referral is now in the prior auth queue</p>
        </div>
      </section>
    )
  }

  const showReviewUI = status === 'PAIA_REVIEW' && latest.decision === 'human_window' && latest.humanWindowItems.length > 0
  const denialProb = latest.denialProbability

  return (
    <div className="space-y-3">
      {/* Active PAIA review banner */}
      {showReviewUI && (
        <section className={`rounded-xl border ${meta.bg} p-5 space-y-4`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <MetaIcon size={18} className={meta.color} />
              <div>
                <p className="text-sm font-semibold text-slate-800">PAIA Review Required</p>
                <p className="text-xs text-slate-500">{referralNumber} · {patientName} · {specialty}</p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-lg font-bold ${
                denialProb >= 70 ? 'text-red-600' : denialProb >= 40 ? 'text-orange-500' : 'text-yellow-600'
              }`}>{denialProb}%</p>
              <p className="text-xs text-slate-400">denial risk</p>
            </div>
          </div>

          {/* Auto-fixed */}
          {latest.autoFixed.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-green-700 flex items-center gap-1.5">
                <Wrench size={12} /> Auto-fixed ({latest.autoFixed.length})
              </p>
              {latest.autoFixed.map((fix, i) => (
                <p key={i} className="text-xs text-green-700 flex items-center gap-1.5">
                  <CheckCircle2 size={11} /> {fix.description}
                </p>
              ))}
            </div>
          )}

          {/* Issues */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-600">
              {latest.humanWindowItems.length} issue{latest.humanWindowItems.length !== 1 ? 's' : ''} need your input
            </p>
            {latest.humanWindowItems.map((item, i) => (
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

          <textarea
            className="w-full text-xs border border-slate-200 rounded-lg p-2.5 resize-none text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
            rows={2}
            placeholder="Add a note (optional) — e.g. 'Confirmed active BCBS coverage via phone'"
            value={note}
            onChange={e => setNote(e.target.value)}
          />

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => handleResolve('confirmed')}
              disabled={resolving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-4 py-2.5 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60"
            >
              {resolving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              I&apos;ve verified — submit now
            </button>
            <button
              onClick={() => handleResolve('override')}
              disabled={resolving}
              className="flex-1 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg px-4 py-2.5 border border-slate-200 transition-colors disabled:opacity-60"
            >
              Override &amp; submit anyway
            </button>
          </div>

          {latest.analyzedInMs && (
            <p className="text-xs text-slate-400 text-center flex items-center justify-center gap-1">
              <Clock size={10} /> Analyzed in {latest.analyzedInMs}ms
            </p>
          )}
        </section>
      )}

      {/* PAIA history */}
      <section className="bg-white rounded-xl border border-stone-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
          <Shield size={14} /> PAIA Analysis History
        </h2>
        <div className="space-y-2">
          {analyses.map(a => {
            const m = DECISION_META[a.decision] || DECISION_META.human_window
            const Icon = m.icon
            const isOpen = expanded === a.id
            return (
              <div key={a.id} className="border border-slate-100 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : a.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors"
                >
                  <Icon size={13} className={m.color} />
                  <span className={`text-xs font-semibold ${m.color}`}>{m.label}</span>
                  <span className="text-xs text-slate-400 ml-auto">
                    {a.denialProbability}% denial risk · {new Date(a.createdAt).toLocaleString()}
                  </span>
                  <ChevronRight size={12} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 space-y-2 border-t border-slate-100">
                    <div className="grid grid-cols-3 gap-2 pt-2">
                      <div className="text-center">
                        <p className="text-xs text-slate-500">Confidence</p>
                        <p className="text-sm font-bold text-slate-700">{a.confidence}%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-slate-500">Denial Risk</p>
                        <p className={`text-sm font-bold ${a.denialProbability >= 70 ? 'text-red-600' : a.denialProbability >= 40 ? 'text-orange-500' : 'text-green-600'}`}>
                          {a.denialProbability}%
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-slate-500">Checks</p>
                        <p className="text-sm font-bold text-slate-700">{a.checksRun.length}</p>
                      </div>
                    </div>
                    {a.checksRun.length > 0 && (
                      <div className="mt-2">
                        {a.checksRun.map((c, i) => <CheckRow key={i} check={c} />)}
                      </div>
                    )}
                    {a.resolution && (
                      <div className="bg-slate-50 rounded p-2 mt-2">
                        <p className="text-xs font-semibold text-slate-500">Resolution: <span className="text-slate-700">{a.resolution}</span></p>
                        {a.resolutionNote && <p className="text-xs text-slate-500 mt-0.5">{a.resolutionNote}</p>}
                      </div>
                    )}
                    {a.auditHash && (
                      <p className="text-xs text-slate-400 font-mono truncate">hash: {a.auditHash.substring(0, 16)}…</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
