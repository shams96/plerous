import { serverApi } from '@/lib/server-api'
import { Building2, Users, FileText, Shield, ShieldAlert, TrendingDown } from 'lucide-react'
import Link from 'next/link'

async function getStats() {
  try {
    return await serverApi.get<any>('/v1/admin/stats')
  } catch {
    return null
  }
}

function StatCard({ label, value, icon: Icon, href, color = 'blue' }: {
  label: string
  value: number | string
  icon: React.ElementType
  href?: string
  color?: string
}) {
  const colorMap: Record<string, string> = {
    blue:   'text-blue-400 bg-blue-400/10',
    green:  'text-green-400 bg-green-400/10',
    orange: 'text-orange-400 bg-orange-400/10',
    red:    'text-red-400 bg-red-400/10',
    purple: 'text-purple-400 bg-purple-400/10',
  }
  const card = (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value ?? '—'}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  )
  return href ? <Link href={href}>{card}</Link> : card
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT:         'text-slate-400',
  PAIA_REVIEW:   'text-orange-400',
  SUBMITTED:     'text-blue-400',
  AUTH_PENDING:  'text-yellow-400',
  AUTH_APPROVED: 'text-green-400',
  AUTH_DENIED:   'text-red-400',
  SCHEDULED:     'text-teal-400',
  COMPLETED:     'text-green-300',
  CANCELLED:     'text-slate-500',
  EXPIRED:       'text-slate-500',
}

export default async function AdminOverviewPage() {
  const stats = await getStats()
  const c = stats?.counts || {}
  const byStatus = stats?.referralsByStatus || {}
  const byDecision = stats?.paiaByDecision || {}
  const denialRate = stats?.denialRate

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-lg font-bold text-white">System Overview</h1>
        <p className="text-sm text-slate-500 mt-0.5">Live counts across all organizations</p>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Organizations" value={c.orgCount}      icon={Building2}  href="/admin/orgs"      color="blue"   />
        <StatCard label="Providers"     value={c.providerCount} icon={Users}      color="purple" />
        <StatCard label="Patients"      value={c.patientCount}  icon={Users}      color="green"  />
        <StatCard label="Referrals"     value={c.referralCount} icon={FileText}   href="/admin/referrals" color="blue"   />
        <StatCard label="PAIA Analyses" value={c.paiaCount}     icon={Shield}     href="/admin/paia"      color="orange" />
        <StatCard label="Policy Rules"  value={c.ruleCount}     icon={Shield}     href="/admin/rules"     color="purple" />
      </div>

      {denialRate !== null && (
        <div className={`flex items-center gap-3 rounded-xl border p-4 ${
          denialRate > 0.3 ? 'bg-red-950/40 border-red-800' :
          denialRate > 0.15 ? 'bg-orange-950/40 border-orange-800' :
          'bg-green-950/40 border-green-800'
        }`}>
          <TrendingDown size={18} className={denialRate > 0.15 ? 'text-red-400' : 'text-green-400'} />
          <div>
            <p className="text-sm font-semibold text-white">
              Denial rate: {(denialRate * 100).toFixed(1)}%
            </p>
            <p className="text-xs text-slate-400">
              Across all submitted referrals · Target: &lt;10%
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Referrals by status */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Referrals by status</h2>
          <div className="space-y-2">
            {Object.entries(byStatus).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between text-sm">
                <span className={`font-mono text-xs ${STATUS_COLOR[status] || 'text-slate-400'}`}>{status}</span>
                <span className="font-semibold text-white">{count as number}</span>
              </div>
            ))}
            {Object.keys(byStatus).length === 0 && <p className="text-xs text-slate-500">No data</p>}
          </div>
        </div>

        {/* PAIA decisions */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">PAIA decisions</h2>
          <div className="space-y-2">
            {Object.entries(byDecision).map(([decision, count]) => (
              <div key={decision} className="flex items-center justify-between text-sm">
                <span className={`text-xs font-mono ${
                  decision === 'auto_submit'    ? 'text-green-400'  :
                  decision === 'human_window'   ? 'text-orange-400' :
                  decision === 'hard_stop'      ? 'text-red-400'    :
                  'text-slate-400'
                }`}>
                  {decision}
                </span>
                <span className="font-semibold text-white">{count as number}</span>
              </div>
            ))}
            {Object.keys(byDecision).length === 0 && <p className="text-xs text-slate-500">No PAIA analyses yet</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
