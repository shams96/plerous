'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Unlock, ExternalLink, Loader2 } from 'lucide-react'
import { authFetch } from '@/lib/session'
import Link from 'next/link'
import { format } from 'date-fns'

const STATUS_COLOR: Record<string, string> = {
  DRAFT:         'text-slate-400 bg-slate-800',
  PAIA_REVIEW:   'text-orange-400 bg-orange-400/10',
  SUBMITTED:     'text-blue-400 bg-blue-400/10',
  AUTH_PENDING:  'text-yellow-400 bg-yellow-400/10',
  AUTH_APPROVED: 'text-green-400 bg-green-400/10',
  AUTH_DENIED:   'text-red-400 bg-red-400/10',
  SCHEDULED:     'text-teal-400 bg-teal-400/10',
  COMPLETED:     'text-green-300 bg-green-300/10',
  CANCELLED:     'text-slate-500 bg-slate-800',
}

const STATUSES = ['', 'DRAFT','PAIA_REVIEW','SUBMITTED','AUTH_PENDING','AUTH_APPROVED','AUTH_DENIED','SCHEDULED','COMPLETED','CANCELLED']

interface Referral {
  id: string
  referralNumber: string
  status: string
  specialty: string
  createdAt: string
  patient: { firstName: string; lastName: string }
  sendingOrg: { name: string }
  referringProvider: { firstName: string; lastName: string }
  authorization?: { status: string; authNumber?: string }
  paiaAnalyses: Array<{ decision: string; denialProbability: number }>
}

export default function AdminReferralsPage() {
  const [referrals,  setReferrals]  = useState<Referral[]>([])
  const [total,      setTotal]      = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [statusFilter, setStatus]  = useState('')
  const [unlocking,  setUnlocking]  = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = statusFilter ? `?status=${statusFilter}&limit=100` : '?limit=100'
      const data = await authFetch<{ data: Referral[]; total: number }>(`/v1/admin/referrals${qs}`)
      setReferrals(data.data)
      setTotal(data.total)
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  async function handleUnlock(referral: Referral) {
    const reason = prompt(`Force-submit "${referral.referralNumber}"?\n\nReason (required):`)
    if (!reason?.trim()) return
    setUnlocking(referral.id)
    try {
      await authFetch(`/v1/admin/referrals/${referral.id}/unlock`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed')
    } finally {
      setUnlocking(null)
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">All Referrals</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} total across all organizations</p>
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatus(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {STATUSES.map(s => <option key={s} value={s}>{s || 'All statuses'}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Referral</th>
                <th className="text-left px-4 py-3">Patient</th>
                <th className="text-left px-4 py-3">Org</th>
                <th className="text-left px-4 py-3">Specialty</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">PAIA</th>
                <th className="text-left px-4 py-3">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {referrals.map(r => {
                const paia = r.paiaAnalyses?.[0]
                return (
                  <tr key={r.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/referrals/${r.id}`} className="font-mono text-xs text-blue-400 hover:underline flex items-center gap-1">
                        {r.referralNumber} <ExternalLink size={10} />
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs">
                      {r.patient.firstName} {r.patient.lastName}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-32 truncate">
                      {r.sendingOrg.name}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{r.specialty}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[r.status] || 'text-slate-400 bg-slate-800'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {paia ? (
                        <span className={`text-xs ${
                          paia.decision === 'auto_submit'  ? 'text-green-400' :
                          paia.decision === 'human_window' ? 'text-orange-400' :
                          paia.decision === 'hard_stop'    ? 'text-red-400' :
                          'text-slate-500'
                        }`}>
                          {paia.decision} · {paia.denialProbability?.toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {format(new Date(r.createdAt), 'MMM d, HH:mm')}
                    </td>
                    <td className="px-4 py-3">
                      {['PAIA_REVIEW', 'DRAFT'].includes(r.status) && (
                        <button
                          onClick={() => handleUnlock(r)}
                          disabled={unlocking === r.id}
                          className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 disabled:opacity-50"
                          title="Force submit (admin override)"
                        >
                          {unlocking === r.id
                            ? <Loader2 size={11} className="animate-spin" />
                            : <Unlock size={11} />
                          }
                          unlock
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {referrals.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-600 text-sm">
                    No referrals found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
