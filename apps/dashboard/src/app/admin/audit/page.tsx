'use client'

import { useState, useEffect } from 'react'
import { authFetch } from '@/lib/session'
import { ScrollText, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'

interface AuditEntry {
  id: string
  action: string
  resource: string
  resourceId: string
  userId?: string
  metadata?: Record<string, unknown>
  createdAt: string
}

interface AdminAction {
  id: string
  adminId: string
  action: string
  targetType: string
  targetId: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  reason?: string
  ipAddress?: string
  createdAt: string
}

const ACTION_COLOR: Record<string, string> = {
  PAIA_ANALYSIS:       'text-blue-400',
  PAIA_DENIAL_MISS:    'text-red-400',
  SUBMIT_REFERRAL:     'text-green-400',
  CANCEL_REFERRAL:     'text-orange-400',
  CREATE_REFERRAL:     'text-slate-400',
  SCHEDULE_REFERRAL:   'text-teal-400',
}

export default function AuditLogPage() {
  const [entries,  setEntries]  = useState<AuditEntry[]>([])
  const [actions,  setActions]  = useState<AdminAction[]>([])
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState<'system' | 'admin'>('system')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [auditData, actionData] = await Promise.all([
        authFetch<{ data: AuditEntry[] }>('/v1/admin/audit?limit=100'),
        authFetch<{ data: AdminAction[] }>('/v1/admin/admin-actions?limit=100'),
      ])
      setEntries(auditData.data)
      setActions(actionData.data)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <ScrollText size={18} className="text-slate-400" />
        <div>
          <h1 className="text-lg font-bold text-white">Audit Log</h1>
          <p className="text-sm text-slate-500 mt-0.5">HIPAA-compliant event trail</p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 w-fit">
        {(['system', 'admin'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              tab === t ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t === 'system' ? `System Events (${entries.length})` : `Admin Actions (${actions.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : tab === 'system' ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Action</th>
                <th className="text-left px-4 py-3">Resource</th>
                <th className="text-left px-4 py-3">Resource ID</th>
                <th className="text-left px-4 py-3">Timestamp</th>
                <th className="px-4 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {entries.map(e => (
                <>
                  <tr
                    key={e.id}
                    className="hover:bg-slate-800/50 cursor-pointer"
                    onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                  >
                    <td className="px-4 py-3">
                      <span className={`text-xs font-mono font-semibold ${ACTION_COLOR[e.action] ?? 'text-slate-400'}`}>
                        {e.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{e.resource}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-500 truncate max-w-40">
                      {e.resourceId.substring(0, 8)}…
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {format(new Date(e.createdAt), 'MMM d, HH:mm:ss')}
                    </td>
                    <td className="px-4 py-3">
                      {expanded === e.id
                        ? <ChevronDown size={12} className="text-slate-500" />
                        : <ChevronRight size={12} className="text-slate-500" />
                      }
                    </td>
                  </tr>
                  {expanded === e.id && e.metadata && (
                    <tr key={`${e.id}-detail`} className="bg-slate-800/30">
                      <td colSpan={5} className="px-4 py-3">
                        <pre className="text-xs text-slate-400 font-mono whitespace-pre-wrap break-all">
                          {JSON.stringify(e.metadata, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-600 text-sm">No events yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Action</th>
                <th className="text-left px-4 py-3">Target</th>
                <th className="text-left px-4 py-3">Reason</th>
                <th className="text-left px-4 py-3">IP</th>
                <th className="text-left px-4 py-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {actions.map(a => (
                <tr key={a.id} className="hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono font-semibold text-orange-400">{a.action}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {a.targetType} · <span className="font-mono">{a.targetId.substring(0, 8)}…</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-48 truncate">{a.reason ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 font-mono">{a.ipAddress ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {format(new Date(a.createdAt), 'MMM d, HH:mm:ss')}
                  </td>
                </tr>
              ))}
              {actions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-600 text-sm">No admin actions yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
