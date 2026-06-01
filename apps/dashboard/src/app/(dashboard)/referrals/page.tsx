import { serverApi } from '@/lib/server-api'
import { type Referral } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'
import DailyBrief from '@/components/DailyBrief'
import Link from 'next/link'
import { Plus, AlertTriangle, Shield, ShieldAlert } from 'lucide-react'
import { format } from 'date-fns'

async function getReferrals(): Promise<Referral[]> {
  try {
    const data = await serverApi.get<{ data: Referral[] }>('/v1/referrals?limit=50')
    return data.data ?? []
  } catch {
    return []
  }
}

const urgencyColor: Record<string, string> = {
  STAT: 'text-red-600',
  EMERGENCY: 'text-red-700 font-bold',
  URGENT: 'text-orange-600',
  ROUTINE: 'text-slate-500',
}

export default async function ReferralsPage() {
  const referrals = await getReferrals()

  return (
    <div>
      {/* Page header */}
      <div className="bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Referrals</h1>
          <p className="text-sm text-slate-500">{referrals.length} total</p>
        </div>
        <Link
          href="/referrals/new"
          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
        >
          <Plus size={14} />
          New Referral
        </Link>
      </div>

      {/* Daily Brief — appears above the referral list */}
      <div className="px-6 pt-4">
        <DailyBrief />
      </div>

      {/* Table */}
      <div className="px-6 pb-6">
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Referral #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Patient
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Specialty
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Urgency
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                  PAIA
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Risk Score
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {referrals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    No referrals yet. Create your first referral to get started.
                  </td>
                </tr>
              ) : (
                referrals.map((r) => (
                  <tr key={r.id} className="hover:bg-stone-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/referrals/${r.id}`}
                        className="font-mono text-blue-600 hover:underline text-xs"
                      >
                        {r.referralNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {r.patient
                        ? `${r.patient.firstName} ${r.patient.lastName}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{r.specialty}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className={`px-4 py-3 text-xs font-medium ${urgencyColor[r.urgency] ?? ''}`}>
                      {r.urgency}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const paia = r.paiaAnalyses?.[0]
                        if (!paia) return <span className="text-slate-300 text-xs">—</span>
                        if (paia.decision === 'human_window') {
                          return (
                            <span className="flex items-center gap-1 text-xs font-medium text-orange-500">
                              <ShieldAlert size={12} /> {paia.denialProbability}%
                            </span>
                          )
                        }
                        if (paia.decision === 'submit' || paia.decision === 'pa_not_required') {
                          return (
                            <span className="flex items-center gap-1 text-xs text-green-500">
                              <Shield size={12} /> clear
                            </span>
                          )
                        }
                        return <span className="text-xs text-slate-400">{paia.decision}</span>
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      {r.riskScore != null ? (
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-medium ${
                            r.riskScore >= 70
                              ? 'text-red-600'
                              : r.riskScore >= 40
                              ? 'text-yellow-600'
                              : 'text-green-600'
                          }`}
                        >
                          {r.riskScore >= 70 && <AlertTriangle size={11} />}
                          {r.riskScore.toFixed(0)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {format(new Date(r.createdAt), 'MMM d, yyyy')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
