import { serverApi } from '@/lib/server-api'
import { type Referral } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'
import Link from 'next/link'
import { format } from 'date-fns'
import { ShieldCheck, ShieldX, Clock, AlertTriangle } from 'lucide-react'

async function getReferralsWithAuth(): Promise<Referral[]> {
  try {
    const data = await serverApi.get<{ data: Referral[] }>('/v1/referrals?limit=100')
    return (data.data ?? []).filter((r) => r.requiresAuth || r.authorization)
  } catch {
    return []
  }
}

const authStatusIcon: Record<string, typeof ShieldCheck> = {
  APPROVED: ShieldCheck,
  PARTIALLY_APPROVED: ShieldCheck,
  DENIED: ShieldX,
  PENDING: Clock,
  IN_REVIEW: Clock,
  SUBMITTED: Clock,
  APPEALED: AlertTriangle,
}

const authStatusColor: Record<string, string> = {
  APPROVED: 'text-green-600',
  PARTIALLY_APPROVED: 'text-yellow-600',
  DENIED: 'text-red-600',
  PENDING: 'text-blue-500',
  IN_REVIEW: 'text-yellow-500',
  SUBMITTED: 'text-blue-600',
  APPEALED: 'text-orange-600',
}

export default async function AuthorizationsPage() {
  const referrals = await getReferralsWithAuth()

  const stats = {
    total: referrals.length,
    approved: referrals.filter((r) => r.authorization?.status === 'APPROVED').length,
    denied: referrals.filter((r) => r.authorization?.status === 'DENIED').length,
    pending: referrals.filter((r) =>
      ['PENDING', 'SUBMITTED', 'IN_REVIEW'].includes(r.authorization?.status ?? '')
    ).length,
  }

  return (
    <div>
      <div className="bg-white border-b border-stone-200 px-6 py-4">
        <h1 className="text-lg font-semibold">Prior Authorizations</h1>
        <p className="text-sm text-slate-500">Da Vinci PAS — CMS-0057-F compliant</p>
      </div>

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total Auth Required', value: stats.total, cls: 'text-slate-800' },
            { label: 'Approved', value: stats.approved, cls: 'text-green-700' },
            { label: 'Pending / In Review', value: stats.pending, cls: 'text-blue-700' },
            { label: 'Denied', value: stats.denied, cls: 'text-red-700' },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-white rounded-xl border border-stone-200 p-4">
              <p className="text-xs text-slate-500 mb-1">{label}</p>
              <p className={`text-2xl font-bold ${cls}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50">
                {['Referral', 'Patient', 'Specialty', 'Referral Status', 'Auth Status', 'Auth #', 'Expires'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {referrals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-300 text-sm">
                    No authorizations yet.
                  </td>
                </tr>
              ) : (
                referrals.map((r) => {
                  const auth = r.authorization
                  const Icon = auth ? (authStatusIcon[auth.status] ?? Clock) : Clock
                  const iconCls = auth ? (authStatusColor[auth.status] ?? 'text-slate-400') : 'text-slate-300'
                  return (
                    <tr key={r.id} className="hover:bg-stone-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/referrals/${r.id}`} className="font-mono text-blue-600 hover:underline text-xs">
                          {r.referralNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{r.specialty}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3">
                        {auth ? (
                          <div className="flex items-center gap-1.5">
                            <Icon size={13} className={iconCls} />
                            <span className={`text-xs font-medium ${iconCls}`}>{auth.status}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {auth?.authNumber ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {auth?.expiresAt ? format(new Date(auth.expiresAt), 'MMM d, yyyy') : '—'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* CMS-0057-F notice */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-500">
          <strong className="text-slate-700">CMS-0057-F Compliance</strong> — All payers must expose
          FHIR-based Prior Authorization APIs by January 2027. Plerous implements the Da Vinci PAS
          Implementation Guide (FHIR R4) for compliant PA submission and tracking.
        </div>
      </div>
    </div>
  )
}
