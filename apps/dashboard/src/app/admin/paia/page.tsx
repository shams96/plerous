'use client'

import { useState, useEffect, useCallback } from 'react'
import { authFetch } from '@/lib/session'
import { Shield, ShieldCheck, ShieldAlert, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { format } from 'date-fns'

interface CheckRun {
  check: string
  passed: boolean
  severity: string
}

interface PAIARecord {
  id: string
  referralId: string
  decision: string
  confidence: number
  denialProbability: number
  humanWindowItems: Array<{ checkId: string; message: string; severity: string }>
  autoFixed: Array<{ description: string }>
  checksRun: CheckRun[]
  auditHash?: string
  analyzedInMs?: number
  resolution?: string
  resolutionNote?: string
  resolvedAt?: string
  createdAt: string
  referral?: { referralNumber: string; status: string; specialty: string; patient?: { firstName: string; lastName: string } }
}

const DECISION_META: Record<string, { label: string; color: string }> = {
  submit:          { label: 'Auto-submitted',   color: 'text-green-400' },
  pa_not_required: { label: 'PA not required',  color: 'text-green-400' },
  human_window:    { label: 'Human window',     color: 'text-orange-400' },
  hard_stop:       { label: 'Hard stop',        color: 'text-red-400' },
}

export default function PAIAAnalysesPage() {
  const [records,  setRecords]  = useState<PAIARecord[]>([])
  const [total,    setTotal]    = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = filter ? `?decision=${filter}&limit=100` : '?limit=100'
      const data = await authFetch<{ data: PAIARecord[]; total: number }>(`/v1/admin/paia${qs}`)
      setRecords(data.data)
      setTotal(data.total)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  const decisions = ['', 'submit', 'pa_not_required', 'human_window', 'hard_stop']

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">PAIA Analyses</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} total analyses · full audit trail</p>
        </div>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {decisions.map(d => (
            <option key={d} value={d}>{d ? DECISION_META[d]?.label ?? d : 'All decisions'}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {records.map(r => {
            const meta = DECISION_META[r.decision] ?? { label: r.decision, color: 'text-slate-400' }
            const isOpen = expanded === r.id
            const passedChecks = r.checksRun.filter(c => c.passed).length

            return (
              <div key={r.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/50 transition-colors"
                >
                  {r.decision === 'submit' || r.decision === 'pa_not_required'
                    ? <ShieldCheck size={14} className="text-green-400 shrink-0" />
                    : <ShieldAlert size={14} className="text-orange-400 shrink-0" />
                  }
                  <span className={`text-xs font-semibold w-32 shrink-0 ${meta.color}`}>{meta.label}</span>
                  <span className="text-xs text-slate-400 font-mono">
                    {r.referral?.referralNumber ?? r.referralId.substring(0, 8)}
                  </span>
                  {r.referral?.patient && (
                    <span className="text-xs text-slate-500">
                      {r.referral.patient.firstName} {r.referral.patient.lastName}
                    </span>
                  )}
                  <span className={`ml-auto text-xs font-semibold ${
                    r.denialProbability >= 70 ? 'text-red-400' :
                    r.denialProbability >= 40 ? 'text-orange-400' : 'text-green-400'
                  }`}>
                    {r.denialProbability}% denial risk
                  </span>
                  <span className="text-xs text-slate-600 ml-4">
                    {format(new Date(r.createdAt), 'MMM d, HH:mm')}
                  </span>
                  {isOpen
                    ? <ChevronDown size={12} className="text-slate-500 shrink-0" />
                    : <ChevronRight size={12} className="text-slate-500 shrink-0" />
                  }
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-slate-800 space-y-4 pt-4">
                    <div className="grid grid-cols-4 gap-3">
                      <div className="bg-slate-800 rounded-lg p-3">
                        <p className="text-xs text-slate-500">Confidence</p>
                        <p className="text-lg font-bold text-white">{r.confidence}%</p>
                      </div>
                      <div className="bg-slate-800 rounded-lg p-3">
                        <p className="text-xs text-slate-500">Denial Risk</p>
                        <p className={`text-lg font-bold ${
                          r.denialProbability >= 70 ? 'text-red-400' :
                          r.denialProbability >= 40 ? 'text-orange-400' : 'text-green-400'
                        }`}>{r.denialProbability}%</p>
                      </div>
                      <div className="bg-slate-800 rounded-lg p-3">
                        <p className="text-xs text-slate-500">Checks Passed</p>
                        <p className="text-lg font-bold text-white">{passedChecks}/{r.checksRun.length}</p>
                      </div>
                      <div className="bg-slate-800 rounded-lg p-3">
                        <p className="text-xs text-slate-500">Analysis Time</p>
                        <p className="text-lg font-bold text-white">{r.analyzedInMs ?? '—'}ms</p>
                      </div>
                    </div>

                    {r.checksRun.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-400 mb-2">Checks</p>
                        <div className="space-y-1">
                          {r.checksRun.map((c, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs ${
                                c.passed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                              }`}>{c.passed ? '✓' : '✗'}</span>
                              <span className="text-slate-400">{c.check.replace(/_/g, ' ')}</span>
                              {!c.passed && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                                  {c.severity}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {r.humanWindowItems.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-400 mb-2">Human Window Items</p>
                        {r.humanWindowItems.map((item, i) => (
                          <div key={i} className="bg-slate-800 rounded p-2 mb-1">
                            <p className="text-xs text-slate-300">{item.message}</p>
                            <p className="text-xs text-slate-500">{item.checkId} · {item.severity}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {r.autoFixed.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-400 mb-2">Auto-fixed</p>
                        {r.autoFixed.map((f, i) => (
                          <p key={i} className="text-xs text-green-400">✓ {f.description}</p>
                        ))}
                      </div>
                    )}

                    {r.resolution && (
                      <div className="bg-slate-800 rounded-lg p-3">
                        <p className="text-xs font-semibold text-slate-400">Resolution: <span className="text-slate-200">{r.resolution}</span></p>
                        {r.resolutionNote && <p className="text-xs text-slate-400 mt-1">{r.resolutionNote}</p>}
                        {r.resolvedAt && (
                          <p className="text-xs text-slate-500 mt-1">
                            Resolved {format(new Date(r.resolvedAt), 'MMM d, yyyy HH:mm')}
                          </p>
                        )}
                      </div>
                    )}

                    {r.auditHash && (
                      <p className="text-xs text-slate-600 font-mono">
                        <Shield size={10} className="inline mr-1" />
                        {r.auditHash}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {records.length === 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-600 text-sm">
              No PAIA analyses yet
            </div>
          )}
        </div>
      )}
    </div>
  )
}
