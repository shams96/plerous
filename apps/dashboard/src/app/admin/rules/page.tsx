'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit2, Power, ChevronDown, ChevronRight, Save, X, AlertCircle, Check } from 'lucide-react'
import { authFetch } from '@/lib/session'

interface Criterion {
  id: string
  label: string
  autoExtractable: boolean
  pattern?: string
}

interface PolicyRule {
  id: string
  cptCode: string
  paRequired: boolean
  isActive: boolean
  denialRateBaseline: number | null
  denialCount: number
  submissionCount: number
  sourceName: string | null
  sourceUrl: string | null
  notes: string | null
  criteria: { required: Criterion[]; preferred: Criterion[] }
  payer: { name: string; tradingPartnerServiceId: string } | null
  createdBy: string | null
  updatedBy: string | null
  updatedAt: string
}

export default function PolicyRulesPage() {
  const [rules,    setRules]    = useState<PolicyRule[]>([])
  const [loading,  setLoading]  = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing,  setEditing]  = useState<PolicyRule | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null)

  useEffect(() => { loadRules() }, [])

  async function loadRules() {
    setLoading(true)
    try {
      const data = await authFetch<{ data: PolicyRule[] }>('/v1/admin/policy-rules')
      setRules(data.data)
    } finally {
      setLoading(false)
    }
  }

  async function saveRule() {
    if (!editing) return
    setSaving(true)
    try {
      await authFetch(`/v1/admin/policy-rules/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          paRequired:          editing.paRequired,
          criteria:            editing.criteria,
          denialRateBaseline:  editing.denialRateBaseline,
          sourceName:          editing.sourceName,
          sourceUrl:           editing.sourceUrl,
          notes:               editing.notes,
          reason:              'Manual admin edit',
        }),
      })
      setToast({ msg: `Rule ${editing.cptCode} saved`, ok: true })
      setEditing(null)
      loadRules()
    } catch (e: unknown) {
      setToast({ msg: e instanceof Error ? e.message : 'Save failed', ok: false })
    } finally {
      setSaving(false)
      setTimeout(() => setToast(null), 3000)
    }
  }

  async function toggleActive(rule: PolicyRule) {
    const reason = rule.isActive
      ? prompt('Reason for deactivating this rule?')
      : 'Re-activated by admin'
    if (rule.isActive && !reason) return

    try {
      if (rule.isActive) {
        await authFetch(`/v1/admin/policy-rules/${rule.id}`, {
          method: 'DELETE',
          body: JSON.stringify({ reason }),
        })
      } else {
        await authFetch(`/v1/admin/policy-rules/${rule.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isActive: true, reason: 'Re-activated by admin' }),
        })
      }
      loadRules()
    } catch (e: unknown) {
      setToast({ msg: e instanceof Error ? e.message : 'Failed', ok: false })
      setTimeout(() => setToast(null), 3000)
    }
  }

  const grouped = rules.reduce<Record<string, PolicyRule[]>>((acc, r) => {
    const key = r.payer?.name ?? 'Universal (all payers)'
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {})

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Policy Rules</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Payer-specific prior auth criteria. PAIA reads these at runtime — changes take effect immediately.
          </p>
        </div>
        <div className="text-xs text-slate-500">
          {rules.filter(r => r.isActive).length} active rules
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([payerName, payerRules]) => (
            <div key={payerName}>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">
                {payerName}
              </h2>
              <div className="space-y-2">
                {payerRules.map(rule => (
                  <div
                    key={rule.id}
                    className={`bg-slate-900 border rounded-xl overflow-hidden transition-colors ${
                      rule.isActive ? 'border-slate-800' : 'border-slate-800 opacity-50'
                    }`}
                  >
                    {/* Rule header */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-800/50"
                      onClick={() => setExpanded(expanded === rule.id ? null : rule.id)}
                    >
                      <span className="font-mono text-sm font-bold text-blue-400 w-16 shrink-0">
                        {rule.cptCode}
                      </span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        rule.paRequired ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'
                      }`}>
                        {rule.paRequired ? 'PA Required' : 'No PA'}
                      </span>
                      {rule.denialRateBaseline !== null && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          rule.denialRateBaseline > 0.3 ? 'bg-red-500/20 text-red-400' :
                          rule.denialRateBaseline > 0.15 ? 'bg-orange-500/20 text-orange-400' :
                          'bg-slate-700 text-slate-400'
                        }`}>
                          {(rule.denialRateBaseline * 100).toFixed(0)}% denial baseline
                          {rule.submissionCount > 0 && (
                            <span className="opacity-60 ml-1">
                              ({rule.denialCount}/{rule.submissionCount})
                            </span>
                          )}
                        </span>
                      )}
                      {rule.sourceName && (
                        <span className="text-xs text-slate-500 ml-auto">{rule.sourceName}</span>
                      )}
                      <div className="flex items-center gap-2 ml-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditing({ ...rule }) }}
                          className="text-slate-500 hover:text-blue-400 transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleActive(rule) }}
                          className={`transition-colors ${rule.isActive ? 'text-green-500 hover:text-red-400' : 'text-slate-600 hover:text-green-400'}`}
                          title={rule.isActive ? 'Deactivate' : 'Activate'}
                        >
                          <Power size={13} />
                        </button>
                        {expanded === rule.id ? <ChevronDown size={13} className="text-slate-500" /> : <ChevronRight size={13} className="text-slate-500" />}
                      </div>
                    </div>

                    {/* Expanded criteria */}
                    {expanded === rule.id && (
                      <div className="px-4 pb-4 pt-0 border-t border-slate-800 space-y-3">
                        {rule.criteria.required.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-slate-400 mb-1.5">Required criteria</p>
                            <div className="space-y-1">
                              {rule.criteria.required.map((c, i) => (
                                <div key={i} className="flex items-start gap-2 text-xs">
                                  <span className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                                    c.autoExtractable ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'
                                  }`}>
                                    {c.autoExtractable ? '✦' : '!'}
                                  </span>
                                  <div>
                                    <span className="text-slate-300">{c.label}</span>
                                    {c.pattern && <span className="text-slate-500 ml-1">({c.pattern})</span>}
                                    <span className="text-slate-600 ml-1">
                                      {c.autoExtractable ? '· auto-extractable' : '· manual review required'}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {rule.criteria.preferred.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-slate-400 mb-1.5">Preferred (advisory)</p>
                            <div className="space-y-1">
                              {rule.criteria.preferred.map((c, i) => (
                                <div key={i} className="text-xs text-slate-500">· {c.label}</div>
                              ))}
                            </div>
                          </div>
                        )}
                        {rule.notes && (
                          <p className="text-xs text-slate-500 italic border-t border-slate-800 pt-2">{rule.notes}</p>
                        )}
                        <p className="text-xs text-slate-600">
                          Last updated by {rule.updatedBy || rule.createdBy || 'system'} · {new Date(rule.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit drawer */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-end">
          <div className="w-full max-w-lg h-full bg-slate-900 border-l border-slate-800 overflow-auto p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-white">Edit rule: {editing.cptCode}</h2>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-slate-400">PA Required</label>
                <button
                  onClick={() => setEditing(e => e ? { ...e, paRequired: !e.paRequired } : e)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                    editing.paRequired ? 'bg-orange-500/30 text-orange-400' : 'bg-green-500/30 text-green-400'
                  }`}
                >
                  {editing.paRequired ? 'Yes — requires PA' : 'No PA needed'}
                </button>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Denial rate baseline</label>
                <input
                  type="number" min="0" max="1" step="0.01"
                  value={editing.denialRateBaseline ?? ''}
                  onChange={e => setEditing(ed => ed ? { ...ed, denialRateBaseline: parseFloat(e.target.value) } : ed)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="0.00 – 1.00"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Source name</label>
                <input
                  type="text"
                  value={editing.sourceName ?? ''}
                  onChange={e => setEditing(ed => ed ? { ...ed, sourceName: e.target.value } : ed)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="BCBS TX MP-2.04.22, CMS LCD L33212…"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Source URL</label>
                <input
                  type="url"
                  value={editing.sourceUrl ?? ''}
                  onChange={e => setEditing(ed => ed ? { ...ed, sourceUrl: e.target.value } : ed)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="https://…"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Notes</label>
                <textarea
                  value={editing.notes ?? ''}
                  onChange={e => setEditing(ed => ed ? { ...ed, notes: e.target.value } : ed)}
                  rows={3}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  placeholder="Internal notes for this rule…"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-2">
                  Required criteria (JSON)
                  <span className="text-slate-600 ml-1 font-normal">— edit with care</span>
                </label>
                <textarea
                  value={JSON.stringify(editing.criteria, null, 2)}
                  onChange={e => {
                    try {
                      const parsed = JSON.parse(e.target.value)
                      setEditing(ed => ed ? { ...ed, criteria: parsed } : ed)
                    } catch { /* ignore while typing */ }
                  }}
                  rows={12}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-green-300 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={saveRule}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg py-2.5 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : <><Save size={14} /> Save changes</>}
              </button>
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium shadow-lg ${
          toast.ok ? 'bg-green-900 text-green-300 border border-green-700' : 'bg-red-900 text-red-300 border border-red-700'
        }`}>
          {toast.ok ? <Check size={14} /> : <AlertCircle size={14} />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}
